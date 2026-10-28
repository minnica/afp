import assert from 'node:assert/strict';
import { test } from 'node:test';
import { present, sparseCalculations } from './helpers/financial-fixtures';
import { sourceLoader } from './helpers/load-source.ts';
const load = sourceLoader();
const { monthlyMinimumPeriod } = sparseCalculations(load('src/components/mi-dinero/monthlyMinimumPeriod.ts'));
const { buildForecast } = sparseCalculations(load('src/lib/money/forecast.ts'));

const month = { month: '2026-11', minimum: 1000 };
const day = (date: string, balance: number) => ({ date, balance });
const period = (days: Parameters<typeof monthlyMinimumPeriod>[1], values = month, today = '2026-11-01') => monthlyMinimumPeriod(values, days, today);

test('mínimo mensual: incluye el margen en centavos y agrupa solo días consecutivos', () => {
  const result = period([day('2026-11-25', 1100), day('2026-11-26', 1050.01), day('2026-11-27', 1050), day('2026-11-28', 1020), day('2026-11-29', 1000), day('2026-11-30', 5000)]);
  assert.equal(result.label, 'Días 27–29');
  assert.equal(JSON.stringify(result.ranges), JSON.stringify([{ from: '2026-11-27', to: '2026-11-29' }]));
});

test('mínimo mensual: conserva períodos separados y días aislados', () => {
  const result = period([day('2026-11-12', 1000), day('2026-11-13', 1040), day('2026-11-14', 2000), day('2026-11-27', 1025), day('2026-11-29', 1000)]);
  assert.equal(result.label, 'Días 12–13, 27 y 29');
  assert.equal(result.ranges.length, 3);
  assert.equal(period([day('2026-11-29', 1000)]).label, 'Día 29');
});

test('mínimo mensual: respeta el mes, hoy y los huecos sin inventar fechas', () => {
  const days = [day('2026-10-31', 1000), day('2026-11-01', 1000), day('2026-11-27', 1020), day('2026-11-29', 1000), day('2026-12-01', 1000)];
  assert.equal(period(days, month, '2026-11-27').label, 'Días 27 y 29');
  assert.equal(period([], month).label, null);
  assert.equal(period([day('2026-11-27', 1020)]).label, null, 'no presenta fechas si falta el mínimo de referencia');
});

test('mínimo mensual: negativos y cero usan un margen coherente sin cambiar el importe', () => {
  const result = period([day('2026-11-10', -1000), day('2026-11-11', -950), day('2026-11-12', -949.99)], { ...month, minimum: -1000 });
  assert.equal(result.label, 'Días 10–11');
  const zero = period([day('2026-11-10', 0), day('2026-11-11', 0.01), day('2026-11-12', 0)], { ...month, minimum: 0 });
  assert.equal(zero.label, 'Días 10 y 12');
});

test('mínimo mensual: un mes constante y febrero bisiesto agrupan hasta su último día', () => {
  const days = Array.from({ length: 29 }, (_, index) => day(`2028-02-${String(index + 1).padStart(2, '0')}`, 500));
  assert.equal(period(days, { month: '2028-02', minimum: 500 }, '2028-02-01').label, 'Días 1–29');
  assert.equal(period(days, { month: '2028-02', minimum: 500 }, '2028-02-27').label, 'Días 27–29');
});

test('mínimo mensual: ordena y deduplica fechas sin modificar la proyección original', () => {
  const days = [day('2026-11-29', 1000), day('2026-11-27', 1020), day('2026-11-28', 1010), day('2026-11-28', 1010)];
  const before = JSON.stringify(days);
  assert.equal(period(days).label, 'Días 27–29');
  assert.equal(JSON.stringify(days), before);
  assert.equal(period([day('2026-11-01', 0.1 + 0.2)], { ...month, minimum: 0.3 }).label, 'Día 1');
  assert.equal(period([day('2026-11-01', 0.3), day('2026-11-02', 0.31), day('2026-11-03', 0.32)], { ...month, minimum: 0.3 }).label, 'Días 1–2', 'el redondeo no amplía el margen por encima del 5 %');
});

test('mínimo mensual: sigue el total global y el escenario con el motor real', () => {
  const today = '2026-11-01';
  const data = {
    accounts: [{ id: 'bank', openingBalance: 100, reservedAmount: 0, annualYield: 0, asOf: today, baseline: {} }, { id: 'saving', openingBalance: 1000, reservedAmount: 0, annualYield: 0, asOf: today, baseline: {} }],
    routes: [{ key: 'default:expense', accountId: 'bank' }, { key: 'default:income', accountId: 'bank' }],
    expenses: [{ id: 'bill', date: '2026-11-27', amount: 600, paymentMethod: 'CASH' as const }],
    incomes: [{ id: 'salary', date: '2026-11-30', amount: 1500 }],
    cards: [], cycles: [], plans: [], transfers: [], withdrawals: [], subscriptions: [], purchases: [], receivables: [], payables: [],
  };
  const forecast = buildForecast(data, today);
  assert.equal(present(forecast.monthly[0]).minimum, 500);
  assert.equal(monthlyMinimumPeriod(present(forecast.monthly[0]), forecast.daily, today).label, 'Días 27–29');
  const simulated = buildForecast(data, today, { extraAmount: 300, extraDate: '2026-11-29', extraAccountId: 'bank' });
  assert.equal(present(simulated.monthly[0]).minimum, 200);
  assert.equal(monthlyMinimumPeriod(present(simulated.monthly[0]), simulated.daily, today).label, 'Día 29');
});
