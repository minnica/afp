const assert = require('node:assert/strict');
const { test } = require('node:test');
const { sourceLoader } = require('./helpers/load-source.cjs');
const load = sourceLoader();
const { monthlySummaryStatus } = load('src/components/mi-dinero/monthlySummaryStatus.ts');
const { buildForecast } = load('src/lib/money/forecast.ts');

function forecastWithEarlyExpense(amount) {
  return buildForecast({
    accounts: [{ id: 'bank', name: 'Banco', openingBalance: 1000, reservedAmount: 500, asOf: '2026-11-01', baseline: {}, annualYield: 0 }],
    routes: [{ key: 'default:income', accountId: 'bank' }, { key: 'default:expense', accountId: 'bank' }],
    expenses: [{ id: 'expense', date: '2026-11-02', amount, paymentMethod: 'CASH', concept: 'Salida antes del ingreso' }],
    incomes: [{ id: 'income', date: '2026-11-15', amount: 5000, concept: 'Ingreso posterior' }],
    plans: [], cards: [], cycles: [], subscriptions: [], purchases: [], receivables: [], payables: [], transfers: [],
  }, '2026-11-01');
}

test('estado mensual: un cierre en aumento no oculta un déficit previo al ingreso', () => {
  const forecast = forecastWithEarlyExpense(1500);
  const month = forecast.monthly[0];
  const before = JSON.stringify(forecast);
  assert.equal(month.minimum, -500);
  assert.equal(month.closing, 4500);
  const status = monthlySummaryStatus(month, { reserved: forecast.summary.reserved, incomplete: true });
  assert.equal(status.variant, 'destructive');
  assert.equal(status.reason, 'negative');
  assert.equal(status.change, 3500);
  assert.equal(status.minimumTone, 'destructive');
  assert.equal(JSON.stringify(forecast), before);
});

test('estado mensual: advierte si se usa la reserva aunque el cierre se recupere', () => {
  const forecast = forecastWithEarlyExpense(700);
  const status = monthlySummaryStatus(forecast.monthly[0], { reserved: forecast.summary.reserved });
  assert.equal(forecast.monthly[0].minimum, 300);
  assert.equal(status.reason, 'below-reserve');
  assert.equal(status.variant, 'warning');
  assert.equal(status.minimumTone, 'warning');
});

test('estado mensual: distingue cero, límite y margen de un centavo sobre la reserva', () => {
  const month = { opening: 100, closing: 100, minimum: 0 };
  assert.equal(monthlySummaryStatus(month).reason, 'zero');
  assert.equal(monthlySummaryStatus({ opening: -100, closing: 0, minimum: -100 }).closingTone, 'destructive');
  assert.equal(monthlySummaryStatus({ opening: 100, closing: 0, minimum: 0 }).closingTone, 'destructive');
  assert.equal(monthlySummaryStatus({ ...month, minimum: -0.01 }).reason, 'negative');
  assert.equal(monthlySummaryStatus({ ...month, minimum: 50 }, { reserved: 50 }).reason, 'reserve-limit');
  const above = monthlySummaryStatus({ ...month, minimum: 50.01 }, { reserved: 50 });
  assert.equal(above.variant, 'success');
  assert.equal(above.label, 'Sobre tu reserva');
});

test('estado mensual: un saldo positivo que baja requiere cautela', () => {
  const status = monthlySummaryStatus({ opening: 1000, closing: 999.99, minimum: 900 }, { reserved: 500 });
  assert.equal(status.reason, 'declining');
  assert.equal(status.variant, 'warning');
  assert.equal(status.change, -0.01);
  assert.equal(status.closingTone, 'warning');
  assert.equal(status.minimumTone, null);
});

test('estado mensual: los datos pendientes impiden un indicador global verde', () => {
  const status = monthlySummaryStatus({ opening: 1000, closing: 2000, minimum: 1000 }, { reserved: 500, incomplete: true });
  assert.equal(status.variant, 'warning');
  assert.equal(status.reason, 'incomplete');
});

test('estado mensual: sin reserva usa saldo positivo sin inventar umbrales de seguridad', () => {
  const status = monthlySummaryStatus({ opening: 0.10 + 0.20, closing: 0.30, minimum: 0.01 });
  assert.equal(status.variant, 'success');
  assert.equal(status.label, 'Saldo positivo');
  assert.equal(status.change, 0);
  assert.equal(status.closingTone, null);
});
