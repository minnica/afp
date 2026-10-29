import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { test } from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import { integrationLoader } from './helpers/integration-fixtures';

function storage() {
  const values = new Map<string, string>();
  return { values, get length() { return values.size; }, key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); } };
}
function fixture() {
  const localStorage = storage(), sessionStorage = storage(), indexedDB = new IDBFactory();
  const cached = new Map<string, string[]>([['afp-shell-v1', ['https://afp.test/api/expenses', 'https://afp.test/gastos']], ['unrelated', ['https://afp.test/api/other']]]);
  let send = async () => ({ ok: true, json: async () => ({ expense: { id: 'confirmed' } }) });
  const load = integrationLoader({ '@/lib/apiFetch': { apiFetch: async () => send() } }, {
    indexedDB, crypto: webcrypto, CustomEvent,
    window: { localStorage, sessionStorage, dispatchEvent() {}, caches: {
      keys: async () => [...cached.keys()], open: async (name: string) => ({ keys: async () => (cached.get(name) ?? []).map(url => ({ url })),
        delete: async (request: { url: string }) => { cached.set(name, (cached.get(name) ?? []).filter(url => url !== request.url)); return true; } }),
    } },
  });
  return { queue: load('src/lib/offlineExpenses.ts'), policy: load('src/lib/localFinancialData.ts'),
    logout: load('src/lib/logout.ts').logoutWithLocalData, localStorage, sessionStorage, cached, indexedDB,
    setSend: (fn: typeof send) => { send = fn; } };
}
const payload = { concept: 'Comida', amount: '10.50', date: '2026-10-29', categoryId: 'cat-a', paymentMethod: 'CASH' as const, notes: 'original', cashContributionAmount: '0.25' };

test('A12: salida sin pendientes limpia solo el propietario y las API antiguas; conserva shell y preferencias', async () => {
  const f = fixture();
  f.localStorage.setItem('afp:gastos-bootstrap:a', '{"amount":10}');
  f.localStorage.setItem('afp:gastos-bootstrap:b', 'other');
  f.localStorage.setItem('theme', 'dark');
  f.sessionStorage.setItem('afp:create-draft:v1:a:gastos', 'draft');
  f.sessionStorage.setItem('afp:capture-missing:a:card:period', 'draft');
  f.sessionStorage.setItem('afp:create-draft:v1:b:gastos', 'other');
  await f.queue.addOfflineExpense('b', payload);
  let signedOut = 0;
  await f.logout({ userId: 'a', keepPending: false, exported: null, signOut: async () => { signedOut++; } });
  assert.equal(signedOut, 1);
  assert.equal(f.localStorage.getItem('afp:gastos-bootstrap:a'), null);
  assert.equal(f.localStorage.getItem('afp:gastos-bootstrap:b'), 'other');
  assert.equal(f.localStorage.getItem('theme'), 'dark');
  assert.deepEqual([...f.sessionStorage.values.keys()], ['afp:create-draft:v1:b:gastos']);
  assert.deepEqual(f.cached.get('afp-shell-v1'), ['https://afp.test/gastos']);
  assert.deepEqual(f.cached.get('unrelated'), ['https://afp.test/api/other']);
  assert.equal((await f.queue.readOfflineExpenses('b')).length, 1);
});

test('A12: pendientes sin copia bloquean logout y no se borran ni cierran Auth', async () => {
  const f = fixture(), entry = await f.queue.addOfflineExpense('a', payload);
  await assert.rejects(f.logout({ userId: 'a', keepPending: false, exported: null,
    signOut: async () => { assert.fail('No debe cerrar Auth'); } }), /sin respaldar/);
  assert.equal(f.policy.isLocalDataClosed('a'), false);
  assert.equal((await f.queue.readOfflineExpenses('a'))[0]?.clientId, entry.clientId);
});

test('A12: exportar, borrar y restaurar conserva UUID, cuerpo, notas, aportación y metadatos', async () => {
  const f = fixture(), entry = await f.queue.addOfflineExpense('a', payload);
  const backup = await f.queue.backupOfflineExpenses('a');
  await f.logout({ userId: 'a', keepPending: false, exported: backup, signOut: async () => {} });
  assert.equal((await f.queue.readOfflineExpenses('a')).length, 0);
  f.policy.reopenLocalData('a');
  await f.queue.restoreOfflineExpenses('a', JSON.parse(JSON.stringify(backup)));
  assert.equal(JSON.stringify((await f.queue.readOfflineExpenses('a'))[0]), JSON.stringify(entry));
  await f.queue.restoreOfflineExpenses('a', backup);
  assert.equal((await f.queue.readOfflineExpenses('a')).length, 1);
  await f.queue.syncOfflineExpenses('a');
  assert.equal((await f.queue.readOfflineExpenses('a')).length, 0);
});

test('A12: conservar en dispositivo confiable retiene pendientes y retira la caché sincronizada', async () => {
  const f = fixture(), entry = await f.queue.addOfflineExpense('a', payload);
  f.localStorage.setItem('afp:gastos-bootstrap:a', 'private');
  await f.logout({ userId: 'a', keepPending: true, exported: null, signOut: async () => {} });
  assert.equal((await f.queue.readOfflineExpenses('a'))[0]?.clientId, entry.clientId);
  assert.equal(f.localStorage.getItem('afp:gastos-bootstrap:a'), null);
  await assert.rejects(f.queue.addOfflineExpense('a', payload), /cerrándose/);
  await assert.rejects(f.queue.syncOfflineExpenses('a'), /cerrándose/);
  f.policy.reopenLocalData('a');
  await f.queue.syncOfflineExpenses('a');
  assert.equal((await f.queue.readOfflineExpenses('a')).length, 0);
});

test('A12: fallo de Auth conserva pendientes y permite reintentar sin navegar', async () => {
  const f = fixture();
  await f.queue.addOfflineExpense('a', payload);
  const backup = await f.queue.backupOfflineExpenses('a');
  await assert.rejects(f.logout({ userId: 'a', keepPending: false, exported: backup,
    signOut: async () => { throw new Error('Auth sin conexión'); } }), /Auth sin conexión/);
  assert.deepEqual(await f.queue.backupOfflineExpenses('a'), backup);
  assert.equal(f.policy.isLocalDataClosed('a'), false);
  await f.logout({ userId: 'a', keepPending: false, exported: backup, signOut: async () => {} });
  assert.equal((await f.queue.readOfflineExpenses('a')).length, 0);
});

test('A12: captura de otra pestaña posterior a exportar impide borrar ambos pendientes', async () => {
  const f = fixture();
  await f.queue.addOfflineExpense('a', payload);
  const exported = await f.queue.backupOfflineExpenses('a');
  await f.queue.addOfflineExpense('a', { ...payload, concept: 'Otra captura' });
  await assert.rejects(f.logout({ userId: 'a', keepPending: false, exported,
    signOut: async () => { assert.fail('No debe cerrar Auth'); } }), /cambiaron/);
  assert.equal((await f.queue.readOfflineExpenses('a')).length, 2);
});

test('A12: una respuesta antigua no recrea bootstrap después de logout ni de entrar de nuevo', async () => {
  const f = fixture(), generation = f.policy.localDataGeneration('a');
  f.policy.writeFinancialBootstrap('a', { expenses: [payload] }, generation);
  assert.ok(f.localStorage.getItem('afp:gastos-bootstrap:a'));
  await f.logout({ userId: 'a', keepPending: false, exported: null, signOut: async () => {} });
  f.policy.writeFinancialBootstrap('a', { expenses: [payload] }, generation);
  assert.equal(f.localStorage.getItem('afp:gastos-bootstrap:a'), null);
  f.policy.reopenLocalData('a');
  f.policy.writeFinancialBootstrap('a', { expenses: [payload] }, generation);
  assert.equal(f.localStorage.getItem('afp:gastos-bootstrap:a'), null);
  f.policy.writeFinancialBootstrap('a', { expenses: [] }, f.policy.localDataGeneration('a'));
  assert.ok(f.localStorage.getItem('afp:gastos-bootstrap:a'));
});

test('A12: respaldo legado migrado conserva UUID; trusted retira copia redundante y no resucita confirmados', async () => {
  const f = fixture();
  f.localStorage.setItem('afp:offline-expenses:a', JSON.stringify([{ clientId: 'old', createdAt: '2026-10-29', payload }]));
  const entry = (await f.queue.readOfflineExpenses('a'))[0];
  const backup = await f.queue.backupOfflineExpenses('a');
  await f.logout({ userId: 'a', keepPending: true, exported: null, signOut: async () => {} });
  assert.equal(f.localStorage.getItem('afp:offline-expenses:a'), null);
  f.policy.reopenLocalData('a');
  await f.queue.syncOfflineExpenses('a');
  await f.queue.restoreOfflineExpenses('a', backup);
  assert.equal((await f.queue.readOfflineExpenses('a'))[0]?.clientId, entry?.clientId);
  await f.queue.syncOfflineExpenses('a');
  assert.equal((await f.queue.readOfflineExpenses('a')).length, 0);
  assert.equal(f.queue.hasOfflineData(await f.queue.backupOfflineExpenses('a')), false);
});

test('A12: cola legada ilegible se exporta literalmente y solo se elimina con copia actual', async () => {
  const f = fixture();
  f.localStorage.setItem('afp:offline-expenses:a', '{corrupto');
  await assert.rejects(f.queue.readOfflineExpenses('a'), /conserva/);
  const exported = await f.queue.backupOfflineExpenses('a');
  assert.equal(exported.legacy, '{corrupto');
  assert.equal(f.queue.hasOfflineData(exported), true);
  await f.logout({ userId: 'a', keepPending: false, exported, signOut: async () => {} });
  assert.equal(f.localStorage.getItem('afp:offline-expenses:a'), null);
});

test('A12: respaldo de otra cuenta o con propietario mezclado se rechaza antes de escribir', async () => {
  const f = fixture();
  await f.queue.addOfflineExpense('a', payload);
  const backup = await f.queue.backupOfflineExpenses('a');
  await assert.rejects(f.queue.restoreOfflineExpenses('b', backup), /otra cuenta/);
  await assert.rejects(f.queue.restoreOfflineExpenses('b', { ...backup, userId: 'b' }), /no válida/);
  assert.equal((await f.queue.readOfflineExpenses('b')).length, 0);
});

test('A12: conflicto de UUID al restaurar aborta el lote entero sin sobrescribir', async () => {
  const f = fixture();
  const entry = await f.queue.addOfflineExpense('a', payload);
  const backup = await f.queue.backupOfflineExpenses('a');
  const changed = { ...entry, payload: { ...entry.payload, amount: '999' } };
  await assert.rejects(f.queue.restoreOfflineExpenses('a', { ...backup, expenses: [changed] }));
  assert.equal(JSON.stringify((await f.queue.readOfflineExpenses('a'))[0]), JSON.stringify(entry));
});

test('A12: versión desconocida y operationId alterado se rechazan sin altas', async () => {
  const f = fixture(), entry = await f.queue.addOfflineExpense('a', payload);
  const backup = await f.queue.backupOfflineExpenses('a');
  await assert.rejects(f.queue.restoreOfflineExpenses('a', { ...backup, version: 2 }), /no es válido/);
  await assert.rejects(f.queue.restoreOfflineExpenses('a', { ...backup, expenses: [{ ...entry, payload }] }), /no válida/);
  assert.equal((await f.queue.readOfflineExpenses('a')).length, 1);
});

test('A12: fallo de limpieza de caché no cierra Auth ni borra la cola', async () => {
  const f = fixture();
  await f.queue.addOfflineExpense('a', payload);
  f.sessionStorage.removeItem = () => { throw new Error('Almacenamiento bloqueado'); };
  f.sessionStorage.setItem('afp:create-draft:v1:a:gastos', 'draft');
  await assert.rejects(f.logout({ userId: 'a', keepPending: true, exported: null,
    signOut: async () => { assert.fail('No debe cerrar Auth'); } }), /bloqueado/);
  assert.equal((await f.queue.readOfflineExpenses('a')).length, 1);
  assert.equal(f.policy.isLocalDataClosed('a'), false);
});


test('A12: salida espera el envío en curso y bloquea nuevas altas antes de borrar', async () => {
  const f = fixture();
  await f.queue.addOfflineExpense('a', payload);
  let release: (() => void) | undefined;
  let started: (() => void) | undefined;
  const sending = new Promise<void>(resolve => { started = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  f.setSend(async () => { started?.(); await held; return { ok: true, json: async () => ({ expense: { id: 'confirmed' } }) }; });
  const sync = f.queue.syncOfflineExpenses('a');
  await sending;
  let signedOut = false;
  const logout = f.logout({ userId: 'a', keepPending: false, exported: null, signOut: async () => { signedOut = true; } });
  assert.equal(f.policy.isLocalDataClosed('a'), true);
  await assert.rejects(f.queue.addOfflineExpense('a', payload), /cerrándose/);
  assert.equal(signedOut, false);
  release?.();
  await sync; await logout;
  assert.equal(signedOut, true);
  assert.equal((await f.queue.readOfflineExpenses('a')).length, 0);
});

test('A12: borrado con snapshot cambiado o propietario ajeno aborta sin eliminar filas', async () => {
  const f = fixture();
  await f.queue.addOfflineExpense('a', payload);
  const backup = await f.queue.backupOfflineExpenses('a');
  await f.queue.addOfflineExpense('a', { ...payload, concept: 'Nueva' });
  await assert.rejects(f.queue.removeOfflineExpenses('a', backup));
  await assert.rejects(f.queue.removeOfflineExpenses('b', backup), /otra cuenta/);
  assert.equal((await f.queue.readOfflineExpenses('a')).length, 2);
});

test('A12: entrada IndexedDB dañada rechaza la lectura y sigue disponible en el rescate', async () => {
  const f = fixture();
  const entry = await f.queue.addOfflineExpense('a', payload);
  await new Promise<void>((resolve, reject) => {
    const request = f.indexedDB.open('afp-offline-expenses', 1);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('expenses', 'readwrite');
      tx.objectStore('expenses').put({ ...entry, payload: 'corrupto' });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => reject(tx.error);
    };
  });
  await assert.rejects(f.queue.readOfflineExpenses('a'), /pendiente/);
  const backup = await f.queue.backupOfflineExpenses('a');
  assert.equal(backup.expenses.length, 1);
  assert.match(JSON.stringify(backup), /corrupto/);
  await f.logout({ userId: 'a', keepPending: false, exported: backup, signOut: async () => {} });
  assert.equal((await f.queue.backupOfflineExpenses('a')).expenses.length, 0);
});


test('A12: fallo al retirar legado después de Auth mantiene recuperación y permite repetir limpieza', async () => {
  const f = fixture();
  f.localStorage.setItem('afp:offline-expenses:a', JSON.stringify([{ clientId: 'old', createdAt: '2026-10-29', payload }]));
  await f.queue.readOfflineExpenses('a');
  const remove = f.localStorage.removeItem;
  f.localStorage.removeItem = key => { if (key === 'afp:offline-expenses:a') throw new Error('No se pudo retirar el legado'); remove(key); };
  let signedOut = false;
  await assert.rejects(f.logout({ userId: 'a', keepPending: true, exported: null, signOut: async () => { signedOut = true; } }), /retirar el legado/);
  assert.equal(signedOut, true);
  assert.equal(f.policy.isLocalDataClosed('a'), true);
  assert.equal((await f.queue.backupOfflineExpenses('a')).expenses.length, 1);
  assert.ok(f.localStorage.getItem('afp:offline-expenses:a'));
  f.localStorage.removeItem = remove;
  await f.logout({ userId: 'a', keepPending: true, exported: null, signOut: async () => {} });
  assert.equal(f.localStorage.getItem('afp:offline-expenses:a'), null);
  assert.equal((await f.queue.backupOfflineExpenses('a')).expenses.length, 1);
});
