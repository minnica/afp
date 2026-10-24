const assert = require('node:assert/strict');
const { test } = require('node:test');
const { sourceLoader } = require('./helpers/load-source.cjs');
const load = sourceLoader();
const { buildForecast, planDates } = load('src/lib/money/forecast.js');
const { buildSources, accountBalances, exposure } = load('src/lib/money/sources.js');
const { accountSchema, planSchema } = load('src/lib/money/schema.js');
const today = '2026-10-24';
function data(extra = {}) { return { accounts: [{ id: 'a', name: 'Cuenta', openingBalance: '10000', reservedAmount: 0, asOf: today, baseline: {}, annualYield: 0 }], routes: [{ key: 'default:income', accountId: 'a' }, { key: 'default:expense', accountId: 'a' }, { key: 'default:card', accountId: 'a' }, { key: 'default:contribution', accountId: 'a' }], plans: [], transfers: [], cards: [], cycles: [], incomes: [], expenses: [], subscriptions: [], purchases: [], receivables: [], payables: [], ...extra }; }
const plan = extra => ({ id: 'plan', name: 'Nómina', kind: 'PAYROLL', amount: 1000, accountId: 'a', startDate: '2026-10-01', endDate: '2026-11-30', frequencyMonths: 1, days: [15, 31], isActive: true, occurrences: [], ...extra });
const income = extra => ({ id: 'i', amount: 100, concept: 'Ingreso', date: today, ...extra });
const expense = extra => ({ id: 'e', amount: 100, concept: 'Gasto', date: today, paymentMethod: 'CASH', ...extra });
const card = { id: 'card', name: 'Tarjeta', usualCutDay: 20, usualDueDay: 10 };
const cycle = extra => ({ id: 'cycle', cardId: 'card', card, year: 2026, month: 10, startDate: '2026-09-21', cutDate: '2026-10-20', dueDate: '2026-11-10', statementAmount: 1000, paidAmount: 0, credits: [], payments: [], moneyPayments: [], ...extra });

test('Mi dinero: saldo inicial, efectivo, aportaciones y transferencias conservan centavos y no cuentan crédito como salida', () => {
  const d = data({ accounts: [...data().accounts, { ...data().accounts[0], id: 'b', name: 'Efectivo', openingBalance: 500 }], incomes: [income({ amount: '100.10' })], expenses: [expense({ amount: '20.05' }), expense({ id: 'card-expense', paymentMethod: 'CARD', cardId: 'card', amount: 900, cashContributionAmount: '50.05' })], transfers: [{ id: 't', fromAccountId: 'a', toAccountId: 'b', date: today, amount: '75.25', concept: 'Transferencia' }] });
  const r = buildForecast(d, today); assert.equal(r.summary.balance, 10630.10); assert.equal(r.accounts[0].balance, 10054.85); assert.equal(r.accounts[1].balance, 575.25);
});
test('Mi dinero: las capturas iniciales no reaplican movimientos; cambios posteriores, borrados y asignación tardía', () => {
  const d = data({ incomes: [income({ amount: 1000 })] });
  const events = buildSources(d).events; d.accounts[0].baseline = exposure(events, today, today);
  assert.equal(buildForecast(d, today).summary.balance, 10000);
  d.incomes[0].amount = 1200; assert.equal(buildForecast(d, today).summary.balance, 10200);
  d.incomes = []; assert.equal(buildForecast(d, today).summary.balance, 9000);
  const unassigned = data({ routes: [], incomes: [income({ amount: 1000 })] });
  unassigned.accounts[0].baseline = exposure(buildSources(unassigned).events, today, today);
  unassigned.routes = data().routes; assert.equal(buildForecast(unassigned, today).summary.balance, 10000);
});
test('Mi dinero: cargo de tarjeta, abonos capturados, acumulado y devolución se cuentan una sola vez', () => {
  const d = data({ cards: [card], expenses: [expense({ amount: 1000, date: '2026-10-01', cardId: 'card', paymentMethod: 'CARD' })], cycles: [cycle({ paidAmount: 400, paidAt: today, postCutCreditAmount: 100, payments: [{ id: 'p', amount: 250, date: today }] })] });
  const r = buildForecast(d, today); assert.equal(r.summary.balance, 9600);
  assert.equal(r.events.find(e => e.key === 'card-due:cycle').amount, -500);
  d.accounts[0].baseline = exposure(buildSources(d).events, today, today);
  d.cycles[0].payments.push({ id: 'evidence', amount: 150, date: today, kind: 'EXISTING' });
  assert.equal(buildForecast(d, today).summary.balance, 10000);
});
test('Mi dinero: una bonificación aplicada al crédito no es dinero depositado', () => {
  const r = buildForecast(data({ incomes: [income({ amount: 500 })], cycles: [cycle({ statementAmount: 0, credits: [{ incomeId: 'i', amount: 300 }] })] }), today);
  assert.equal(r.summary.balance, 10200);
});
test('Mi dinero: fuentes futuras no modifican el saldo actual', () => {
  const r = buildForecast(data({ incomes: [income({ date: '2026-10-25', amount: 123.45 })] }), today);
  assert.equal(r.summary.balance, 10000); assert.equal(r.daily.find(d => d.date === '2026-10-25').balance, 10123.45);
});
test('Mi dinero: cuotas y suscripciones pasan por el pago de tarjeta, con cuotas que terminan', () => {
  const d = data({ cards: [card], purchases: [{ id: 'msi', cardId: 'card', purchaseDate: '2026-10-22', totalAmount: 600, months: 2, status: 'ACTIVE', concept: 'MSI' }], subscriptions: [{ id: 's', cardId: 'card', paymentMethod: 'CARD', name: 'Servicio', amount: 20, chargeDay: 25, frequencyMonths: 1, startYear: 2026, startMonth: 10, isActive: true, charges: [], dailyExpenses: [] }] });
  const r = buildForecast(d, today), dec = r.events.filter(e => e.kind === 'CARD_DUE' && e.date === '2026-12-10');
  assert.equal(dec[0].amount, -320);
  assert.equal(r.events.find(e => e.kind === 'CARD_DUE' && e.date === '2027-02-10').amount, -20);
  assert.equal(r.events.filter(e => e.kind === 'SUBSCRIPTION').length, 0);
});
test('Mi dinero: una suscripción confirmada u omitida no se vuelve a prever', () => {
  const d = data({ subscriptions: [{ id: 's', paymentMethod: 'CASH', name: 'Servicio', amount: 20, chargeDay: 25, frequencyMonths: 1, startYear: 2026, startMonth: 10, isActive: true, charges: [{ month: '2026-10', status: 'SKIPPED' }], dailyExpenses: [] }] });
  assert.ok(!buildForecast(d, today).events.some(e => e.key === 'subscription:s:2026-10'));
});
test('Mi dinero: los cobros se reparten por fecha y terminan al recuperar el saldo', () => {
  const r = buildForecast(data({ receivables: [{ id: 'r', originalAmount: 250, balanceAdjustment: 0, status: 'ACTIVE', concept: 'Préstamo', originDate: '2026-10-01', expectedMonthlyPayment: 200, expectedChargeDays: [15, 31], incomes: [{ amount: 50, date: '2026-10-15' }] }] }), today);
  const expected = r.events.filter(e => e.kind === 'COLLECTION'); assert.equal(expected.reduce((s, e) => s + e.amount, 0), 200); assert.equal(expected.length, 3);
  const delayed = buildForecast(data({ receivables: [{ id: 'r', originalAmount: 100, status: 'ACTIVE', concept: 'Cobro', originDate: '2026-10-01', expectedMonthlyPayment: 100, expectedChargeDays: [31], incomes: [] }] }), today, { collectionDelay: 10 });
  assert.equal(delayed.events.find(e => e.kind === 'COLLECTION').date, '2026-11-10');
});
test('Mi dinero: nómina neta no descuenta dos veces los préstamos, y permite pago externo explícito', () => {
  const loan = { id: 'loan', accountType: 'LOAN', originalAmount: 10000, currentBalance: 9000, status: 'ACTIVE', paymentAmount: 100, paymentDays: [15, 31], totalPayments: 12, paymentsMade: 10, originDate: '2026-01-01', dailyExpenses: [] };
  const d = data({ payables: [loan], incomes: [income({ amount: 1000 })], expenses: [expense({ amount: 100, payableAccountId: 'loan' })] });
  assert.equal(buildForecast(d, today).summary.balance, 11000); assert.ok(!buildForecast(d, today).events.some(e => e.kind === 'PAYABLE'));
  d.routes.push({ key: 'payable:loan', accountId: 'a' }); assert.equal(buildForecast(d, today).summary.balance, 10900); assert.equal(buildForecast(d, today).events.filter(e => e.kind === 'PAYABLE').length, 2);
});
test('Mi dinero: nómina registrada reemplaza la previsión mensual con abonos parciales', () => {
  const d = data({ plans: [plan({ incomeTypeId: 'salary' })], incomes: [income({ incomeTypeId: 'salary', amount: 1200, date: '2026-10-15' })] });
  const r = buildForecast(d, today); assert.equal(r.events.filter(e => e.planId === 'plan' && e.date.startsWith('2026-10')).reduce((s, e) => s + e.amount, 0), 800);
  const stopped = buildForecast(d, today, { stopPayrollDate: '2026-11-01' }); assert.ok(!stopped.events.some(e => e.kind === 'PAYROLL' && e.date >= '2026-11-01'));
});
test('Mi dinero: omitir una nómina no consume el ingreso que cubre la siguiente', () => {
  const d = data({ plans: [plan({ incomeTypeId: 'salary', occurrences: [{ date: '2026-10-15', status: 'SKIPPED' }] })], incomes: [income({ incomeTypeId: 'salary', amount: 1000, date: '2026-10-24' })] });
  const r = buildForecast(d, today);
  assert.equal(r.events.filter(e => e.planId === 'plan' && e.date.startsWith('2026-10')).length, 0);
  assert.equal(r.planOccurrences.find(o => o.date === '2026-10-31').status, 'MATCHED');
});
test('Mi dinero: vínculo explícito reemplaza una ocurrencia aunque el cobro llegue en otro mes', () => {
  const d = data({ plans: [plan()], incomes: [income({ date: '2026-11-01', amount: 700 })] });
  d.routes.push({ key: 'income:i', accountId: 'a', planId: 'plan', occurrenceDate: '2026-10-31' });
  const r = buildForecast(d, today); assert.equal(r.events.find(e => e.key === 'plan:plan:2026-10-31').amount, 300);
});
test('Mi dinero: presupuesto variable descuenta gasto real y no suma otra vez suscripciones', () => {
  const d = data({ plans: [plan({ kind: 'VARIABLE', amount: 100, categoryId: 'food', endDate: '2026-10-31' })], expenses: [expense({ amount: 40, categoryId: 'food' }), expense({ id: 's', amount: 20, categoryId: 'food', subscriptionId: 'sub' })] });
  const r = buildForecast(d, today); assert.equal(r.events.filter(e => e.kind === 'VARIABLE').reduce((s, e) => s + Math.round(e.amount * 100), 0), -6000);
  const reduced = buildForecast(d, today, { variablePercent: 80 }); assert.equal(reduced.events.filter(e => e.kind === 'VARIABLE').reduce((s, e) => s + Math.round(e.amount * 100), 0), -4000);
});
test('Mi dinero: detecta falta de liquidez antes de una nómina aunque el cierre sea positivo', () => {
  const d = data({ accounts: [{ ...data().accounts[0], openingBalance: 100 }], plans: [plan({ kind: 'EXPENSE', amount: 200, frequencyMonths: 0, startDate: '2026-10-25' }), plan({ id: 'salary', amount: 500, frequencyMonths: 0, startDate: '2026-10-31' })] });
  const r = buildForecast(d, today); assert.equal(r.summary.zeroDate, '2026-10-25'); assert.equal(r.summary.minimum, -100); assert.equal(r.monthly[0].closing, 400);
});
test('Mi dinero: rendimiento diario compuesto, redondeo, topes y reservas a la vista', () => {
  const d = data(); Object.assign(d.accounts[0], { annualYield: '36.5', yieldBasis: 365, yieldTaxPercent: 0, reservedAmount: 9000 });
  const r = buildForecast(d, today); assert.equal(r.daily[1].balance, 10010); assert.equal(r.daily[2].balance, 10020.01); assert.equal(r.summary.balance, 10000);
  d.accounts[0].yieldCap = 5000; const capped = buildForecast(d, today); assert.equal(capped.daily[1].balance, 10005); assert.equal(capped.daily[2].balance, 10010);
});
test('Mi dinero: abono real del rendimiento sustituye estimación de ese día; vigencia termina', () => {
  const d = data({ incomes: [income({ amount: 8, date: '2026-10-25', incomeTypeId: 'yield' })] });
  Object.assign(d.accounts[0], { annualYield: 36.5, yieldBasis: 365, yieldIncomeTypeId: 'yield', yieldEndDate: '2026-10-26' });
  const r = buildForecast(d, today); assert.equal(r.daily[1].balance, 10008); assert.equal(r.events.filter(e => e.kind === 'YIELD').length, 2); assert.equal(r.daily[2].balance, 10018.01); assert.ok(!r.events.some(e => e.kind === 'YIELD' && e.date > '2026-10-27'));
});
test('Mi dinero: retirar todo no bloquea dinero ni genera rendimiento sobre saldo negativo', () => {
  const d = data({ plans: [plan({ kind: 'EXPENSE', amount: 11000, frequencyMonths: 0, startDate: '2026-10-25' })] }); d.accounts[0].annualYield = 10;
  const r = buildForecast(d, today); assert.equal(r.daily[1].balance, -997.26); assert.equal(r.events.filter(e => e.kind === 'YIELD').length, 1); assert.ok(!r.events.some(e => e.kind === 'YIELD' && e.date > '2026-10-25'));
});
test('Mi dinero: ausencia de cuentas y datos faltantes no simulan un saldo verificado', () => {
  const d = data({ routes: [], incomes: [income({})], plans: [plan({ accountId: 'missing' })] });
  const r = buildForecast(d, today); assert.ok(r.issues.some(i => i.key === 'unassigned')); assert.ok(r.issues.some(i => i.key === 'future-unassigned')); assert.equal(r.summary.balance, 10000);
});
test('Mi dinero: fin de mes y año bisiesto sin duplicar días ajustados', () => {
  const p = plan({ startDate: '2028-01-01', endDate: '2028-12-31', days: [29, 30, 31] });
  assert.deepEqual(Array.from(planDates(p, '2028-02-01', '2028-02-29')), ['2028-02-29']);
});
test('Mi dinero: validación de saldos, tasas y planes', () => {
  const valid = { name: 'Cuenta', kind: 'BANK', openingBalance: 0, reservedAmount: 0, asOf: today };
  assert.ok(accountSchema.safeParse(valid).success);
  for (const [draft, expected] of [['', 0], ['15', 15], ['0.15', 0.15], ['15.125', 15.125]]) {
    const account = accountSchema.parse({ ...valid, annualYield: draft, yieldTaxPercent: draft });
    assert.equal(account.annualYield, expected); assert.equal(account.yieldTaxPercent, expected);
  }
  for (const values of [{ openingBalance: true }, { openingBalance: '1.001' }, { asOf: '2026-02-30' }, { annualYield: -1 }, { yieldBasis: 0 }, { yieldFrequency: 'MONTHLY' }, { yieldCap: -1 }, { yieldStartDate: '2026-11-01', yieldEndDate: '2026-10-01' }]) assert.equal(accountSchema.safeParse({ ...valid, ...values }).success, false);
  assert.ok(planSchema.safeParse(plan()).success); assert.equal(planSchema.safeParse(plan({ kind: 'VARIABLE', categoryId: '' })).success, false);
});
