import { present } from './helpers/financial-fixtures';

import type { SessionFixture } from './helpers/integration-fixtures';

import assert from "node:assert/strict";
import { test } from 'node:test';
import { integrationLoader as sourceLoader } from './helpers/integration-fixtures';

function client(fetcher: (url: string, init: RequestInit, count: number) => Promise<Response>, { online = true } = {}) {
  let session: SessionFixture = { user: { id: "a" }, access_token: "token-1" };
  const requests: ({ url: string; init: RequestInit; })[] = [];
  const navigator = { onLine: online };
  const load = sourceLoader({
    "@/lib/supabase": { supabase: { auth: { getSession: async () => ({ data: { session } }) } } },
  }, {
    navigator,
    fetch: (url, init) => { requests.push({ url, init }); return fetcher(url, init, requests.length); },
  });
  const recovery = load("src/lib/requestRecovery.ts");
  recovery.subscribeRecovery(() => {});
  return { apiFetch: load("src/lib/apiFetch.ts").apiFetch, recovery, requests, navigator,
    setSession(value: SessionFixture) { session = value; } };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
async function waitFor(predicate: () => unknown) {
  for (let i = 0; i < 100 && !predicate(); i++) await tick();
  assert.ok(predicate(), "No se alcanzó el estado esperado");
}
const json = (data: unknown = { ok: true }, status = 200, headers = {}) => Response.json(data, { status, headers });

test("agrupa cargas fallidas y recupera cada interacción; no duplica clics ni consume el JSON", async () => {
  let fail = true;
  const c = client(async () => fail ? json({ error: "detalle privado" }, 503) : json({ cards: ["recuperada"] }));
  const first = c.apiFetch("/api/cards?userId=a");
  const second = c.apiFetch("/api/card-cycles?userId=a");
  await waitFor(() => c.recovery.getRecoverySnapshot().items.length === 2);
  assert.doesNotMatch(present(c.recovery.getRecoverySnapshot().items[0]).message, /privado/);
  fail = false;
  await Promise.all([c.recovery.retryRecovery(), c.recovery.retryRecovery()]);
  assert.equal(c.requests.length, 4);
  assert.deepEqual(await (await first).json(), { cards: ["recuperada"] });
  assert.deepEqual(await (await second).json(), { cards: ["recuperada"] });
  assert.equal(c.recovery.getRecoverySnapshot().items.length, 0);
});

test("reintentar conserva cuerpo/propietario y renueva token; un nuevo fallo mantiene el diálogo", async () => {
  const c = client(async (_url, _init, count) => count < 3 ? json({}, 500) : json({ expense: { id: "saved" } }));
  const body = JSON.stringify({ operationId: "same-id", amount: 100 });
  const pending = c.apiFetch("/api/expenses", { method: "POST", expectedUserId: "a", body });
  await waitFor(() => c.recovery.getRecoverySnapshot().items.length === 1);
  await c.recovery.retryRecovery();
  assert.equal(c.recovery.getRecoverySnapshot().items.length, 1);
  assert.equal(c.recovery.getRecoverySnapshot().busy, false);
  assert.equal(c.recovery.getRecoverySnapshot().retryFailed, true);
  c.setSession({ user: { id: "a" }, access_token: "renewed" });
  await c.recovery.retryRecovery();
  await pending;
  assert.ok(c.requests.every(request => request.init.body === body));
  assert.equal(new Headers(present(present(c.requests[2]).init.headers)).get("authorization"), "Bearer renewed");
});

test("no reenvía altas no idempotentes cuando se pierde la respuesta o llega un 5xx", async () => {
  for (const fetcher of [async () => { throw new TypeError("Failed to fetch"); }, async () => json({}, 500)] as const) {
    const c = client(fetcher);
    const result = c.apiFetch("/api/incomes", { method: "POST", body: '{"amount":100}' });
    const rejected = assert.rejects(result, /duplicado/);
    await waitFor(() => c.recovery.getRecoverySnapshot().items.length);
    assert.equal(present(c.recovery.getRecoverySnapshot().items[0]).retryable, false);
    await c.recovery.retryRecovery();
    assert.equal(c.requests.length, 1);
    c.recovery.dismissRecovery();
    await rejected;
  }
});

test("un alta bloqueada antes del envío por falta de conexión sí admite reintento", async () => {
  const c = client(async () => json({ income: { id: "new" } }), { online: false });
  const result = c.apiFetch("/api/incomes", { method: "POST" });
  await waitFor(() => c.recovery.getRecoverySnapshot().items.length);
  assert.equal(c.requests.length, 0);
  assert.equal(present(c.recovery.getRecoverySnapshot().items[0]).retryable, true);
  c.navigator.onLine = true;
  await c.recovery.retryRecovery();
  assert.equal((await result).ok, true);
  assert.equal(c.requests.length, 1);
});

test("sesión vencida y cambio de cuenta nunca repiten la mutación con otro propietario", async () => {
  const c = client(async () => json({}, 503));
  const result = c.apiFetch("/api/cards", { method: "PATCH", body: "{}" });
  const rejected = assert.rejects(result, /sesión cambió/);
  await waitFor(() => c.recovery.getRecoverySnapshot().items.length);
  c.setSession({ user: { id: "b" }, access_token: "other" });
  await c.recovery.retryRecovery();
  assert.equal(c.requests.length, 1);
  assert.equal(present(c.recovery.getRecoverySnapshot().items[0]).retryable, false);
  c.recovery.dismissRecovery();
  await rejected;
  c.setSession(null);
  const expired = c.apiFetch("/api/cards");
  const expiredRejected = assert.rejects(expired, { name: "RequestError", action: "login" });
  await waitFor(() => c.recovery.getRecoverySnapshot().items.length);
  assert.equal(present(c.recovery.getRecoverySnapshot().items[0]).action, "login");
  c.recovery.dismissRecovery();
  await expiredRejected;
});

test("cancelar libera la interacción; abortar y cambiar de sección retiran los pendientes", async () => {
  for (const action of ["dismiss", "abort", "navigate"] as const) {
    const c = client(async () => json({}, 500));
    const controller = new AbortController();
    const result = c.apiFetch("/api/cards", { signal: controller.signal });
    const rejected = assert.rejects(result);
    await waitFor(() => c.recovery.getRecoverySnapshot().items.length);
    if (action === "dismiss") c.recovery.dismissRecovery();
    if (action === "abort") controller.abort();
    if (action === "navigate") c.recovery.resetRecovery();
    await rejected;
    await c.recovery.retryRecovery();
    assert.equal(c.requests.length, 1);
    assert.equal(c.recovery.getRecoverySnapshot().items.length, 0);
  }
});

test("las respuestas tardías y peticiones abortadas no abren diálogos en otra sección", async () => {
  let release: ((value: Response) => void) | undefined;
  const c = client(() => new Promise(resolve => { release = resolve; }));
  const pending = c.apiFetch("/api/cards");
  const rejected = assert.rejects(pending);
  await waitFor(() => Boolean(release));
  c.recovery.resetRecovery();
  present(release)(json({}, 503));
  await rejected;
  assert.equal(c.recovery.getRecoverySnapshot().items.length, 0);

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(c.apiFetch("/api/cards", { signal: controller.signal }), { name: "AbortError" });
  assert.equal(c.requests.length, 1);
});

test("un timeout cancela la red y se puede recuperar; JSON incompleto también informa el fallo", async () => {
  const c = client((_url, init, count) => count === 1
    ? new Promise((_resolve, reject) => present(init.signal).addEventListener("abort", () => reject(present(init.signal).reason)))
    : Promise.resolve(json()));
  const pending = c.apiFetch("/api/cards", { timeoutMs: 5 });
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(present(c.recovery.getRecoverySnapshot().items[0]).kind, "timeout");
  assert.equal(present(present(c.requests[0]).init.signal).aborted, true);
  await c.recovery.retryRecovery();
  await pending;

  const malformed = client(async () => new Response("<html>bad gateway</html>"));
  const invalid = malformed.apiFetch("/api/cards");
  const rejected = assert.rejects(invalid, { name: "RequestError", kind: "invalid" });
  await waitFor(() => malformed.recovery.getRecoverySnapshot().items.length);
  assert.equal(present(malformed.recovery.getRecoverySnapshot().items[0]).kind, "invalid");
  malformed.recovery.dismissRecovery();
  await rejected;
});

test("validación y consultas de fondo no interrumpen; permisos/conflictos explican el bloqueo", async () => {
  for (const status of [400, 422, 503] as const) {
    const c = client(async () => json({ error: "Corrige el importe." }, status));
    await assert.rejects(c.apiFetch("/api/incomes", { method: "POST", errorMode: status === 503 ? "inline" : "dialog" }));
    assert.equal(c.recovery.getRecoverySnapshot().items.length, 0);
  }
  for (const status of [401, 403, 404, 409] as const) {
    const c = client(async () => json({ error: "El registro cambió." }, status));
    const result = c.apiFetch("/api/cards");
    const rejected = assert.rejects(result);
    await waitFor(() => c.recovery.getRecoverySnapshot().items.length);
    assert.equal(present(c.recovery.getRecoverySnapshot().items[0]).retryable, false);
    await c.recovery.retryRecovery();
    assert.equal(c.requests.length, 1);
    c.recovery.dismissRecovery();
    await rejected;
  }
});

test("un bloqueo al eliminar muestra el motivo en un diálogo sin volver a enviar", async () => {
  const c = client(async () => json({ error: "Este ingreso tiene bonificaciones aplicadas a un corte." }, 400));
  const result = c.apiFetch("/api/incomes?id=linked", { method: "DELETE" });
  const rejected = assert.rejects(result, /bonificaciones/);
  await waitFor(() => c.recovery.getRecoverySnapshot().items.length);
  const error = c.recovery.getRecoverySnapshot().items[0];
  assert.equal(present(error).title, "No se puede eliminar");
  assert.equal(present(error).retryable, false);
  c.recovery.dismissRecovery();
  await rejected;
});

test("respeta Retry-After y nunca reenvía un POST exitoso al recuperar su lectura posterior", async () => {
  const limited = client(async () => json({}, 429, { "Retry-After": "30" }));
  const result = limited.apiFetch("/api/cards");
  const rejected = assert.rejects(result);
  await waitFor(() => limited.recovery.getRecoverySnapshot().items.length);
  await limited.recovery.retryRecovery();
  assert.equal(limited.requests.length, 1);
  limited.recovery.dismissRecovery();
  await rejected;

  let getCount = 0;
  const c = client(async (_url, init) => init.method === "POST" ? json({ income: { id: "saved" } })
    : ++getCount === 1 ? json({}, 503) : json({ incomes: [{ id: "saved" }] }));
  const flow = (async () => {
    await c.apiFetch("/api/incomes", { method: "POST", body: '{"amount":100}' });
    return c.apiFetch("/api/incomes", { mutationCompleted: true });
  })();
  await waitFor(() => c.recovery.getRecoverySnapshot().items.length);
  assert.match(present(present(c.recovery.getRecoverySnapshot().items[0]).hint), /ya se guardó/);
  await c.recovery.retryRecovery();
  await flow;
  assert.equal(c.requests.filter(item => item.init.method === "POST").length, 1);
  assert.equal(c.requests.length, 3);
});

test("abortar una petición en curso cancela fetch sin mostrar recuperación", async () => {
  const c = client((_url, init) => new Promise((_resolve, reject) => {
    present(init.signal).addEventListener("abort", () => reject(present(init.signal).reason));
  }));
  const controller = new AbortController();
  const result = c.apiFetch("/api/cards", { signal: controller.signal });
  const rejected = assert.rejects(result, { name: "AbortError" });
  await waitFor(() => c.requests.length === 1);
  controller.abort();
  await rejected;
  assert.equal(present(present(c.requests[0]).init.signal).aborted, true);
  assert.equal(c.recovery.getRecoverySnapshot().items.length, 0);
});

test("salir durante un reintento impide que el resultado tardío reabra el diálogo", async () => {
  let release: ((value: Response) => void) | undefined;
  const c = client(async (_url, _init, count) => count === 1 ? json({}, 503)
    : new Promise(resolve => { release = resolve; }));
  const result = c.apiFetch("/api/cards");
  const rejected = assert.rejects(result);
  await waitFor(() => c.recovery.getRecoverySnapshot().items.length);
  const retry = c.recovery.retryRecovery();
  await waitFor(() => Boolean(release));
  c.recovery.dismissRecovery();
  assert.equal(c.recovery.getRecoverySnapshot().busy, true);
  c.recovery.resetRecovery();
  await rejected;
  present(release)(json({}, 503));
  await retry;
  assert.equal(c.recovery.getRecoverySnapshot().items.length, 0);
});
