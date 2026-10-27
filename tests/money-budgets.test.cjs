const assert = require('node:assert/strict');
const { test } = require('node:test');
const { sourceLoader } = require('./helpers/load-source.cjs');
const load = sourceLoader();
const { buildForecast } = load('src/lib/money/forecast.js');
const { allocateBudgetCents, personalExpenseAmounts, buildBudgetPaymentMix } = load('src/lib/money/budgets.js');
const { cents } = load('src/lib/money/sources.js');
const card = { id: 'credit', name: 'Crédito', usualCutDay: 31, usualDueDay: 10 };
const mix = { version: 1, referenceMonths: ['2026-05', '2026-06'], cashWeight: 3, cards: [{ cardId: card.id, weight: 1 }], sampleCount: 2 };
const plan = extra => ({ id: 'budget', kind: 'VARIABLE', name: 'Comida', categoryId: 'food', amount: 3100, accountId: 'cash', paymentMix: mix, startDate: '2026-10-01', endDate: '2026-10-31', frequencyMonths: 1, days: [], isActive: true, ...extra });
const expense = extra => ({ id: 'e', date: '2026-10-01', amount: 100, concept: 'Comida', categoryId: 'food', paymentMethod: 'CASH', ...extra });
function data(extra = {}) {
  return { accounts: [{ id: 'cash', name: 'Cuenta', openingBalance: 10000, asOf: '2026-10-01', baseline: {}, reservedAmount: 0, annualYield: 0 }], routes: [{ key: 'default:expense', accountId: 'cash' }, { key: 'default:card', accountId: 'cash' }, { key: 'default:income', accountId: 'cash' }], plans: [plan()], cards: [card], cycles: [], expenses: [], incomes: [], transfers: [], withdrawals: [], subscriptions: [], purchases: [], receivables: [], payables: [], ...extra };
}
const outgoing = (forecast, kind) => -forecast.events.filter(event => !kind || event.kind === kind).reduce((sum, event) => sum + cents(event.amount), 0);

test('presupuesto mixto: un importe por categoría conserva el total y difiere el crédito hasta su pago', () => {
  const d = data(), before = JSON.stringify(d), result = buildForecast(d, '2026-10-01');
  assert.equal(outgoing(result, 'VARIABLE'), 232500);
  assert.equal(outgoing(result, 'CARD_DUE'), 77500);
  assert.equal(outgoing(result), 310000);
  assert.ok(result.events.filter(event => event.kind === 'CARD_DUE').every(event => event.date === '2026-11-10'));
  assert.equal(result.monthly.find(month => month.month === '2026-10').outgoing, 2325);
  assert.equal(result.variableBudgets[0].monthlyAmount, 3100);
  assert.equal(JSON.stringify(d), before, 'el cálculo no crea gastos ni cambia planes');
});
test('presupuesto mixto: un gasto real de crédito cubre la cuota diaria completa, sin exigir coincidencia de medio', () => {
  const result = buildForecast(data({ expenses: [expense({ paymentMethod: 'CARD', cardId: card.id })] }), '2026-10-01');
  assert.ok(!result.events.some(event => event.key === 'budget:budget:2026-10-01'));
  assert.equal(result.summary.balance, 10000);
  assert.equal(outgoing(result, 'VARIABLE'), 225000);
  assert.equal(outgoing(result, 'CARD_DUE'), 85000);
  assert.equal(outgoing(result), 310000);
  assert.equal(result.variableBudgets[0].recordedAmount, 100);
});
test('presupuesto mixto: adelantos recuperables completos no consumen el presupuesto personal ni desaparecen del saldo real', () => {
  const d = data({ plans: [plan({ amount: 3100, paymentMix: null, endDate: '2026-10-01' })], expenses: [expense({ amount: 300, receivableAccountId: 'r' })], receivables: [{ id: 'r', status: 'PAID_OFF', originalAmount: 300, incomes: [] }] });
  const result = buildForecast(d, '2026-10-01');
  assert.equal(result.summary.balance, 9700);
  assert.equal(result.events.find(event => event.kind === 'VARIABLE').amount, -100);
  assert.equal(result.variableBudgets[0].recordedAmount, 0);
});
test('presupuesto mixto: un adelanto parcial cuenta solo su parte personal y no depende de haber cobrado', () => {
  const d = data({ plans: [plan({ paymentMix: null, endDate: '2026-10-01' })], expenses: [expense({ amount: 200, receivableAccountId: 'r' })], receivables: [{ id: 'r', status: 'PAID_OFF', originalAmount: 150, incomes: [] }] });
  const result = buildForecast(d, '2026-10-01');
  assert.equal(result.summary.balance, 9800);
  assert.equal(result.events.find(event => event.kind === 'VARIABLE').amount, -50);
  assert.equal(result.variableBudgets[0].recordedAmount, 50);
  d.receivables[0].incomes.push({ amount: 150, date: '2026-10-01' });
  assert.equal(buildForecast(d, '2026-10-01').variableBudgets[0].recordedAmount, 50);
});
test('presupuesto mixto: varios gastos de un mismo adelanto reparten el principal sin perder centavos ni duplicar aportaciones', () => {
  const d = data({ expenses: [expense({ id: 'one', amount: '1.01', receivableAccountId: 'r' }), expense({ id: 'two', amount: 2, receivableAccountId: 'r', cashContributionAmount: 1 })], receivables: [{ id: 'r', originalAmount: '1.01' }] });
  const amounts = personalExpenseAmounts(d);
  assert.equal(amounts.get('one'), 67); assert.equal(amounts.get('two'), 100);
});
test('presupuesto mixto: la muestra combina efectivo, débito y tarjetas y excluye deuda, suscripciones, adelantos y gastos vinculados', () => {
  const d = data({ expenses: [expense({ id: 'cash', date: '2026-05-03', amount: 30 }), expense({ id: 'debit', date: '2026-06-03', amount: 20, paymentMethod: 'DEBIT' }), expense({ id: 'credit', date: '2026-06-04', amount: 50, paymentMethod: 'CARD', cardId: card.id }), expense({ id: 'fixed', date: '2026-06-04', amount: 500, subscriptionId: 's' }), expense({ id: 'debt', date: '2026-06-04', amount: 500, payableAccountId: 'p' }), expense({ id: 'advance', date: '2026-06-04', amount: 500, receivableAccountId: 'r' }), expense({ id: 'linked', date: '2026-06-04', amount: 500 }), expense({ id: 'outside', date: '2026-07-04', amount: 500 })], receivables: [{ id: 'r', originalAmount: 500 }] });
  d.routes.push({ key: 'expense:linked', planId: 'special' });
  const result = buildBudgetPaymentMix(d, 'food', ['2026-05', '2026-06']);
  assert.equal(result.cashWeight, 5000); assert.equal(result.cards[0].weight, 5000); assert.equal(result.sampleCount, 3);
  assert.throws(() => buildBudgetPaymentMix(d, 'unknown', ['2026-05']), /No hay gastos/);
});
test('presupuesto mixto: centavos, importes grandes y orden de prioridades conservan exactamente el importe', () => {
  for (const total of [0, 1, 2, 99, 100, 999999999999]) {
    const result = allocateBudgetCents(total, [945350, 184300, 170000]);
    assert.equal(result.reduce((sum, value) => sum + value, 0), total);
    assert.ok(result.every(Number.isSafeInteger));
  }
  assert.deepEqual(Array.from(allocateBudgetCents(1, [1, 1])), [1, 0]);
  const forecast = buildForecast(data({ plans: [plan({ amount: '31.01' })] }), '2026-10-01');
  assert.equal(outgoing(forecast), 3101);
});
test('presupuesto mixto: el escenario modifica el consumo total una sola vez', () => {
  const result = buildForecast(data(), '2026-10-01', { variablePercent: 50 });
  assert.equal(outgoing(result), 155000);
  assert.equal(result.variableBudgets[0].monthlyAmount, 1550);
});
test('presupuesto mixto: una tarjeta eliminada conserva la salida estimada y produce un solo movimiento diario', () => {
  const result = buildForecast(data({ cards: [], plans: [plan({ endDate: '2026-10-01' })] }), '2026-10-01');
  assert.equal(outgoing(result, 'VARIABLE'), 10000);
  assert.equal(result.events.length, 1);
  assert.equal(result.issues.filter(issue => issue.key.startsWith('budget-card:')).length, 1);
});
test('proyección completa: los períodos antiguos liquidados quedan como revisión histórica; una deuda pendiente mantiene el aviso actual', () => {
  const historical = [
    { id: 'one', cardId: card.id, card, year: 2026, month: 3, startDate: '2026-02-01', cutDate: '2026-03-01', dueDate: '2026-03-20', statementAmount: 100, paidAmount: 100, paidAt: '2026-03-20', credits: [] },
    { id: 'two', cardId: card.id, card, year: 2026, month: 4, startDate: '2026-03-01', cutDate: '2026-04-01', dueDate: '2026-04-20', statementAmount: 100, paidAmount: 100, paidAt: '2026-04-20', credits: [] },
  ];
  const d = data({ cycles: historical });
  assert.equal(buildForecast(d, '2026-10-01').issues.find(issue => issue.key === 'overlap:credit').scope, 'HISTORICAL');
  d.cycles[1].paidAmount = 90;
  assert.equal(buildForecast(d, '2026-10-01').issues.find(issue => issue.key === 'overlap:credit').scope, 'PROJECTION');
});
