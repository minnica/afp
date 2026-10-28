const assert = require('node:assert/strict');
const { test } = require('node:test');
const { sourceLoader } = require('./helpers/load-source.cjs');
const { createBalanceTracking, getTrackedCard, isBalanceTrackingValid, runBalanceSnapshot } = sourceLoader()('src/lib/cardBalanceTracking.ts');
const day = '2026-10-21';
const empty = () => ({ expenses: [], purchases: [], cycles: [], credits: [] });
const base = () => ({ id: 'card-a', userId: 'a', creditLimit: '10000', usedBalance: '3000', balanceAsOf: day });
const charge = (amount, extra = {}) => ({ userId: 'a', cardId: 'card-a', date: day, paymentMethod: 'CARD', amount, ...extra });
const cycle = (paidAmount, extra = {}) => ({ userId: 'a', cardId: 'card-a', paidAt: day, paidAmount, ...extra });
function start(movements = empty()) { const card = base(); card.balanceTracking = createBalanceTracking(card, movements, day); return card; }

test('seguimiento: el punto de partida conserva exactamente la captura, aunque ya haya cargos, MSI y pagos', () => {
  const m = empty(); m.expenses.push(charge(1000)); m.purchases.push({ ...charge(0), purchaseDate: day, totalAmount: 12000, status: 'ACTIVE' }); m.cycles.push(cycle(500));
  const card = start(m);
  assert.equal(getTrackedCard(card, m, day).usedBalance, '3000.00');
  assert.equal(getTrackedCard(card, m, day).balanceAdjustment, '0.00');
  assert.equal(card.usedBalance, '3000');
});

test('seguimiento: cargos completos a centavos, edición, efectivo, aportación y otra tarjeta', () => {
  const m = empty(), card = start(m);
  m.expenses.push(charge('100.10', { cashContributionAmount: 80 }));
  m.expenses.push(charge('0.20'), charge(500, { paymentMethod: 'CASH' }), charge(700, { cardId: 'other' }), charge(900, { userId: 'b' }));
  assert.equal(getTrackedCard(card, m, day).usedBalance, '3100.30');
  m.expenses[0].amount = '150.15';
  assert.equal(getTrackedCard(card, m, day).usedBalance, '3150.35');
  m.expenses[0].cardId = 'other';
  assert.equal(getTrackedCard(card, m, day).usedBalance, '3000.20');
  m.expenses = [];
  assert.equal(getTrackedCard(card, m, day).usedBalance, '3000.00');
});

test('seguimiento: cargo anterior al día base queda incluido en el banco; futuro espera su fecha', () => {
  const m = empty(), card = start(m);
  m.expenses.push(charge(100, { date: '2026-10-20' }), charge(200, { date: '2026-10-22' }));
  assert.equal(getTrackedCard(card, m, day).usedBalance, '3000.00');
  assert.equal(getTrackedCard(card, m, '2026-10-22').usedBalance, '3200.00');
});

test('seguimiento: pagos acumulados aplican diferencia y deshacer revierte el pago', () => {
  const m = empty(); m.cycles.push(cycle(1000, { paidAt: '2026-09-01' }));
  const card = start(m);
  m.cycles[0].paidAmount = 1500; m.cycles[0].paidAt = day;
  assert.equal(getTrackedCard(card, m, day).usedBalance, '2500.00');
  assert.equal(getTrackedCard(card, m, day).usedBalance, '2500.00');
  m.cycles[0].paidAmount = null; m.cycles[0].paidAt = null;
  assert.equal(getTrackedCard(card, m, day).usedBalance, '4000.00');
});

test('seguimiento: completar la fecha de un pago histórico aplica solo el incremento del total', () => {
  const m = empty(); m.cycles.push(cycle(500, { paidAt: null }));
  const card = start(m);
  m.cycles[0].paidAt = day; m.cycles[0].paidAmount = 750;
  assert.equal(getTrackedCard(card, m, day).usedBalance, '2750.00');
});

test('seguimiento: MSI suma todo una vez; cuotas y liquidación administrativa no liberan crédito', () => {
  const m = empty(), card = start(m);
  m.purchases.push({ ...charge(0), purchaseDate: day, totalAmount: 12000, status: 'ACTIVE', months: 12, initialPaymentsMade: 0 });
  assert.equal(getTrackedCard(card, m, day).usedBalance, '15000.00');
  m.purchases[0].initialPaymentsMade = 12; m.purchases[0].status = 'PAID_OFF';
  assert.equal(getTrackedCard(card, m, day).usedBalance, '15000.00');
  m.cycles.push(cycle(1000));
  assert.equal(getTrackedCard(card, m, day).usedBalance, '14000.00');
  m.purchases[0].status = 'CANCELLED';
  assert.equal(getTrackedCard(card, m, day).usedBalance, '2000.00');
});

test('seguimiento: convertir un gasto a MSI conserva el cargo sin duplicarlo', () => {
  const m = empty(), card = start(m);
  m.expenses.push(charge(1200));
  const before = getTrackedCard(card, m, day).usedBalance;
  m.expenses = []; m.purchases.push({ ...charge(0), purchaseDate: day, totalAmount: 1200, status: 'ACTIVE' });
  assert.equal(getTrackedCard(card, m, day).usedBalance, before);
});

test('seguimiento: devoluciones, bonificaciones y pagos pueden producir saldo a favor', () => {
  const m = empty(), card = start(m);
  m.cycles.push(cycle(2500, { postCutCreditAmount: 400, postCutCreditDate: day }));
  m.credits.push({ userId: 'a', amount: 200, cycle: { cardId: 'card-a' }, income: { date: day } });
  assert.equal(getTrackedCard(card, m, day).usedBalance, '-100.00');
  m.cycles[0].postCutCreditAmount = 0;
  assert.equal(getTrackedCard(card, m, day).usedBalance, '300.00');
});

test('seguimiento: nueva conciliación absorbe cambios previos y conserva los siguientes', () => {
  const m = empty(), card = start(m);
  m.expenses.push(charge(200));
  const reconciled = { ...card, usedBalance: '3199.99' };
  reconciled.balanceTracking = createBalanceTracking(reconciled, m, day);
  assert.equal(getTrackedCard(reconciled, m, day).usedBalance, '3199.99');
  m.expenses.push(charge('0.01'));
  assert.equal(getTrackedCard(reconciled, m, day).usedBalance, '3200.00');
  assert.equal(isBalanceTrackingValid({ version: 1 }), false);
  assert.equal(getTrackedCard({ ...card, balanceTracking: null }, m, day).balanceTrackingStatus, 'INACTIVE');
});

test('seguimiento: un snapshot concurrente se reintenta solo por error de serialización', async () => {
  let attempts = 0;
  const db = { $transaction: async (fn, options) => { assert.equal(options.isolationLevel, 'RepeatableRead'); if (++attempts < 3) throw Object.assign(new Error('retry'), { code: 'P2034' }); return fn({}); } };
  assert.equal(await runBalanceSnapshot(db, async () => 'ok'), 'ok');
  assert.equal(attempts, 3);
});
