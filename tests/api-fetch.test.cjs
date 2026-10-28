const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");
const { IDBFactory } = require("fake-indexeddb");
const { webcrypto } = require("node:crypto");
const { sourceLoader } = require("./helpers/load-source.cjs");

function client() {
  let session = { user: { id: "a" }, access_token: "token-1" };
  const requests = [], storage = new Map();
  const load = sourceLoader({ "@/lib/supabase": { supabase: { auth: { getSession: async () => ({ data: { session } }) } } } }, {
    indexedDB: new IDBFactory(), crypto: webcrypto, CustomEvent,
    window: { dispatchEvent() {}, localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) } },
    fetch: async (url, options) => { requests.push({ url, options }); return { ok: true, json: async () => ({ expense: { id: "saved" } }) }; },
  });
  return { load, requests, setSession: value => { session = value; } };
}

test("apiFetch usa el token vigente, preserva headers y signal, y bloquea otros orígenes", async () => {
  const { load, requests, setSession } = client();
  const { apiFetch } = load("src/lib/apiFetch.ts");
  const controller = new AbortController();
  await apiFetch("/api/expenses?userId=a", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", signal: controller.signal });
  assert.equal(requests[0].options.headers.get("authorization"), "Bearer token-1");
  assert.equal(requests[0].options.headers.get("content-type"), "application/json");
  assert.equal(requests[0].options.signal.aborted, false);
  assert.equal(requests[0].options.cache, "no-store");
  setSession({ user: { id: "a" }, access_token: "renewed" });
  await apiFetch("/api/cards");
  assert.equal(requests[1].options.headers.get("authorization"), "Bearer renewed");
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
  const offline = load("src/lib/offlineExpenses.js");
  await offline.addOfflineExpense("a", { userId: "a", concept: "Pendiente", amount: 10 });
  setSession({ user: { id: "b" }, access_token: "token-b" });
  const blocked = await offline.syncOfflineExpenses("a");
  assert.equal(blocked.failedExpenses.length, 1);
  assert.equal((await offline.readOfflineExpenses("a")).length, 1);
  assert.equal(requests.length, 0);
  setSession({ user: { id: "a" }, access_token: "renewed-a" });
  const synced = await offline.syncOfflineExpenses("a");
  assert.equal(synced.syncedExpenses.length, 1);
  assert.equal((await offline.readOfflineExpenses("a")).length, 0);
  assert.equal(requests[0].options.headers.get("authorization"), "Bearer renewed-a");
});

test("el service worker no intercepta API ni siquiera como navegación; elimina caché anterior", async () => {
  const handlers = {}, removed = [];
  vm.runInNewContext(fs.readFileSync("public/sw.js", "utf8"), {
    URL, self: { location: { origin: "http://localhost" }, addEventListener: (name, handler) => { handlers[name] = handler; }, clients: { claim() {} } },
    caches: { keys: async () => ["afp-shell-v3", "afp-shell-v4"], delete: async name => { removed.push(name); } },
  });
  for (const mode of ["navigate", "cors"]) {
    handlers.fetch({ request: { method: "GET", mode, url: "http://localhost/api/expenses?userId=b" }, respondWith: () => assert.fail("API interceptada") });
  }
  let cleanup;
  handlers.activate({ waitUntil: promise => { cleanup = promise; } });
  await cleanup;
  assert.deepEqual(removed, ["afp-shell-v3"]);
});
