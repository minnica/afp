import assert from 'node:assert/strict';
import { test } from 'node:test';
import { array, indexed, record } from './helpers/dynamic-values';
import { fixedDate, sparseCalculations, testHandler, testReply } from './helpers/financial-fixtures';
import { checkSourceExports, sourceLoader } from './helpers/load-source';

test('contratos financieros: vm comprueba esquemas, constantes y constructores registrados', () => {
  const load = sourceLoader();
  const schemas = load('src/lib/financialResponses.ts');
  assert.throws(() => checkSourceExports('src/lib/financialResponses.ts', { ...schemas, monetarySchema: () => null }), /Export público inválido/);
  assert.throws(() => checkSourceExports('src/lib/financialResponses.ts', { ...schemas, monetarySchema: null }), /Export público inválido/);
  const protocol = load('src/lib/captureProtocol.ts');
  assert.throws(() => checkSourceExports('src/lib/captureProtocol.ts', { ...protocol, pairingLifetimeMs: {} }), /Export público inválido/);
  const auth = load('src/lib/apiAuth.ts');
  assert.throws(() => checkSourceExports('src/lib/apiAuth.ts', { ...auth, ApiAccessError: {} }), /Export público inválido/);
});

test('fixtures financieros: los cálculos conservan las propiedades ausentes y los datos originales', () => {
  const input = { amount: 0 };
  const calculations = sparseCalculations({ calculate: (value: { id: string; amount: number }) => ({ ownId: Object.hasOwn(value, 'id'), amount: value.amount }) });
  assert.deepEqual(calculations.calculate(input), { ownId: false, amount: 0 });
  assert.deepEqual(input, { amount: 0 });
  const months = { 9: [{ amount: '0.00' }] };
  assert.equal(record(array(indexed(months)[9])[0]).amount, '0.00');
  assert.throws(() => array(months));
  assert.throws(() => record([]));
});

test('fixtures HTTP: el adaptador conserva JSON y rechaza handlers o estados inválidos', async () => {
  const TestDate = fixedDate(new Date('2026-10-28T12:00:00Z'));
  assert.ok(new TestDate() instanceof TestDate);
  assert.equal(new TestDate().toISOString(), '2026-10-28T12:00:00.000Z');
  assert.equal(new TestDate(2024, 1, 29, 12).getDate(), 29);
  const body = { amount: '0.00', omitted: undefined, date: new Date('2026-10-28') };
  const response = await testHandler(async () => testReply(body, { status: 201, headers: { 'Cache-Control': 'private, no-store' } }))({});
  assert.deepEqual(response.body, { amount: '0.00', date: '2026-10-28T00:00:00.000Z' });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.throws(() => testHandler(undefined));
  await assert.rejects(testHandler(async () => ({ body: {}, status: '200' }))({}));
});
