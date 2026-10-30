import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CalculationData } from '../src/lib/money/types';
import type { MoneyFixtureData, Sparse } from './helpers/financial-fixtures';
import { present, sparseCalculations } from './helpers/financial-fixtures';
import { sourceLoader } from './helpers/load-source';

const load = sourceLoader();
const { buildForecast } = sparseCalculations(load('src/lib/money/forecast.ts'));
const today = '2026-10-29';

function forecast(account: Sparse<CalculationData['accounts'][number]> = {}) {
  const data: MoneyFixtureData = {
    accounts: [{ id: 'a', name: 'Cuenta ficticia', openingBalance: 10000, reservedAmount: 0, asOf: today, baseline: {}, annualYield: 36.5, yieldBasis: 365, autoYield: true, ...account }],
    routes: [], plans: [], transfers: [], cards: [], cycles: [], incomes: [], expenses: [], subscriptions: [], purchases: [], receivables: [], payables: [],
  };
  return present(buildForecast(data, today).accounts[0]);
}

const plain = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

test('rendimientos comparables: equivalentes de 1, 7 y 30 días con saldo actual, sin capitalización', () => {
  const account = forecast();
  assert.deepEqual(plain(account.yieldEstimate), { daily: 10, weekly: 70, monthly: 300 });
  assert.equal(account.balance, 10000);
});

test('rendimientos comparables: tasa por tramos, base 360 y redondeo al final de cada período', () => {
  const account = { openingBalance: 11000, annualYield: 15, yieldBasis: 360, yieldCap: 10000, yieldExcessRate: 7 };
  assert.deepEqual(plain(forecast(account).yieldEstimate), { daily: 4.36, weekly: 30.53, monthly: 130.83 });
  assert.deepEqual(plain(forecast({ ...account, yieldRounding: 'DOWN' }).yieldEstimate), { daily: 4.36, weekly: 30.52, monthly: 130.83 });
});

test('rendimientos comparables: importe diario observado se prorratea y respeta el tope', () => {
  const account = { yieldMethod: 'DAILY_AMOUNT' as const, yieldDailyAmount: 10, yieldCap: 10000 };
  assert.deepEqual(plain(forecast({ ...account, openingBalance: 5000 }).yieldEstimate), { daily: 5, weekly: 35, monthly: 150 });
  assert.deepEqual(plain(forecast({ ...account, openingBalance: 12000 }).yieldEstimate), { daily: 10, weekly: 70, monthly: 300 });
});

test('rendimientos comparables: aplica el descuento configurado a los tres períodos', () => {
  assert.deepEqual(plain(forecast({ yieldTaxPercent: 10 }).yieldEstimate), { daily: 9, weekly: 63, monthly: 270 });
});

test('rendimientos comparables: cero sin tasa, con saldo negativo o fuera de vigencia', () => {
  for (const account of [{ annualYield: 0 }, { openingBalance: 0 }, { openingBalance: -100 }, { yieldStartDate: '2026-10-30' }, { yieldEndDate: '2026-10-28' }]) {
    assert.deepEqual(plain(forecast(account).yieldEstimate), { daily: 0, weekly: 0, monthly: 0 });
  }
});

test('rendimientos comparables: calendario de abono y días acumulados no alteran los equivalentes', () => {
  const business = forecast({ yieldPayout: 'MX_BUSINESS', yieldInitialPendingDays: 3 });
  assert.equal(business.pendingYield, 30);
  assert.deepEqual(plain(business.yieldEstimate), plain(forecast({ yieldPayout: 'DAILY' }).yieldEstimate));
});

test('rendimientos comparables: usa la regla vigente y no una tasa futura', () => {
  const account = forecast({ annualYield: 73, yieldHistory: [
    { from: '2026-10-28', rule: { annualYield: 36.5, yieldBasis: 365, autoYield: true } },
    { from: '2026-10-30', rule: { annualYield: 73, yieldBasis: 365, autoYield: true } },
  ] });
  assert.deepEqual(plain(account.yieldEstimate), { daily: 10, weekly: 70, monthly: 300 });
});
