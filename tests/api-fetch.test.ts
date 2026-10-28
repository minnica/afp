import { present,uncheckedFixture } from './helpers/financial-fixtures';
import type { SessionFixture } from './helpers/integration-fixtures';
import { serviceWorkerListeners,integrationLoader as sourceLoader } from './helpers/integration-fixtures';

import { IDBFactory } from 'fake-indexeddb';
import assert from "node:assert/strict";
import { webcrypto } from 'node:crypto';
import fs from "node:fs";
import { test } from 'node:test';
import vm from "node:vm";

function client() {
  let session: SessionFixture = { user: { id: "a" }, access_token: "token-1" };
  const requests: ({ url: string; options: RequestInit; })[] = [], storage = new Map<string, string>();
  const load = sourceLoader({ "@/lib/supabase": { supabase: { auth: { getSession: async () => ({ data: { session } }) } } } }, {
    indexedDB: new IDBFactory(), crypto: webcrypto, CustomEvent,
    window: { dispatchEvent() {}, localStorage: { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value) } },
    fetch: async (url, options) => { requests.push({ url, options }); return { ok: true, json: async () => ({ expense: { id: "saved" } }) }; },
  });
  return { load, requests, setSession: (value: SessionFixture) => { session = value; } };
}

test("apiFetch usa el token vigente, preserva headers y signal, y bloquea otros orígenes", async () => {
  const { load, requests, setSession } = client();
  const { apiFetch } = load("src/lib/apiFetch.ts");
  const controller = new AbortController();
  await apiFetch("/api/expenses?userId=a", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", signal: controller.signal });
  assert.equal(new Headers(present(present(requests[0]).options.headers)).get("authorization"), "Bearer token-1");
  assert.equal(new Headers(present(present(requests[0]).options.headers)).get("content-type"), "application/json");
  assert.equal(present(present(requests[0]).options.signal).aborted, false);
  assert.equal(present(requests[0]).options.cache, "no-store");
  setSession({ user: { id: "a" }, access_token: "renewed" });
  await apiFetch("/api/cards");
  assert.equal(new Headers(present(present(requests[1]).options.headers)).get("authorization"), "Bearer renewed");
  await assert.rejects(apiFetch("https://example.test/api/expenses"), /Ruta/);
  await assert.rejects(apiFetch("//example.test/api/expenses"), /Ruta/);
  assert.equal(requests.length, 2);
});

test("apiFetch no envía nada sin sesión ni con una cuenta distinta de la pantalla", async () => {
  const { load, requests, setSession } = client();
  const { apiFetch } = load("src/lib/apiFetch.ts");
  await assert.rejects(apiFetch("/api/expenses?userId=b"), /sesión cambió/);
  await assert.rejects(apiFetch("/api/cards", { method: "DELETE", expectedUserId: "b" }), /sesión cambió/);
  setSession(null);
  await assert.rejects(apiFetch("/api/expenses"), { name: "RequestError", action: "login" });
  assert.equal(requests.length, 0);
});

test("la cola conserva los pendientes si cambia la cuenta y los sincroniza con su propietario", async () => {
  const { load, requests, setSession } = client();
  const offline = load("src/lib/offlineExpenses.ts");
  await uncheckedFixture(offline.addOfflineExpense, "a", { userId: "a", concept: "Pendiente", amount: 10 });
  setSession({ user: { id: "b" }, access_token: "token-b" });
  const blocked = await offline.syncOfflineExpenses("a");
  assert.equal(blocked.failedExpenses.length, 1);
  assert.equal((await offline.readOfflineExpenses("a")).length, 1);
  assert.equal(requests.length, 0);
  setSession({ user: { id: "a" }, access_token: "renewed-a" });
  const synced = await offline.syncOfflineExpenses("a");
  assert.equal(synced.syncedExpenses.length, 1);
  assert.equal((await offline.readOfflineExpenses("a")).length, 0);
  assert.equal(new Headers(present(present(requests[0]).options.headers)).get("authorization"), "Bearer renewed-a");
});

test("el service worker no intercepta API ni siquiera como navegación; elimina caché anterior", async () => {
  const handlers = serviceWorkerListeners(), removed: string[] = [];
  vm.runInNewContext(fs.readFileSync("public/sw.js", "utf8"), {
    URL, self: { location: { origin: "http://localhost" }, addEventListener: handlers.register, clients: { claim() {} } },
    caches: { keys: async () => ["afp-shell-v3", "afp-shell-v4"], delete: async (name: string) => { removed.push(name); } },
  });
  for (const mode of ["navigate", "cors"] as const) {
    handlers.fetch({ request: { method: "GET", mode, url: "http://localhost/api/expenses?userId=b" }, respondWith: () => assert.fail("API interceptada") });
  }
  let cleanup: Promise<unknown> | undefined;
  handlers.activate({ waitUntil: promise => { cleanup = promise; } });
  await cleanup;
  assert.deepEqual(removed, ["afp-shell-v3"]);
});
