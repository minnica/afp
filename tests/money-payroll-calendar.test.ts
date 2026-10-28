import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CalculationData } from '../src/lib/money/types';
import type { MoneyFixtureData, Sparse } from './helpers/financial-fixtures';
import { present, sparseCalculations } from './helpers/financial-fixtures';
import { sourceLoader } from './helpers/load-source.ts';
const load = sourceLoader(), { planDates, buildForecast } = sparseCalculations(load('src/lib/money/forecast.ts'));
const plan = (extra: Sparse<CalculationData['plans'][number]> = {}) => ({ id: 'salary', name: 'Nómina ficticia', kind: 'PAYROLL' as const, amount: 5000, accountId: 'bank', incomeTypeId: 'salary-type', startDate: '2026-10-24', frequencyMonths: 1, days: [15, 31], payrollBusinessDays: true, isActive: true, occurrences: [], ...extra });
const data = (extra: Sparse<CalculationData> = {}): MoneyFixtureData => ({ accounts: [{ id: 'bank', name: 'Banco ficticio', openingBalance: 100, reservedAmount: 0, asOf: '2026-10-24', baseline: {} }], plans: [plan()], routes: [{ key: 'incomeType:salary-type', accountId: 'bank' }], transfers: [], cards: [], cycles: [], incomes: [], expenses: [], subscriptions: [], purchases: [], receivables: [], payables: [], ...extra });
test('nómina: adelanta fines de semana y festivos bancarios conservando el calendario nominal', () => {
  const p = plan();
  assert.deepEqual(Array.from(planDates(p, '2026-10-24', '2026-11-30')), ['2026-10-30', '2026-11-13', '2026-11-30']);
  assert.deepEqual(Array.from(planDates(p, '2027-02-01', '2027-03-31')), ['2027-02-15', '2027-02-26', '2027-03-12', '2027-03-31']);
  assert.deepEqual(Array.from(planDates({ ...p, payrollBusinessDays: false }, '2026-10-24', '2026-10-31')), ['2026-10-31']);
  assert.deepEqual(Array.from(planDates({ ...p, kind: 'EXPENSE' as const }, '2026-10-24', '2026-10-31')), ['2026-10-31']);
});
test('nómina: respeta inicio y fin nominales, fase bimestral y pago único adelantado', () => {
  assert.deepEqual(Array.from(planDates(plan({ startDate: '2026-10-31', endDate: '2026-10-31' }), '2026-10-01', '2026-11-30')), ['2026-10-30']);
  assert.deepEqual(Array.from(planDates(plan({ frequencyMonths: 2, endDate: '2026-12-15' }), '2026-10-24', '2026-12-31')), ['2026-10-30', '2026-12-15']);
  const d = data({ plans: [plan({ frequencyMonths: 0, startDate: '2026-10-31' })] });
  assert.equal(present(buildForecast(d, '2026-10-24').events.find(e => e.kind === 'PAYROLL')).date, '2026-10-30');
});
test('nómina: un depósito adelantado al mes anterior se incluye y concilia en el mes del depósito', () => {
  const p = plan({ startDate: '2027-01-01', days: [1] });
  assert.deepEqual(Array.from(planDates(p, '2026-12-01', '2026-12-31')), ['2026-12-31']);
  const d = data({ plans: [p], incomes: [{ id: 'paid', concept: 'Depósito ficticio', incomeTypeId: 'salary-type', amount: 5000, date: '2026-12-31' }] });
  const r = buildForecast(d, '2026-12-31');
  assert.equal(present(r.planOccurrences.find(o => o.date === '2026-12-31')).status, 'MATCHED');
  assert.ok(!r.events.some(e => e.kind === 'PAYROLL' && e.date === '2026-12-31'));
});
test('nómina: omisiones, vínculos y escenario usan la fecha adelantada', () => {
  const p = plan({ occurrences: [{ date: '2026-10-30', status: 'SKIPPED' as const }] });
  assert.ok(!buildForecast(data({ plans: [p] }), '2026-10-24').events.some(e => e.planId === p.id && e.date === '2026-10-30'));
  const d = data({ incomes: [{ id: 'paid', incomeTypeId: 'salary-type', date: '2026-11-01', amount: 1200, concept: 'Parcial ficticio' }], routes: [{ key: 'income:paid', accountId: 'bank', planId: 'salary', occurrenceDate: '2026-10-30' }] });
  assert.equal(present(buildForecast(d, '2026-10-24').events.find(e => e.planId === 'salary' && e.date === '2026-10-30')).amount, 3800);
  assert.ok(!buildForecast(data(), '2026-10-24', { stopPayrollDate: '2026-10-30' }).events.some(e => e.kind === 'PAYROLL'));
});
