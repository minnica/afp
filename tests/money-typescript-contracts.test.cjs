const test = require('node:test');
const assert = require('node:assert/strict');
const { sourceLoader } = require('./helpers/load-source.ts');
const load = sourceLoader();
// The source loader isolates module objects in a VM realm. Compare JSON values.
const equal = (actual, expected) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected);
const { readBaseline, readPaymentMix, readSnapshot, readYieldHistory } = load('src/lib/money/persisted.ts');

test('Mi dinero: JSON heredado conserva ceros, texto monetario, nulos y metadatos', () => {
  equal(readBaseline(null), {});
  equal(readBaseline({ expense: { UNASSIGNED: 0, bank: -1 } }), { expense: { UNASSIGNED: 0, bank: -1 } });
  equal(readPaymentMix({ cashWeight: 1, cards: [{ cardId: 'credit', weight: 2 }] }), { cashWeight: 1, cards: [{ cardId: 'credit', weight: 2 }] });
  const snapshot = { asOf: '2026-10-01', openingBalance: '0.00', annualYield: '15.0000', yieldCap: null, baseline: {}, priorMetadata: { source: 'fixture' } };
  equal(readSnapshot(snapshot), snapshot);
  assert.equal(readSnapshot(null), null);
  const entries = [{ from: '2026-10-01', rule: { annualYield: '15', yieldDailyAmount: null }, historic: true }];
  equal(readYieldHistory([null, {}, ...entries]), entries);
  const { changedYieldHistory } = load('src/lib/money/yieldRules.ts');
  const account = { asOf: '2026-10-01', annualYield: 15, yieldHistory: [null, {}, ...entries] };
  equal(changedYieldHistory(account, account, '2026-10-27'), account.yieldHistory);
  const { mutationResponseSchema } = load('src/lib/money/commands.ts');
  equal(mutationResponseSchema.parse({ ok: true, id: 'saved', historic: { total: '0.00' } }), { ok: true, id: 'saved', historic: { total: '0.00' } });
  assert.throws(() => readBaseline({ expense: { bank: 'not-cents' } }));
  assert.throws(() => readPaymentMix({ cashWeight: 1, cards: [{ cardId: 'credit', weight: 'bad' }] }));
});

test('Mi dinero: la instantánea conserva orden de consultas, relaciones y propietario', async () => {
  const { loadMoneyData } = load('src/lib/money/data.ts');
  const names = ['moneyAccount', 'moneyRoute', 'moneyPlan', 'moneyTransfer', 'moneyWithdrawal', 'card', 'cardCycle', 'income', 'dailyExpense', 'subscription', 'installmentPurchase', 'receivableAccount', 'payableAccount', 'incomeType', 'category'];
  const calls = [];
  let active = false;
  const db = Object.fromEntries(names.map(name => [name, { findMany: async query => {
    assert.equal(active, false, 'Las consultas comparten conexión y deben ser secuenciales');
    active = true; calls.push({ name, query }); await Promise.resolve(); active = false; return [{ id: name }];
  } }]));
  const result = await loadMoneyData(db, 'fictitious-owner');
  equal(calls.map(call => call.name), names);
  assert.ok(calls.every(call => call.query.where.userId === 'fictitious-owner'));
  equal(result.accounts, [{ id: 'moneyAccount' }]);
  equal(result.categories, [{ id: 'category' }]);
  assert.equal(calls[6].query.include.moneyPayments, true);
  equal(calls[0].query.include.reconciliations.orderBy, { createdAt: 'desc' });
});

test('Mi dinero: transferir y revertir reutilizan cuentas y movimientos de la instantánea', async () => {
  const { executeTransfer } = load('src/lib/money/transfers.ts');
  const data = { accounts: [{ id: 'a', asOf: new Date('2026-10-01') }, { id: 'b', asOf: new Date('2026-10-01') }], transfers: [] };
  const writes = [];
  const tx = { moneyTransfer: { create: async query => { writes.push(query); return { id: 't' }; }, update: async query => { writes.push(query); } } };
  const operationId = '00000000-0000-4000-8000-000000000003';
  equal(await executeTransfer(tx, 'owner', { operationId, action: 'TRANSFER', fromAccountId: 'a', toAccountId: 'b', amount: '0.01', date: '2026-10-27', concept: 'Ficticia' }, data), { ok: true, id: 't' });
  data.transfers.push({ id: 't', fromAccountId: 'a', toAccountId: 'b', date: new Date('2026-10-27') });
  equal(await executeTransfer(tx, 'owner', { operationId, action: 'REVERSE_TRANSFER', id: 't' }, data), { ok: true });
  assert.equal(writes.length, 2);
  assert.equal(writes[0].data.amount, 0.01);
});
