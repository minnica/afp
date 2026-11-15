import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildReceivableNotices } from '../src/lib/importantNotices';
import { buildReceivableIncomeDraft, receivableIncomeHref } from '../src/lib/receivableIncomePrefill';

type PrefillAccount = Parameters<typeof buildReceivableIncomeDraft>[0][number];
const account: PrefillAccount = {
  id: 'debt-with-dashes', status: 'ACTIVE', concept: 'Equipo ficticio',
  pendingBalance: 350.25, expectedMonthlyPayment: '500.00', expectedChargeDays: [15, 31],
  originDate: '2026-01-01T12:00:00Z', person: { id: 'person', name: 'Persona ficticia' }, incomes: [],
};
const types = [{ id: 'salary', name: 'Nómina' }, { id: 'payment', name: 'Pago recibido' }];
const now = new Date('2026-11-15T12:00:00Z');
const prepare = (overrides: Partial<PrefillAccount> = {}, date = '2026-11-15') =>
  buildReceivableIncomeDraft([{ ...account, ...overrides }], types, account.id, date, now);

test('cobro: el aviso transmite la cuenta exacta y la fecha bancaria, sin datos personales en la URL', () => {
  const notice = buildReceivableNotices([{ ...account, originalAmount: 350.25 }], now)[0]!;
  const url = new URL(receivableIncomeHref(notice)!, 'https://example.test');
  assert.equal(url.pathname, '/ingresos');
  assert.equal(url.searchParams.get('receivableAccountId'), account.id);
  assert.equal(url.searchParams.get('chargeDate'), '2026-11-15');
  assert.deepEqual([...url.searchParams.keys()], ['receivableAccountId', 'chargeDate']);
  assert.equal(receivableIncomeHref({ type: 'PAYABLE', date: now, receivableAccountId: account.id }), null);
  assert.equal(receivableIncomeHref({ type: 'RECEIVABLE', date: now }), null);
});

test('cobro: usa los datos actuales y limita el importe esperado al saldo pendiente en centavos', () => {
  assert.deepEqual(prepare(), {
    date: '2026-11-15', incomeTypeId: 'payment', source: 'Persona ficticia', concept: 'Equipo ficticio',
    amount: '350.25', receivableAccountId: account.id, notes: '',
  });
  assert.equal(prepare({ expectedMonthlyPayment: '100.10' }).amount, '100.10');
  assert.equal(prepare({ pendingBalance: 0.01 }).amount, '0.01');
});

test('cobro: no inventa importe ni tipo de ingreso cuando faltan', () => {
  for (const expectedMonthlyPayment of [null, '0', 0]) assert.equal(prepare({ expectedMonthlyPayment }).amount, '');
  assert.equal(buildReceivableIncomeDraft([account], [types[0]!], account.id, '2026-11-15', now).incomeTypeId, '');
});

test('cobro: rechaza enlaces ajenos, cuentas liquidadas, canceladas y saldos sin pendiente', () => {
  assert.throws(() => buildReceivableIncomeDraft([account], types, 'other-owner', '2026-11-15', now), /no está disponible/);
  assert.throws(() => prepare({ status: 'PAID_OFF' }), /liquidada/);
  assert.throws(() => prepare({ status: 'CANCELLED' }), /cancelada/);
  for (const pendingBalance of [0, -10]) assert.throws(() => prepare({ pendingBalance }), /liquidada/);
});

test('cobro: valida fechas reales, inicio y calendario vigente; respeta el último día del mes', () => {
  for (const date of ['', 'invalid', '2026-02-30', '2026-11-14', '2025-11-15']) assert.throws(() => prepare({}, date));
  assert.equal(prepare({}, '2026-02-28').date, '2026-02-28');
  assert.equal(prepare({}, '2028-02-29').date, '2028-02-29');
  assert.throws(() => prepare({ expectedChargeDays: [] }), /programación/);
});

test('cobro: un aviso ya atendido no prepara otro ingreso; los abonos previos no bloquean la próxima fecha', () => {
  const income = { id: 'payment', date: '2026-11-15T12:00:00Z', source: 'Persona ficticia', concept: 'Abono', amount: '10', notes: null };
  assert.throws(() => prepare({ incomes: [income] }), /ya tiene un ingreso/);
  assert.equal(prepare({ incomes: [{ ...income, date: '2026-11-14T12:00:00Z' }] }).amount, '350.25');
  assert.throws(() => buildReceivableIncomeDraft([{ ...account, incomes: [income] }], types, account.id, '2026-11-15', new Date('2026-11-14T12:00:00Z')), /ya tiene un ingreso/);
});

test('cobro: el día actual se interpreta en México y la fecha bancaria no cambia por zona horaria', () => {
  const income = { id: 'payment', date: '2026-11-16T12:00:00Z', source: 'Persona ficticia', concept: 'Abono', amount: 10, notes: null };
  assert.equal(buildReceivableIncomeDraft([{ ...account, incomes: [income] }], types, account.id, '2026-11-15', new Date('2026-11-16T05:59:59Z')).date, '2026-11-15');
  assert.throws(() => buildReceivableIncomeDraft([{ ...account, incomes: [income] }], types, account.id, '2026-11-15', new Date('2026-11-16T06:00:00Z')), /ya tiene un ingreso/);
});
