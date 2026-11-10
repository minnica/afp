import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CalculationData } from '../src/lib/money/types';
import { withdrawalSchema, cashWithdrawalFormSchema } from '../src/lib/money/schema';
import { createWithdrawalEditor } from '../src/components/mi-dinero/withdrawalEditor';
import { sourceLoader } from './helpers/load-source';
import { present, sparseCalculations, type MoneyFixtureData, type Sparse } from './helpers/financial-fixtures';

const load = sourceLoader();
const { buildSources, accountBalances } = sparseCalculations(load('src/lib/money/sources.ts'));
const today = '2026-11-10';
const input = { accountId: 'bank', cashAccountId: 'cash', amount: '100.47', cashAmount: '100.00', date: '2026-11-06', concept: 'Retiro ficticio' };
function data(extra: Sparse<CalculationData> = {}): MoneyFixtureData {
  return { accounts: [{ id: 'bank', name: 'Banco ficticio', kind: 'BANK', openingBalance: 1000, asOf: '2026-11-01', baseline: {} },
    { id: 'cash', name: 'Caja ficticia', kind: 'CASH', openingBalance: 500, asOf: '2026-11-01', baseline: {} }],
    routes: [], plans: [], transfers: [], withdrawals: [], cards: [], cycles: [], incomes: [], expenses: [], subscriptions: [], purchases: [], receivables: [], payables: [], ...extra };
}

test('retiro: el contrato conserva solicitudes antiguas y exige cuenta e importe de efectivo juntos', () => {
  assert.ok(withdrawalSchema.safeParse(input).success);
  const legacy = { accountId: 'bank', amount: '100.47', date: input.date, concept: input.concept };
  assert.ok(withdrawalSchema.safeParse(legacy).success);
  assert.equal(cashWithdrawalFormSchema.safeParse(legacy).success, false);
  for (const invalid of [{ ...legacy, cashAccountId: 'cash' }, { ...legacy, cashAmount: '100.00' },
    { ...input, cashAccountId: 'bank' }, { ...input, cashAmount: '100.48' }, { ...input, cashAmount: '0.00' },
    { ...input, cashAmount: '100.001' }, { ...input, cashAmount: '-1.00' }]) {
    assert.equal(withdrawalSchema.safeParse(invalid).success, false);
  }
});

test('retiro: banco descuenta el total, caja recibe el efectivo y el total solo pierde la comisión', () => {
  const d = data({ withdrawals: [{ ...input, id: 'w', reversedAt: null }] });
  const { events } = buildSources(d, today), balances = accountBalances(present(d.accounts), events, today);
  assert.equal(present(balances.find(a => a.id === 'bank')).balance, 899.53);
  assert.equal(present(balances.find(a => a.id === 'cash')).balance, 600);
  assert.equal(balances.reduce((sum, account) => sum + Math.round(account.balance * 100), 0), 149953);
  assert.equal(events.length, 2); assert.ok(events.every(event => event.withdrawalId === 'w'));
  assert.deepEqual(Array.from(events, event => event.key), ['withdrawal:w', 'withdrawal:w:cash']);
});

test('retiro: sin comisión conserva el total y revertir retira ambas partes', () => {
  const d = data({ withdrawals: [{ ...input, id: 'w', amount: '100.00', reversedAt: null }] });
  const balances = accountBalances(present(d.accounts), buildSources(d, today).events, today);
  assert.equal(balances.reduce((sum, account) => sum + account.balance, 0), 1500);
  present(present(d.withdrawals)[0]).reversedAt = today;
  assert.equal(buildSources(d, today).events.length, 0);
});

test('retiros históricos sin destino conservan exclusivamente su salida original', () => {
  const d = data({ withdrawals: [{ id: 'old', accountId: 'bank', amount: '100.47', date: input.date, concept: 'Histórico ficticio' }] });
  const events = buildSources(d, today).events;
  assert.equal(events.length, 1); assert.equal(present(events[0]).cents, -10047);
  assert.equal(present(accountBalances(present(d.accounts), events, today).find(a => a.id === 'cash')).balance, 500);
});

test('editor de retiro: separa banco y caja, selecciona solo una caja inequívoca y conserva importes vacíos', () => {
  const accounts = [{ id: 'bank', name: 'Banco ficticio', kind: 'BANK' }, { id: 'cash', name: 'Caja ficticia', kind: 'CASH' }];
  const editor = createWithdrawalEditor(accounts, today);
  assert.equal(editor.values.cashAccountId, 'cash'); assert.equal(editor.values.amount, ''); assert.equal(editor.values.cashAmount, '');
  assert.deepEqual(editor.fields.find(f => f.name === 'accountId')?.options, [{ value: 'bank', label: 'Banco ficticio' }]);
  assert.deepEqual(editor.fields.find(f => f.name === 'cashAccountId')?.options, [{ value: 'cash', label: 'Caja ficticia' }]);
  assert.equal(createWithdrawalEditor([...accounts, { id: 'other', name: 'Otra caja', kind: 'CASH' }], today).values.cashAccountId, '');
  const empty = createWithdrawalEditor([accounts[0]], today);
  assert.equal(empty.values.cashAccountId, ''); assert.match(empty.fields.find(f => f.name === 'cashAccountId')?.help || '', /Primero agrega/);
});
