import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ApiFetchOptions } from '../src/lib/apiFetch';
import type { ExpensesUrl } from '../src/lib/expenseReader';
import { uiResponseSchemas, type UiResponse } from '../src/lib/uiResponseSchemas';
import { sourceLoader } from './helpers/load-source';

const url = (concept: string, owner = 'owner'): ExpensesUrl => `/api/expenses?userId=${owner}&concept=${concept}`;
const data = (concept: string) => uiResponseSchemas.expenses.parse({
  expenses: [{ id: concept, concept, date: '2026-10-29', amount: 10, cashContributionAmount: 0,
    paymentMethod: 'CASH', categoryId: 'category', category: { id: 'category', name: 'Prueba' },
    cardId: null, card: null, notes: null, person: null, personId: null,
    debitAccountId: null, debitAccount: null, refundOriginalAmount: null,
    receivableAccountId: null, payableAccountId: null, subscriptionId: null,
    receivableAccount: null, payableAccount: null, subscription: null,
    reconciliationStatus: 'PENDING', reconciledAt: null, captureMovements: [] }],
  availableMonths: [concept], total: 10, personalTotal: 10,
});
type Reply = { ok: boolean; json: () => Promise<UiResponse<'expenses'>> };
function fixture() {
  const calls: { url: string; options: ApiFetchOptions; gate: PromiseWithResolvers<Reply> }[] = [];
  const state = { rows: '', months: '', loading: false, error: '', updates: 0 };
  const load = sourceLoader({ './uiClient': { uiFetch(requestUrl: string, options: ApiFetchOptions) {
    const gate = Promise.withResolvers<Reply>();
    calls.push({ url: requestUrl, options, gate });
    return gate.promise;
  } } }, { Error }); // vm comparte el constructor de errores con el transporte ficticio.
  const { createExpenseReader } = load('src/lib/expenseReader.ts');
  const reader = createExpenseReader({
    onData(value) { state.rows = value.expenses.map(row => row.concept).join(','); state.months = value.availableMonths.join(','); state.updates++; },
    onInvalidate() { state.rows = ''; state.updates++; },
    onLoading(value) { state.loading = value; state.updates++; },
    onError(value) { state.error = value; state.updates++; },
  });
  function reply(index: number, concept: string) {
    assert.ok(calls[index]);
    calls[index].gate.resolve({ ok: true, json: async () => data(concept) });
  }
  function fail(index: number) {
    assert.ok(calls[index]);
    calls[index].gate.reject(new Error('fallo de consulta'));
  }
  return { reader, calls, state, reply, fail };
}

test('A09: B responde antes que A y conserva filas, meses, error y carga', async () => {
  const f = fixture();
  f.reader.select(url('A')); const a = f.reader.load('owner');
  f.reader.select(url('B')); const b = f.reader.load('owner');
  assert.equal(f.calls[0]?.options.signal?.aborted, true);
  assert.equal(f.calls[1]?.options.expectedUserId, 'owner');
  f.reply(1, 'B'); await b;
  const accepted = { ...f.state };
  f.reply(0, 'A'); await a;
  assert.deepEqual(f.state, accepted);
  assert.equal(f.state.rows, 'B'); assert.equal(f.state.months, 'B');
  assert.equal(f.state.error, ''); assert.equal(f.state.loading, false);
});

test('A09: A termina mientras B sigue pendiente sin apagar su carga', async () => {
  const f = fixture();
  f.reader.select(url('A')); const a = f.reader.load('owner');
  f.reader.select(url('B')); const b = f.reader.load('owner');
  f.reply(0, 'A'); await a;
  assert.equal(f.state.rows, ''); assert.equal(f.state.loading, true);
  f.reply(1, 'B'); await b;
  assert.equal(f.state.rows, 'B'); assert.equal(f.state.loading, false);
});

test('A09: un error antiguo se descarta antes y después de la respuesta vigente', async () => {
  for (const oldErrorFirst of [true, false]) {
    const f = fixture();
    f.reader.select(url('A')); const a = f.reader.load('owner');
    f.reader.select(url('B')); const b = f.reader.load('owner');
    if (oldErrorFirst) { f.fail(0); await a; assert.equal(f.state.loading, true); }
    f.reply(1, 'B'); await b;
    if (!oldErrorFirst) { f.fail(0); await a; }
    assert.equal(f.state.rows, 'B'); assert.equal(f.state.error, '');
  }
});

test('A09: cambiar selección cancela inmediatamente, antes de iniciar el debounce siguiente', async () => {
  const f = fixture();
  f.reader.select(url('A')); const a = f.reader.load('owner');
  f.reader.select(url('B'));
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0]?.options.signal?.aborted, true);
  f.reply(0, 'A'); await a;
  assert.equal(f.state.rows, ''); assert.equal(f.state.loading, true);
});

test('A09: cancelar durante la lectura JSON impide aplicar la respuesta', async () => {
  const f = fixture(), body = Promise.withResolvers<UiResponse<'expenses'>>();
  f.reader.select(url('A')); const a = f.reader.load('owner');
  f.calls[0]?.gate.resolve({ ok: true, json: () => body.promise });
  await Promise.resolve();
  f.reader.select(url('B'));
  body.resolve(data('A')); await a;
  assert.equal(f.state.rows, ''); assert.equal(f.state.loading, true);
});

test('A09: volver a A cancela B aunque A se hubiera cargado previamente', async () => {
  const f = fixture();
  f.reader.select(url('A')); const a = f.reader.load('owner'); f.reply(0, 'A'); await a;
  f.reader.select(url('B')); const b = f.reader.load('owner');
  f.reader.select(url('A')); const again = f.reader.load('owner');
  f.reply(2, 'A actual'); await again;
  f.reply(1, 'B'); await b;
  assert.equal(f.state.rows, 'A actual');
});

test('A09: una recarga tras mutación usa los filtros actuales y sustituye incluso la misma URL', async () => {
  const f = fixture();
  f.reader.select(url('A')); const a = f.reader.load('owner');
  const reloadAfterSaving = () => f.reader.load('owner', { force: true, mutationCompleted: true, errorMode: 'inline' });
  f.reader.select(url('B')); const b = f.reader.load('owner');
  const saved = reloadAfterSaving();
  assert.equal(f.calls[2]?.url, url('B'));
  assert.equal(f.calls[2]?.options.mutationCompleted, true);
  assert.equal(f.calls[2]?.options.errorMode, 'inline');
  assert.equal(f.calls[1]?.options.signal?.aborted, true);
  f.reply(2, 'B guardado'); await saved;
  f.reply(1, 'B previo'); f.reply(0, 'A'); await Promise.all([a, b]);
  assert.equal(f.state.rows, 'B guardado');
});

test('A09: salir o cambiar propietario impide datos, errores y callbacks tardíos', async () => {
  const f = fixture();
  f.reader.select(url('A')); const a = f.reader.load('owner');
  f.reader.select(null); const before = { ...f.state };
  f.fail(0); await a;
  assert.deepEqual(f.state, before);
  await f.reader.load('owner', { force: true }); assert.equal(f.calls.length, 1);
  f.reader.select(url('B', 'other'));
  await f.reader.load('owner', { force: true }); assert.equal(f.calls.length, 1);
  const b = f.reader.load('other'); f.reply(1, 'B'); await b;
  assert.equal(f.state.rows, 'B');
});

test('A09: bootstrap online/offline solo inicia la selección correspondiente y no sustituye una recarga', async () => {
  const f = fixture();
  f.reader.select(url('A'));
  f.reader.prime(url('B'), data('B cache')); assert.equal(f.state.rows, '');
  f.reader.prime(url('A'), data('A cache')); assert.equal(f.state.rows, 'A cache');
  await f.reader.load('owner'); assert.equal(f.calls.length, 0);
  const refresh = f.reader.load('owner', { force: true });
  f.reply(0, 'A actual'); await refresh;
  f.reader.prime(url('A'), data('A viejo')); assert.equal(f.state.rows, 'A actual');
});

test('A09: un error vigente se muestra, permite reintentar y no marca la URL como cargada', async () => {
  const f = fixture();
  f.reader.select(url('A')); const a = f.reader.load('owner');
  f.fail(0); await assert.rejects(a, /fallo de consulta/);
  assert.equal(f.state.error, 'fallo de consulta'); assert.equal(f.state.loading, false);
  const retry = f.reader.load('owner'); assert.equal(f.state.error, '');
  f.reply(1, 'A recuperado'); await retry;
  assert.equal(f.state.rows, 'A recuperado'); assert.equal(f.state.loading, false);
  const forced = f.reader.load('owner', { force: true });
  f.fail(2); await assert.rejects(forced, /fallo de consulta/);
  const retryRefresh = f.reader.load('owner');
  assert.equal(f.calls.length, 4, 'Una recarga fallida también permite reintentar.');
  f.reply(3, 'A actualizado'); await retryRefresh;
});

test('A09: la misma lectura pendiente se comparte sin reutilizarla al forzar una recarga', async () => {
  const f = fixture();
  f.reader.select(url('A')); const a = f.reader.load('owner');
  assert.equal(f.reader.load('owner'), a); assert.equal(f.calls.length, 1);
  f.reply(0, 'A'); await a;
  await f.reader.load('owner'); assert.equal(f.calls.length, 1);
  const forced = f.reader.load('owner', { force: true });
  f.reply(1, 'A nuevo'); await forced;
  assert.equal(f.state.rows, 'A nuevo');
});
