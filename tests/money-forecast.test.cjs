const assert = require('node:assert/strict');
const { test } = require('node:test');
const { sourceLoader } = require('./helpers/load-source.ts');
const load = sourceLoader();
const { buildForecast, planDates } = load('src/lib/money/forecast.ts');
const { buildSources, accountBalances, exposure } = load('src/lib/money/sources.ts');
const { accountSchema, planSchema } = load('src/lib/money/schema.ts');
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
  const r = buildForecast(data({ receivables: [{ id: 'r', originalAmount: 250, balanceAdjustment: 0, status: 'ACTIVE', concept: 'Préstamo', originDate: '2026-10-01', expectedMonthlyPayment: 100, expectedChargeDays: [15, 31], incomes: [{ amount: 50, date: '2026-10-15' }] }] }), today);
  const expected = r.events.filter(e => e.kind === 'COLLECTION'); assert.equal(expected.reduce((s, e) => s + e.amount, 0), 200); assert.equal(expected.length, 3);
  const delayed = buildForecast(data({ receivables: [{ id: 'r', originalAmount: 100, status: 'ACTIVE', concept: 'Cobro', originDate: '2026-10-01', expectedMonthlyPayment: 100, expectedChargeDays: [31], incomes: [] }] }), today, { collectionDelay: 10 });
  assert.equal(delayed.events.find(e => e.kind === 'COLLECTION').date, '2026-11-10');
});
test('Mi dinero: el importe de un cobro quincenal se aplica completo en cada fecha', () => {
  const d = data({ receivables: [{ id: 'r', originalAmount: 10000, status: 'ACTIVE', concept: 'Camioneta', originDate: '2026-10-01', expectedMonthlyPayment: 1750, expectedChargeDays: [15, 31], incomes: [{ amount: 1750, date: '2026-10-15' }] }] });
  const r = buildForecast(d, today), collections = r.events.filter(e => e.kind === 'COLLECTION');
  assert.deepEqual(Array.from(collections.filter(e => e.date.startsWith('2026-10')), e => [e.date, e.amount]), [['2026-10-31', 1750]]);
  assert.equal(collections.filter(e => e.date.startsWith('2026-11')).reduce((sum, e) => sum + e.amount, 0), 3500);
  assert.equal(collections.reduce((sum, e) => sum + e.amount, 0), 8250);
});
test('Mi dinero: excluir un cobro incierto conserva su registro y los abonos reales', () => {
  const payment = income({ amount: 40, receivableAccountId: 'r' });
  const receivable = { id: 'r', originalAmount: 300, status: 'ACTIVE', concept: 'Incierto', originDate: '2026-10-01', expectedMonthlyPayment: 100, expectedChargeDays: [31], incomes: [payment] };
  const d = data({ receivables: [receivable], incomes: [payment] });
  const original = buildForecast(d, today);
  d.routes.push({ key: 'receivable-forecast:r', excluded: true, accountId: null });
  const before = JSON.stringify(d), excluded = buildForecast(d, today);
  assert.equal(excluded.summary.balance, original.summary.balance);
  assert.equal(excluded.summary.balance, 10040);
  assert.ok(!excluded.events.some(e => e.key.startsWith('receivable:r:')));
  assert.ok(!excluded.issues.some(i => i.key === 'receivable:r'));
  assert.equal(excluded.actual.find(e => e.key === 'income:i').excluded, false);
  assert.equal(JSON.stringify(d), before);
  d.routes = d.routes.filter(r => r.key !== 'receivable-forecast:r');
  assert.ok(buildForecast(d, today).events.some(e => e.key.startsWith('receivable:r:')));
});
test('Mi dinero: excluir previsión sin calendario permite recibir nuevos abonos incluso con fecha futura', () => {
  const d = data({ receivables: [{ id: 'r', originalAmount: 300, status: 'ACTIVE', concept: 'Incierto', originDate: '2026-10-01', expectedMonthlyPayment: null, expectedChargeDays: [], incomes: [] }] });
  d.routes.push({ key: 'receivable-forecast:r', excluded: true });
  assert.ok(!buildForecast(d, today).issues.some(i => i.key === 'receivable:r'));
  const payment = income({ amount: 80, receivableAccountId: 'r', date: '2026-10-25' });
  d.incomes.push(payment); d.receivables[0].incomes.push(payment);
  const r = buildForecast(d, today);
  assert.equal(r.summary.balance, 10000);
  assert.equal(r.events.find(e => e.key === 'income:i').amount, 80);
  assert.equal(r.daily.find(d => d.date === '2026-10-25').balance, 10080);
  assert.equal(buildForecast(d, '2026-10-25').summary.balance, 10080);
});
test('Mi dinero: la cuenta prevista para un cobro es independiente de sus ingresos reales', () => {
  const payment = income({ amount: 40, receivableAccountId: 'r' });
  const d = data({ accounts: [...data().accounts, { ...data().accounts[0], id: 'b', openingBalance: 0 }], receivables: [{ id: 'r', originalAmount: 100, status: 'ACTIVE', concept: 'Cobro', originDate: '2026-10-01', expectedMonthlyPayment: 100, expectedChargeDays: [31], incomes: [payment] }], incomes: [payment] });
  d.routes.push({ key: 'receivable-forecast:r', excluded: false, accountId: 'b' });
  const r = buildForecast(d, today);
  assert.equal(r.actual.find(e => e.key === 'income:i').accountId, 'a');
  assert.equal(r.events.find(e => e.key === 'receivable:r:2026-10-31').accountId, 'b');
  assert.equal(r.events.find(e => e.key === 'receivable:r:2026-10-31').amount, 60);
});
test('Mi dinero: fechas de cobro ajustadas a febrero no duplican el importe por ocurrencia', () => {
  const d = data({ receivables: [{ id: 'r', originalAmount: 5000, status: 'ACTIVE', concept: 'Cobro', originDate: '2027-02-01', expectedMonthlyPayment: 1750, expectedChargeDays: [30, 31], incomes: [] }] });
  const r = buildForecast(d, '2027-02-01');
  assert.deepEqual(Array.from(r.events.filter(e => e.kind === 'COLLECTION' && e.date.startsWith('2027-02')), e => [e.date, e.amount]), [['2027-02-28', 1750]]);
});
test('Mi dinero: ofrece una regla de previsión independiente solo para cuentas por cobrar activas', () => {
  const service = sourceLoader({ '@/lib/apiAuth': { ApiAccessError: class extends Error {} } })('src/lib/money/service.ts');
  const options = service.routingOptions(data({ incomeTypes: [], receivables: [{ id: 'r', status: 'ACTIVE', concept: 'Préstamo' }, { id: 'closed', status: 'PAID_OFF', concept: 'Liquidado' }] }));
  assert.ok(options.some(o => o.key === 'receivable:r'));
  assert.ok(options.some(o => o.key === 'receivable-forecast:r' && o.forecastOnly));
  assert.ok(!options.some(o => o.key === 'receivable-forecast:closed'));
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
test('Mi dinero: consumo registrado cubre la cuota diaria, separado de suscripciones, deudas y otras previsiones', () => {
  const d = data({ plans: [plan({ kind: 'VARIABLE', amount: 310, categoryId: 'food', endDate: '2026-10-31' })], expenses: [expense({ amount: 4, categoryId: 'food' }), expense({ id: 's', amount: 20, categoryId: 'food', subscriptionId: 'sub' }), expense({ id: 'debt', amount: 20, categoryId: 'food', payableAccountId: 'debt' }), expense({ id: 'planned', amount: 20, categoryId: 'food' })] });
  d.routes.push({ key: 'expense:planned', accountId: 'a', planId: 'another-plan' });
  const r = buildForecast(d, today); assert.equal(r.events.filter(e => e.kind === 'VARIABLE').reduce((s, e) => s + Math.round(e.amount * 100), 0), -7600);
  const reduced = buildForecast(d, today, { variablePercent: 80 }); assert.equal(reduced.events.filter(e => e.kind === 'VARIABLE').reduce((s, e) => s + Math.round(e.amount * 100), 0), -6000);
});
test('Mi dinero: cinco días pendientes no concentran el presupuesto sin gastar ni desaparecen al superarlo', () => {
  for (const alreadySpent of [0, 1000, 4000]) {
    const d = data({ plans: [plan({ kind: 'VARIABLE', amount: 3100, categoryId: 'food', startDate: '2026-10-27', endDate: '2026-10-31' })], expenses: [expense({ amount: alreadySpent, categoryId: 'food', date: '2026-10-26' })] });
    const r = buildForecast(d, '2026-10-27');
    const projected = r.events.filter(e => e.kind === 'VARIABLE');
    assert.equal(projected.length, 5);
    assert.ok(projected.every(e => e.amount === -100 && e.status === 'ESTIMATED'));
    assert.equal(r.monthly[0].outgoing, 500);
  }
});
test('Mi dinero: registrar hoy reduce solo la estimación de hoy y conserva el saldo real', () => {
  const d = data({ plans: [plan({ kind: 'VARIABLE', amount: 3100, categoryId: 'food', endDate: '2026-10-31' })], expenses: [expense({ amount: 30, categoryId: 'food', date: '2026-10-26' }), expense({ id: 'second', amount: 20, categoryId: 'food', date: '2026-10-26', paymentMethod: 'DEBIT', debitAccountId: 'a' })] });
  const before = JSON.stringify(d), r = buildForecast(d, '2026-10-26');
  assert.equal(r.summary.balance, 9950);
  assert.equal(r.events.find(e => e.key === 'budget:plan:2026-10-26').amount, -50);
  assert.equal(r.monthly[0].outgoing, 550);
  assert.equal(r.monthly[0].closing, 9400);
  assert.equal(buildForecast(d, '2026-10-27').monthly[0].outgoing, 500);
  assert.equal(JSON.stringify(d), before);
  d.expenses[0].amount = 300;
  const overspent = buildForecast(d, '2026-10-26');
  assert.ok(!overspent.events.some(e => e.key === 'budget:plan:2026-10-26'));
  assert.equal(overspent.monthly[0].outgoing, 500);
  assert.equal(overspent.summary.balance, 9680);
});
test('Mi dinero: un gasto futuro registrado sustituye su estimación diaria y conserva su importe completo', () => {
  const d = data({ plans: [plan({ kind: 'VARIABLE', amount: 3100, categoryId: 'food', endDate: '2026-10-31' })], expenses: [expense({ amount: 30, categoryId: 'food', date: '2026-10-28' })] });
  const r = buildForecast(d, '2026-10-27');
  assert.equal(r.summary.balance, 10000);
  assert.equal(r.events.find(e => e.key === 'expense:e').amount, -30);
  assert.equal(r.events.find(e => e.key === 'budget:plan:2026-10-28').amount, -70);
  assert.equal(r.monthly[0].outgoing, 500);
  d.expenses[0].amount = 300;
  const larger = buildForecast(d, '2026-10-27');
  assert.ok(!larger.events.some(e => e.key === 'budget:plan:2026-10-28'));
  assert.equal(larger.events.find(e => e.key === 'expense:e').amount, -300);
  assert.equal(larger.monthly[0].outgoing, 700);
});
test('Mi dinero: vigencia parcial conserva el ritmo mensual y respeta el cambio de mes', () => {
  const d = data({ plans: [plan({ kind: 'VARIABLE', amount: 3100, categoryId: 'food', startDate: '2026-10-29', endDate: '2026-11-02' })] });
  const r = buildForecast(d, today), events = r.events.filter(e => e.kind === 'VARIABLE');
  assert.deepEqual(Array.from(events, e => [e.date, e.amount]), [['2026-10-29', -100], ['2026-10-30', -100], ['2026-10-31', -100], ['2026-11-01', -103.33], ['2026-11-02', -103.34]]);
  assert.equal(r.monthly[0].outgoing, 300);
  assert.equal(r.monthly[1].outgoing, 206.67);
});
test('Mi dinero: referencia diaria conserva centavos en meses de 28, 29, 30 y 31 días', () => {
  for (const [start, end, days] of [['2027-02-01', '2027-02-28', 28], ['2028-02-01', '2028-02-29', 29], ['2026-11-01', '2026-11-30', 30], ['2026-10-01', '2026-10-31', 31]]) {
    const d = data({ accounts: [{ ...data().accounts[0], asOf: start }], plans: [plan({ kind: 'VARIABLE', amount: '100.01', categoryId: 'food', startDate: start, endDate: end })] });
    const r = buildForecast(d, start), events = r.events.filter(e => e.kind === 'VARIABLE');
    assert.equal(events.length, days);
    assert.equal(events.reduce((sum, e) => sum - Math.round(e.amount * 100), 0), 10001);
    assert.equal(r.monthly[0].outgoing, 100.01);
    assert.ok(Math.max(...events.map(e => -Math.round(e.amount * 100))) - Math.min(...events.map(e => -Math.round(e.amount * 100))) <= 1);
    const lastDay = buildForecast(d, end).events.filter(e => e.kind === 'VARIABLE');
    assert.equal(lastDay.length, 1);
    assert.equal(lastDay[0].amount, events.at(-1).amount);
  }
});
test('Mi dinero: releer días después no mueve centavos entre fechas ni acumula días sin gasto', () => {
  const d = data({ plans: [plan({ kind: 'VARIABLE', amount: '100.01', categoryId: 'food', endDate: '2026-10-31' })] });
  const first = buildForecast(d, today).events.filter(e => e.kind === 'VARIABLE' && e.date >= '2026-10-27');
  const later = buildForecast(d, '2026-10-27').events.filter(e => e.kind === 'VARIABLE');
  assert.deepEqual(Array.from(later, e => [e.date, e.amount]), Array.from(first, e => [e.date, e.amount]));
});
test('Mi dinero: escenario de gasto variable ajusta el ritmo sin crear movimientos ni cambiar saldos', () => {
  const d = data({ plans: [plan({ kind: 'VARIABLE', amount: 3100, categoryId: 'food', endDate: '2026-10-31' })] });
  const before = JSON.stringify(d);
  for (const [variablePercent, expected] of [[0, 0], [80, 400], [100, 500], [300, 1500]]) {
    const r = buildForecast(d, '2026-10-27', { variablePercent });
    assert.equal(r.summary.balance, 10000);
    assert.equal(r.monthly[0].outgoing, expected);
    assert.ok(r.events.every(e => e.amount !== 0));
  }
  assert.equal(JSON.stringify(d), before);
});
test('Mi dinero: consumo diario a crédito sustituye compras registradas y sale al pagar cada corte', () => {
  const credit = { ...card, usualCutDay: 28 };
  const d = data({ cards: [credit], plans: [plan({ kind: 'VARIABLE', amount: 3100, categoryId: 'food', cardId: credit.id, startDate: '2026-10-27', endDate: '2026-10-31' })], expenses: [expense({ categoryId: 'food', amount: 40, date: '2026-10-28', paymentMethod: 'CARD', cardId: credit.id })] });
  const r = buildForecast(d, '2026-10-27');
  assert.equal(r.summary.balance, 10000);
  assert.equal(r.monthly[0].outgoing, 0);
  assert.ok(!r.events.some(e => e.kind === 'VARIABLE'));
  assert.deepEqual(Array.from(r.events.filter(e => e.kind === 'CARD_DUE'), e => [e.date, e.amount]), [['2026-11-10', -200], ['2026-12-10', -300]]);
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
