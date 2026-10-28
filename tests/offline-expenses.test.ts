import jsonFixture0 from './fixtures/offline/expenses-v1.json';
import { present } from './helpers/financial-fixtures';

import { record as objectValue } from './helpers/dynamic-values';
import type { IntegrationGlobals } from './helpers/integration-fixtures';
import { parseJson,integrationLoader as sourceLoader } from './helpers/integration-fixtures';

import { IDBFactory } from 'fake-indexeddb';
import assert from "node:assert/strict";
import { webcrypto } from 'node:crypto';
import { test } from 'node:test';

function fixture() {
  const indexedDB = new IDBFactory(), storage = new Map<string, string>(), receipts = new Map<unknown, Record<string, unknown>>(), requests: Record<string, unknown>[] = [];
  let send: (payload: Record<string, unknown>) => Promise<{ ok: boolean; json(): Promise<unknown> }> = async payload => {
    const key = payload.operationId;
    if (!receipts.has(key)) receipts.set(key, { id: key, concept: payload.concept });
    return { ok: true, json: async () => ({ expense: receipts.get(key) }) };
  };
  const globals: IntegrationGlobals & { indexedDB: IDBFactory | undefined; navigator?: { locks: { request(name: string, run: () => Promise<unknown>): Promise<unknown> } } } = { indexedDB, crypto: webcrypto, CustomEvent,
    window: { dispatchEvent() {}, localStorage: { getItem: (key: string) => storage.get(key) } } };
  const tab = () => sourceLoader({ "@/lib/apiFetch": { apiFetch: async (_url: string, options: { body: string }) => {
    const payload = objectValue(parseJson(options.body));
    requests.push(payload);
    return send(payload);
  } } }, globals)("src/lib/offlineExpenses.ts");
  return { tab, storage, receipts, requests, globals, setSend: (fn: typeof send) => { send = fn; } };
}
const payload = { concept: "Comida", amount: 10, date: "2026-10-17", categoryId: "category-a", paymentMethod: "CASH" as const };
test('IndexedDB v1 anterior: respuesta perdida, cambio de cuenta y dos pestañas conservan recibo y metadatos', async () => {
  const persisted = jsonFixture0;
  const f = fixture();
  await new Promise<void>((resolve, reject) => {
    const request = present(f.globals.indexedDB).open(persisted.database, persisted.version);
    request.onupgradeneeded = () => {
      const queue = request.result.createObjectStore('expenses', { keyPath: ['userId', 'clientId'] });
      queue.createIndex('userId', 'userId');
      request.result.createObjectStore('legacyImports', { keyPath: ['userId', 'clientId'] });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction(['expenses'], 'readwrite');
      for (const row of persisted.expenses) tx.objectStore('expenses').add(row);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => reject(tx.error);
    };
  });
  const a = f.tab(), b = f.tab();
  assert.deepEqual((await a.readOfflineExpenses('a'))[0], persisted.expenses[0]);
  assert.deepEqual((await b.readOfflineExpenses('b'))[0], persisted.expenses[1]);
  let lose = true;
  f.setSend(async input => {
    f.receipts.set(input.operationId, { id: input.operationId });
    if (lose) { lose = false; throw new TypeError('Respuesta perdida'); }
    return { ok: true, json: async () => ({ expense: f.receipts.get(input.operationId) }) };
  });
  await a.syncOfflineExpenses('a');
  assert.deepEqual(present((await b.readOfflineExpenses('a'))[0]).payload, present(persisted.expenses[0]).payload);
  await Promise.all([a.syncOfflineExpenses('a'), b.syncOfflineExpenses('a')]);
  assert.equal(f.receipts.size, 1);
  assert.ok(f.requests.every(row => JSON.stringify(row) === JSON.stringify(present(persisted.expenses[0]).payload)));
  assert.equal((await a.readOfflineExpenses('a')).length, 0);
  assert.deepEqual((await b.readOfflineExpenses('b'))[0], persisted.expenses[1]);
  const db = await new Promise<IDBDatabase>(resolve => { const r = present(f.globals.indexedDB).open(persisted.database); r.onsuccess = () => resolve(r.result); });
  assert.equal(db.version, 1);
  assert.deepEqual([...db.objectStoreNames], ['expenses', 'legacyImports']);
  db.close();
});
test("conflicto con captura: decisión explícita conserva UUID, notas y aportación al registrar otra compra", async () => {
  const f = fixture(), queue = f.tab();
  const entry = await queue.addOfflineExpense('a', { ...payload, cashContributionAmount: '2', notes: 'Personal' });
  f.setSend(async () => { throw Object.assign(new Error('Ya hay una captura por conciliar con esta tarjeta e importe.'), { status: 409 }); });
  await queue.syncOfflineExpenses('a');
  await queue.resolveOfflineCapture('b', entry.clientId, false);
  assert.equal((await queue.readOfflineExpenses('a')).length, 1);
  await queue.resolveOfflineCapture('a', entry.clientId, true);
  const pending = (await f.tab().readOfflineExpenses('a'))[0];
  assert.equal(present(pending).payload.confirmDistinctCapture, true);
  assert.equal(present(pending).payload.operationId, entry.clientId);
  assert.equal(present(pending).payload.notes, 'Personal'); assert.equal(present(pending).payload.cashContributionAmount, '2');
  f.setSend(async input => ({ ok: true, json: async () => ({ expense: { id: input.operationId } }) }));
  await queue.syncOfflineExpenses('a'); assert.equal((await queue.readOfflineExpenses('a')).length, 0);
});
test("conservar gasto existente solo retira un conflicto confirmado, sin borrar otros pendientes", async () => {
  const f = fixture(), queue = f.tab();
  const conflict = await queue.addOfflineExpense('a', payload), ordinary = await queue.addOfflineExpense('a', payload);
  await queue.resolveOfflineCapture('a', ordinary.clientId, false);
  assert.equal((await queue.readOfflineExpenses('a')).length, 2);
  f.setSend(async () => { throw Object.assign(new Error('Ya hay una captura por conciliar con esta tarjeta e importe.'), { status: 409 }); });
  await queue.syncOfflineExpenses('a', { onlyClientId: conflict.clientId });
  await queue.resolveOfflineCapture('a', conflict.clientId, false);
  assert.deepEqual((await queue.readOfflineExpenses('a')).map(row => row.clientId), [ordinary.clientId]);
});
function deferred() { let release: (() => void) | undefined; const promise = new Promise<void>(r => { release = r; }); return { promise, resolve: () => present(release)() }; }

test("aportación offline: recarga, error y reintento conservan el importe y UUID", async () => {
  const f = fixture(), first = f.tab();
  const entry = await first.addOfflineExpense("a", { ...payload, amount: "600", cashContributionAmount: "500" });
  f.setSend(async () => { throw new TypeError("Sin conexión"); });
  await first.syncOfflineExpenses("a");
  const reopened = f.tab();
  const pending = (await reopened.readOfflineExpenses("a"))[0];
  assert.equal(present(pending).payload.cashContributionAmount, "500");
  assert.equal(present(pending).clientId, entry.clientId);
  f.setSend(async input => ({ ok: true, json: async () => ({ expense: { id: input.operationId, ...input } }) }));
  const result = await reopened.syncOfflineExpenses("a");
  assert.equal(present(result.syncedExpenses[0]).cashContributionAmount, "500");
  assert.equal((await reopened.readOfflineExpenses("a")).length, 0);
  assert.ok(f.requests.every(input => input.cashContributionAmount === "500" && input.amount === "600" && input.operationId === entry.clientId));
});

test("respuesta perdida después de guardar: recargar y reintentar conserva el UUID", async () => {
  const f = fixture(), first = f.tab();
  const entry = await first.addOfflineExpense("a", payload);
  let lose = true;
  f.setSend(async input => {
    f.receipts.set(input.operationId, { id: input.operationId });
    if (lose) { lose = false; throw new TypeError("Respuesta perdida"); }
    return { ok: true, json: async () => ({ expense: f.receipts.get(input.operationId) }) };
  });
  assert.equal((await first.syncOfflineExpenses("a")).failedExpenses.length, 1);
  const reopened = f.tab();
  assert.equal(present((await reopened.readOfflineExpenses("a"))[0]).clientId, entry.clientId);
  assert.equal((await reopened.syncOfflineExpenses("a")).syncedExpenses.length, 1);
  assert.equal(f.receipts.size, 1);
  assert.equal(new Set(f.requests.map(row => row.operationId)).size, 1);
  assert.equal((await reopened.readOfflineExpenses("a")).length, 0);
});

test("dos pestañas sin Web Locks: conservan un mismo UUID y no resucitan un error tardío", async () => {
  const f = fixture(), a = f.tab(), b = f.tab(), started = deferred(), release = deferred();
  await a.addOfflineExpense("a", payload);
  let count = 0;
  f.setSend(async input => {
    if (++count === 1) { started.resolve(); await release.promise; throw new Error("Fallo tardío"); }
    f.receipts.set(input.operationId, { id: input.operationId });
    return { ok: true, json: async () => ({ expense: f.receipts.get(input.operationId) }) };
  });
  const syncing = a.syncOfflineExpenses("a");
  await started.promise;
  await b.syncOfflineExpenses("a");
  release.resolve();
  await syncing;
  assert.equal(f.receipts.size, 1);
  assert.equal(new Set(f.requests.map(row => row.operationId)).size, 1);
  assert.equal((await a.readOfflineExpenses("a")).length, 0);
});

test("capturar en otra pestaña durante sync no pierde la nueva entrada ni la de otro usuario", async () => {
  const f = fixture(), a = f.tab(), b = f.tab(), started = deferred(), release = deferred();
  const original = await a.addOfflineExpense("a", payload);
  f.setSend(async () => { started.resolve(); await release.promise; return { ok: true, json: async () => ({ expense: { id: original.clientId } }) }; });
  const syncing = a.syncOfflineExpenses("a");
  await started.promise;
  const [newEntry, other] = await Promise.all([b.addOfflineExpense("a", payload), b.addOfflineExpense("b", payload)]);
  release.resolve();
  const result = await syncing;
  assert.equal(result.failedExpenses.length, 1);
  assert.equal(present(result.failedExpenses[0]).clientId, newEntry.clientId);
  assert.equal(present((await a.readOfflineExpenses("b"))[0]).clientId, other.clientId);
});

test("cerrar tras persistir y antes del POST permite recuperar y sincronizar", async () => {
  const f = fixture();
  const entry = await f.tab().addOfflineExpense("a", payload);
  assert.equal(f.requests.length, 0);
  const reopened = f.tab();
  assert.equal(present((await reopened.readOfflineExpenses("a"))[0]).payload.operationId, entry.clientId);
  await reopened.syncOfflineExpenses("a");
  assert.equal(f.receipts.size, 1);
});

test("migración concurrente conserva la copia local y no reimporta confirmados", async () => {
  const f = fixture(), a = f.tab(), b = f.tab();
  const legacy = JSON.stringify([{ clientId: "offline-123", createdAt: "2026-01-01", lastError: "Sin conexión", payload }]);
  f.storage.set("afp:offline-expenses:a", legacy);
  const [one, two] = await Promise.all([a.readOfflineExpenses("a"), b.readOfflineExpenses("a")]);
  assert.equal(one.length, 1);
  assert.equal(present(one[0]).clientId, present(two[0]).clientId);
  assert.equal(present(one[0]).lastError, "Sin conexión");
  await a.syncOfflineExpenses("a");
  assert.equal((await b.readOfflineExpenses("a")).length, 0);
  assert.equal(f.storage.get("afp:offline-expenses:a"), legacy);
});

test("JSON corrupto, validación y confirmación incompleta nunca eliminan pendientes", async () => {
  const f = fixture(), tab = f.tab();
  const entry = await tab.addOfflineExpense("a", payload);
  f.setSend(async () => { throw new Error(''); });
  assert.equal(present((await tab.syncOfflineExpenses('a')).failedExpenses[0]).clientId, entry.clientId);
  for (const response of [
    { ok: true, json: async () => { throw new SyntaxError("Respuesta truncada"); } },
    { ok: false, json: async () => ({ error: "Categoría no válida" }) },
    { ok: true, json: async () => ({}) },
  ] as const) {
    f.setSend(async () => response);
    const result = await tab.syncOfflineExpenses("a");
    assert.equal(present(result.failedExpenses[0]).clientId, entry.clientId);
    assert.ok(present(result.failedExpenses[0]).lastError);
  }
  f.storage.set("afp:offline-expenses:a", "{corrupto");
  await assert.rejects(tab.readOfflineExpenses("a"), /conserva/);
  assert.equal(f.storage.get("afp:offline-expenses:a"), "{corrupto");
});

test("fallo de almacenamiento no confirma una captura ni envía un POST", async () => {
  const f = fixture();
  f.globals.indexedDB = undefined;
  await assert.rejects(f.tab().addOfflineExpense("a", payload), /almacenamiento/);
  assert.equal(f.requests.length, 0);
});

test("Web Locks serializa dos pestañas y la segunda relee la cola al obtener el bloqueo", async () => {
  const f = fixture();
  let tail: Promise<unknown> = Promise.resolve(), lockRequests = 0;
  f.globals.navigator = { locks: { request: (_name, run) => { lockRequests++; const result = tail.then(run); tail = result.catch(() => {}); return result; } } };
  const a = f.tab(), b = f.tab();
  await a.addOfflineExpense("a", payload);
  await Promise.all([a.syncOfflineExpenses("a"), b.syncOfflineExpenses("a")]);
  assert.equal(lockRequests, 2);
  assert.equal(f.requests.length, 1);
  assert.equal((await b.readOfflineExpenses("a")).length, 0);
});
