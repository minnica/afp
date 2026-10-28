import assert from 'node:assert/strict';
import { test } from 'node:test';
import { present, sparseCalculations, uncheckedFixture } from './helpers/financial-fixtures';
import { sourceLoader } from './helpers/load-source.ts';
const load = sourceLoader();
const { buildProjectionBreakdown, monthlyBreakdownEvents } = sparseCalculations(load('src/components/mi-dinero/projectionBreakdown.ts'));
const { buildForecast } = sparseCalculations(load('src/lib/money/forecast.ts'));
const accounts = [{ id: 'a', name: 'Banco' }, { id: 'b', name: 'Cajita' }];
const event = (extra: Partial<Parameters<typeof buildProjectionBreakdown>[0][number]> = {}) => ({ date: '2026-11-01', amount: -100, label: 'Concepto', kind: 'EXPENSE' as const, accountId: 'a', status: 'EXPECTED' as const, ...extra });

test('desglose: agrupa los días por categoría y los rendimientos por cuenta conservando centavos', () => {
  const events = Array.from({ length: 30 }, (_, index) => event({ date: `2026-11-${String(index + 1).padStart(2, '0')}`, amount: -0.10, kind: 'VARIABLE' as const, planId: 'food', label: 'Comida', status: 'ESTIMATED' as const }));
  events.push(...events.map(item => ({ ...item, amount: 0.01, kind: 'YIELD' as const, accountId: 'b' })));
  const before = JSON.stringify(events);
  const result = buildProjectionBreakdown(events, accounts, [{ id: 'food', categoryId: 'food-category' }]);
  const variable = result.groups.find(group => group.id === 'variable');
  const yields = result.groups.find(group => group.id === 'yield');
  assert.equal(present(variable).rows.length, 1);
  assert.equal(present(variable).amount, -3);
  assert.equal(present(yields).rows.length, 1);
  assert.equal(present(yields).amount, 0.30);
  assert.equal(present(present(yields).rows[0]).label, 'Cajita');
  assert.equal(JSON.stringify(events), before);
});

test('desglose: conserva cuenta, fechas y certeza cuando un concepto tiene distintos estados', () => {
  const result = buildProjectionBreakdown([
    event({ label: 'Tarjeta', kind: 'CARD_DUE' as const, status: 'COMMITTED' as const }),
    event({ label: 'Tarjeta', kind: 'CARD_DUE' as const, status: 'ESTIMATED' as const, date: '2026-11-15' }),
    event({ label: 'Tarjeta', kind: 'CARD_DUE' as const, status: 'COMMITTED' as const, accountId: 'b' }),
    event({ label: 'Nómina', kind: 'PAYROLL' as const, amount: 1000 }),
    event({ label: 'Nómina', kind: 'PAYROLL' as const, amount: 1000, date: '2026-11-15' }),
  ], accounts);
  assert.equal(present(result.groups.find(group => group.id === 'payments')).rows.length, 3);
  const payroll = present(result.groups.find(group => group.id === 'income')).rows[0];
  assert.equal(present(payroll).amount, 2000);
  assert.equal(present(payroll).dates.join(','), '2026-11-01,2026-11-15');
});

test('desglose: las transferencias tienen efecto neto cero y conservan su efecto al filtrar una cuenta', () => {
  const transfers = [event({ kind: 'TRANSFER' as const, amount: -100 }), event({ kind: 'TRANSFER' as const, amount: 100, accountId: 'b' })];
  const total = buildProjectionBreakdown(transfers, accounts).groups;
  assert.equal(total.length, 1);
  assert.equal(present(total[0]).id, 'transfers');
  assert.equal(present(total[0]).amount, 0);
  assert.equal(present(buildProjectionBreakdown(transfers.filter(item => item.accountId === 'a'), accounts).groups[0]).amount, -100);
});

test('desglose: los importes sin cuenta o excluidos no se presentan como parte del saldo proyectado', () => {
  const result = buildProjectionBreakdown([
    event({ accountId: null }), event({ accountId: 'deleted' }),
    event({ excluded: true }), event({ amount: 0 }),
  ], accounts);
  assert.equal(result.groups.length, 0);
  assert.equal(result.unassignedCount, 2);
  assert.equal(buildProjectionBreakdown([], accounts).groups.length, 0);
});

test('desglose: coincide con el flujo mensual del motor y el crédito variable pasa una sola vez por la tarjeta', () => {
  const today = '2026-10-27';
  const data = {
    accounts: [{ ...accounts[0], openingBalance: 10000, reservedAmount: 0, asOf: today, baseline: {}, annualYield: 0 }],
    routes: [{ key: 'default:income', accountId: 'a' }, { key: 'default:expense', accountId: 'a' }, { key: 'default:card', accountId: 'a' }],
    plans: [{ id: 'food', name: 'Comida', kind: 'VARIABLE' as const, categoryId: 'food', amount: 3100, startDate: '2026-10-01', frequencyMonths: 1, days: [], isActive: true, accountId: 'a', paymentMix: { cashWeight: 1, cards: [{ cardId: 'card', weight: 1 }] } }],
    cards: [{ id: 'card', name: 'Tarjeta', usualCutDay: 31, usualDueDay: 10 }],
    incomes: [], expenses: [], cycles: [], subscriptions: [], purchases: [], receivables: [], payables: [], transfers: [],
  };
  const forecast = buildForecast(data, today);
  for (const month of forecast.monthly) {
    const result = buildProjectionBreakdown(forecast.events.filter(item => item.date.startsWith(month.month)), forecast.accounts, data.plans);
    assert.equal(result.groups.reduce((sum, group) => sum + Math.max(0, group.cents), 0), Math.round(month.incoming * 100));
    assert.equal(result.groups.reduce((sum, group) => sum + Math.max(0, -group.cents), 0), Math.round(month.outgoing * 100));
  }
  const october = buildProjectionBreakdown(forecast.events.filter(item => item.date.startsWith('2026-10')), forecast.accounts, data.plans);
  assert.equal(present(october.groups.find(group => group.id === 'variable')).amount, -250);
  const november = buildProjectionBreakdown(forecast.events.filter(item => item.date.startsWith('2026-11')), forecast.accounts, data.plans);
  assert.equal(present(november.groups.find(group => group.id === 'payments')).amount, -250);
});

function wholeMonthFixture() {
  const today = '2026-10-27';
  const card = { id: 'card', name: 'Tarjeta', usualCutDay: 20, usualDueDay: 30 };
  return {
    accounts: [{ ...accounts[0], openingBalance: 10000, reservedAmount: 0, asOf: today, baseline: {}, annualYield: 0 }],
    routes: [{ key: 'default:income', accountId: 'a' }, { key: 'default:expense', accountId: 'a' }, { key: 'default:card', accountId: 'a' }],
    plans: [
      { id: 'food', name: 'Comida', kind: 'VARIABLE' as const, categoryId: 'food', amount: 3100, startDate: '2026-10-01', frequencyMonths: 1, days: [], isActive: true, accountId: 'a' },
      { id: 'payroll', name: 'Nómina', kind: 'PAYROLL' as const, incomeTypeId: 'salary', amount: 1000, startDate: '2026-10-01', frequencyMonths: 1, days: [15, 31], isActive: true, accountId: 'a', occurrences: [] },
    ],
    cards: [card],
    cycles: [{ id: 'oct', cardId: 'card', card, startDate: '2026-09-21', cutDate: '2026-10-20', dueDate: '2026-10-30', year: 2026, month: 10, statementAmount: 1000, paidAmount: 200, paidAt: '2026-10-25', credits: [], payments: [], moneyPayments: [] }],
    incomes: [
      { id: 'salary', date: '2026-10-15', amount: 1000, incomeTypeId: 'salary', concept: 'Nómina' },
      { id: 'future', date: '2026-10-30', amount: 250, concept: 'Ingreso a futuro' },
      { id: 'previous-month', date: '2026-09-30', amount: 99, concept: 'Mes anterior' },
    ],
    expenses: [
      { id: 'food-past', date: '2026-10-02', amount: 100, categoryId: 'food', paymentMethod: 'CASH' as const, concept: 'Comida pasada' },
      { id: 'food-today', date: today, amount: 50, categoryId: 'food', paymentMethod: 'CASH' as const, concept: 'Comida de hoy' },
      { id: 'food-future', date: '2026-10-28', amount: 25, categoryId: 'food', paymentMethod: 'CASH' as const, concept: 'Gasto registrado a futuro' },
      { id: 'credit', date: '2026-10-05', amount: 1000, categoryId: 'food', paymentMethod: 'CARD' as const, cardId: 'card', concept: 'Compra con crédito' },
    ],
    subscriptions: [], purchases: [], receivables: [], payables: [], transfers: [],
  };
}

test('mes completo: suma historial anterior a la referencia, hoy y previsiones sin duplicar registros futuros ni crédito', () => {
  const data = wholeMonthFixture();
  const forecast = buildForecast(data, '2026-10-27');
  const before = JSON.stringify(forecast);
  const selected = uncheckedFixture(monthlyBreakdownEvents, forecast, '2026-10');
  const result = buildProjectionBreakdown(selected, forecast.accounts, data.plans);
  const income = result.groups.find(group => group.id === 'income');
  assert.equal(present(income).registeredAmount, 1000);
  assert.equal(present(income).expectedAmount, 1250);
  assert.equal(present(income).amount, 2250);
  const variable = result.groups.find(group => group.id === 'variable');
  assert.equal(present(variable).registeredAmount, -150);
  assert.equal(present(variable).expectedAmount, -450);
  assert.equal(present(variable).amount, -600);
  const payments = result.groups.find(group => group.id === 'payments');
  assert.equal(present(payments).registeredAmount, -200);
  assert.equal(present(payments).expectedAmount, -800);
  assert.equal(present(payments).amount, -1000);
  assert.equal(selected.filter(item => item.key === 'income:future').length, 1);
  assert.equal(selected.filter(item => item.key === 'expense:food-future').length, 1);
  assert.ok(!selected.some(item => item.label === 'Mes anterior' || item.label === 'Compra con crédito'));
  assert.ok(present(selected.find(item => item.key === 'expense:food-past')).includedInReference);
  assert.ok(present(present(payments).rows.find(row => row.phase === 'REGISTERED')).approximateDate);
  assert.equal(JSON.stringify(forecast), before);
});

test('mes completo: el mes futuro solo tiene previsiones y el escenario conserva los importes ya registrados', () => {
  const data = wholeMonthFixture();
  const base = buildForecast(data, '2026-10-27');
  const scenario = buildForecast(data, '2026-10-27', { variablePercent: 130 });
  const summarize = (forecast: ReturnType<typeof buildForecast>, month: string) => buildProjectionBreakdown(uncheckedFixture(monthlyBreakdownEvents, forecast, month), forecast.accounts, data.plans);
  const original = summarize(base, '2026-10');
  const simulated = summarize(scenario, '2026-10');
  assert.equal(present(simulated.groups.find(group => group.id === 'variable')).registeredAmount, present(original.groups.find(group => group.id === 'variable')).registeredAmount);
  assert.ok(present(simulated.groups.find(group => group.id === 'variable')).expectedAmount < present(original.groups.find(group => group.id === 'variable')).expectedAmount);
  const november = summarize(base, '2026-11');
  assert.ok(november.groups.every(group => group.registeredAmount === 0 && group.amount === group.expectedAmount));
  const expected = base.monthly.find(month => month.month === '2026-11');
  assert.equal(november.groups.reduce((sum, group) => sum + Math.max(0, group.cents), 0), Math.round(present(expected).incoming * 100));
  assert.equal(november.groups.reduce((sum, group) => sum + Math.max(0, -group.cents), 0), Math.round(present(expected).outgoing * 100));
});

test('mes completo: identifica abonos de rendimiento y conserva los cálculos históricos fuera de Registrado', () => {
  const result = buildProjectionBreakdown([
    event({ date: '2026-10-10', kind: 'INCOME' as const, incomeTypeId: 'interest', amount: 1.23, status: 'ACTUAL' as const }),
    event({ date: '2026-10-26', kind: 'AUTO_YIELD' as const, amount: 0.20, status: 'CALCULATED' as const }),
    event({ date: '2026-10-30', kind: 'YIELD' as const, amount: 0.07, status: 'ESTIMATED' as const }),
  ], [{ ...accounts[0], yieldIncomeTypeId: 'interest' }]);
  assert.equal(result.groups.length, 1);
  const yields = result.groups[0];
  assert.equal(present(yields).id, 'yield');
  assert.equal(present(yields).registeredAmount, 1.23);
  assert.equal(present(yields).calculatedAmount, 0.20);
  assert.equal(present(yields).expectedAmount, 0.07);
  assert.equal(present(yields).amount, 1.50);
  assert.equal(present(yields).rows.length, 3);
});

test('mes completo: agrupa gasto histórico por categoría sin mezclar suscripciones, deuda ni previsiones vinculadas', () => {
  const result = buildProjectionBreakdown([
    event({ categoryId: 'food', status: 'ACTUAL' as const, amount: -10 }),
    event({ categoryId: 'food', status: 'ACTUAL' as const, subscriptionId: 's' }),
    event({ categoryId: 'food', status: 'ACTUAL' as const, payableId: 'p' }),
    event({ categoryId: 'food', status: 'ACTUAL' as const, planId: 'extra' }),
    event({ kind: 'VARIABLE' as const, planId: 'food', status: 'ESTIMATED' as const, amount: -20 }),
  ], accounts, [{ id: 'food', kind: 'VARIABLE' as const, categoryId: 'food', name: 'Plan de alimentos' }], [{ id: 'food', name: 'Alimentos' }]);
  const variable = result.groups.find(group => group.id === 'variable');
  assert.equal(present(variable).amount, -30);
  assert.ok(present(variable).rows.every(row => row.label === 'Alimentos'));
  assert.equal(present(result.groups.find(group => group.id === 'payments')).registeredAmount, -300);
});

test('mes completo: filtra el historial por cuenta y mes, evita claves repetidas y no inventa días sin registros', () => {
  const recorded = event({ key: 'paid', date: '2026-10-10', status: 'ACTUAL' as const, includedInReference: true });
  const forecast = { today: '2026-10-27', actual: [recorded, event({ key: 'other', date: '2026-10-15', accountId: 'b', status: 'ACTUAL' as const })], events: [recorded, event({ key: 'future', date: '2026-11-01' })] };
  const selected = uncheckedFixture(monthlyBreakdownEvents, forecast, '2026-10', 'a');
  assert.equal(selected.length, 1);
  assert.equal(present(selected[0]).key, 'paid');
  assert.equal(present(selected[0]).phase, 'REGISTERED');
  assert.equal(uncheckedFixture(monthlyBreakdownEvents, forecast, '2026-09').length, 0);
  const result = buildProjectionBreakdown(selected, accounts);
  assert.equal(present(result.groups[0]).registeredAmount, -100);
  assert.equal(present(result.groups[0]).expectedAmount, 0);
});
