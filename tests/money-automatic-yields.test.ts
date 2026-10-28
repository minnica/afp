import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CalculationData } from '../src/lib/money/types';
import type { MoneyFixtureData, Sparse } from './helpers/financial-fixtures';
import { jsonValue, present, sparseCalculations } from './helpers/financial-fixtures';
import { sourceLoader } from './helpers/load-source.ts';
const load = sourceLoader();
const { buildForecast } = sparseCalculations(load('src/lib/money/forecast.ts'));
const { buildSources } = sparseCalculations(load('src/lib/money/sources.ts'));
const { yieldRule, changedYieldHistory, bankHolidays } = sparseCalculations(load('src/lib/money/yieldRules.ts'));
function data(extra: Sparse<CalculationData> = {}): MoneyFixtureData {
  return { accounts: [{ id: 'a', name: 'Cuenta ficticia', openingBalance: 10000, reservedAmount: 0, asOf: '2026-10-23', baseline: {}, annualYield: 36.5, yieldBasis: 365, autoYield: true }], routes: [{ key: 'default:income', accountId: 'a' }, { key: 'default:expense', accountId: 'a' }], plans: [], transfers: [], cards: [], cycles: [], incomes: [], expenses: [], subscriptions: [], purchases: [], receivables: [], payables: [], ...extra };
}
test('automático: recupera días con capitalización y no modifica ni duplica registros', () => {
  const d = data(), before = JSON.stringify(d), a = buildForecast(d, '2026-10-26'), b = buildForecast(d, '2026-10-26');
  assert.equal(present(a.accounts[0]).balance, 10030.03); assert.equal(present(a.accounts[0]).calculatedYield, 30.03);
  assert.equal(present(a.accounts[0]).recordedBalance, 10000); assert.equal(a.actual.filter(e => e.automaticYield).length, 3);
  assert.deepEqual(a, b); assert.equal(JSON.stringify(d), before);
  assert.equal(present(a.events.find(e => e.kind === 'YIELD')).amount, 10.03);
});
test('automático: respeta la reserva y permite retiros hasta saldo negativo', () => {
  const d = data(); present(present(d.accounts)[0]).reservedAmount = 10000;
  present(d.expenses).push({ id: 'e', concept: 'Retiro ficticio', paymentMethod: 'CASH' as const, amount: 11000, date: '2026-10-24' });
  const r = buildForecast(d, '2026-10-26'); assert.equal(present(r.accounts[0]).balance, -990);
  assert.equal(r.actual.filter(e => e.automaticYield).length, 1);
});
test('automático: tramos, base 360 y centavos completos con abono agrupado el lunes', () => {
  const d = data(); Object.assign(present(present(d.accounts)[0]), { openingBalance: 11000, annualYield: 15, yieldBasis: 360, yieldCap: 10000, yieldExcessRate: 7, yieldPayout: 'MX_BUSINESS' as const, yieldRounding: 'DOWN' as const });
  const saturday = buildForecast(d, '2026-10-24'); assert.equal(present(saturday.accounts[0]).balance, 11000); assert.equal(present(saturday.accounts[0]).pendingYield, 4.36);
  const monday = buildForecast(d, '2026-10-26'); assert.equal(present(monday.accounts[0]).balance, 11013.08);
  const rows = monday.actual.filter(e => e.automaticYield); assert.equal(rows.length, 1); assert.equal(present(rows[0]).date, '2026-10-26'); assert.equal(present(rows[0]).amount, 13.08);
  assert.equal(present(saturday.events.find(e => e.kind === 'YIELD')).date, '2026-10-26'); assert.equal(present(saturday.events.find(e => e.kind === 'YIELD')).amount, 13.08);
});
test('automático: referencia inicial en fin de semana admite un día previo pendiente', () => {
  const d = data(); Object.assign(present(present(d.accounts)[0]), { asOf: '2026-10-24', openingBalance: 11000, annualYield: 15, yieldBasis: 360, yieldCap: 10000, yieldExcessRate: 7, yieldPayout: 'MX_BUSINESS' as const, yieldRounding: 'DOWN' as const, yieldInitialPendingDays: 1 });
  assert.equal(present(buildForecast(d, '2026-10-26').accounts[0]).balance, 11013.08);
});
test('automático: pendientes explícitos en un día hábil no se descartan ni se incluyen en la referencia', () => {
  const d = data(); Object.assign(present(present(d.accounts)[0]), { asOf: '2026-10-26', yieldPayout: 'MX_BUSINESS' as const, yieldInitialPendingDays: 3 });
  const monday = buildForecast(d, '2026-10-26');
  assert.equal(present(monday.accounts[0]).balance, 10000); assert.equal(present(monday.accounts[0]).pendingYield, 30);
  assert.equal(present(monday.events.find(e => e.kind === 'YIELD')).amount, 40);
  assert.equal(present(buildForecast(d, '2026-10-27').accounts[0]).balance, 10040);
});
test('automático: importe observado se prorratea, respeta el tope y agrupa varios días', () => {
  const d = data(); Object.assign(present(present(d.accounts)[0]), { openingBalance: 12000, annualYield: 15, yieldMethod: 'DAILY_AMOUNT' as const, yieldDailyAmount: 10, yieldCap: 10000, yieldPayout: 'MX_BUSINESS' as const });
  assert.equal(present(buildForecast(d, '2026-10-26').accounts[0]).balance, 12030);
  present(present(d.accounts)[0]).openingBalance = 5000; assert.equal(present(buildForecast(d, '2026-10-26').accounts[0]).balance, 5015);
});
test('automático: dos componentes de abono real sustituyen un cálculo agrupado', () => {
  const d = data(); Object.assign(present(present(d.accounts)[0]), { yieldIncomeTypeId: 'yield', yieldPayout: 'MX_BUSINESS' as const });
  d.incomes = [{ id: 'one', incomeTypeId: 'yield', date: '2026-10-26', amount: 11, concept: 'Componente uno' }, { id: 'two', incomeTypeId: 'yield', date: '2026-10-26', amount: 18.5, concept: 'Componente dos' }];
  const r = buildForecast(d, '2026-10-26'); assert.equal(present(r.accounts[0]).balance, 10029.50); assert.equal(present(r.accounts[0]).calculatedYield, 0);
  assert.equal(r.actual.filter(e => e.automaticYield).length, 0); assert.equal(present(r.events.find(e => e.kind === 'YIELD')).amount, 10.03);
});
test('automático: un abono en otra cuenta no sustituye el rendimiento propio', () => {
  const d = data(); present(d.accounts).push({ ...present(d.accounts)[0], id: 'b', name: 'Otra cuenta' });
  present(present(d.accounts)[0]).yieldIncomeTypeId = 'yield'; present(d.incomes).push({ id: 'i', incomeTypeId: 'yield', date: '2026-10-24', amount: 20, concept: 'Otro banco' });
  present(d.routes).push({ key: 'income:i', accountId: 'b' });
  assert.equal(present(buildForecast(d, '2026-10-24').accounts[0]).balance, 10010);
});
test('automático: conciliar absorbe lo calculado sin volver a sumarlo', () => {
  const d = data(), old = { ...present(d.accounts)[0] };
  Object.assign(present(present(d.accounts)[0]), { asOf: '2026-10-25', openingBalance: 12000, reconciliations: [{ snapshot: old }] });
  const atReference = buildForecast(d, '2026-10-25'); assert.equal(present(atReference.accounts[0]).balance, 12000); assert.equal(present(atReference.accounts[0]).calculatedYield, 0);
  assert.equal(present(buildForecast(d, '2026-10-26').accounts[0]).balance, 12012);
});
test('automático: conciliación durante fin de semana conserva el rendimiento pendiente', () => {
  const d = data(); present(present(d.accounts)[0]).yieldPayout = 'MX_BUSINESS'; const old = { ...present(d.accounts)[0] };
  Object.assign(present(present(d.accounts)[0]), { asOf: '2026-10-24', openingBalance: 12000, reconciliations: [{ snapshot: old }] });
  // Viernes 10, sábado 12, domingo 12; el abono aún no estaba en el banco el sábado.
  assert.equal(present(buildForecast(d, '2026-10-26').accounts[0]).balance, 12034);
});
test('automático: cambio de tasa conserva las reglas de los días anteriores', () => {
  const d = data(); present(present(d.accounts)[0]).yieldPayout = 'MX_BUSINESS';
  const next = { ...present(d.accounts)[0], annualYield: 18.25 };
  present(present(d.accounts)[0]).yieldHistory = jsonValue(changedYieldHistory(present(present(d.accounts)[0]), next, '2026-10-25')); present(present(d.accounts)[0]).annualYield = 18.25;
  assert.equal(present(buildForecast(d, '2026-10-26').accounts[0]).balance, 10025);
});
test('automático: detener nuevos días conserva los rendimientos ya generados', () => {
  const d = data(), next = { ...present(d.accounts)[0], autoYield: false };
  present(present(d.accounts)[0]).yieldHistory = jsonValue(changedYieldHistory(present(present(d.accounts)[0]), next, '2026-10-25')); present(present(d.accounts)[0]).autoYield = false;
  assert.equal(present(buildForecast(d, '2026-10-27').accounts[0]).balance, 10020.01);
});
test('automático: días inhábiles bancarios difieren los abonos sin detener el cálculo diario', () => {
  assert.ok(bankHolidays(2026).has('2026-11-02')); assert.ok(bankHolidays(2026).has('2026-04-02')); assert.ok(bankHolidays(2026).has('2026-04-03'));
  const d = data(); Object.assign(present(present(d.accounts)[0]), { asOf: '2026-10-30', yieldPayout: 'MX_BUSINESS' as const });
  const r = buildForecast(d, '2026-11-03'); assert.equal(present(r.accounts[0]).balance, 10040); assert.equal(r.actual.filter(e => e.automaticYield).length, 1);
});
test('automático: no inventa abonos antes de activar el cálculo', () => {
  const d = data(); present(present(d.accounts)[0]).asOf = '2026-10-01'; present(present(d.accounts)[0]).yieldHistory = [{ from: '2026-10-24', rule: yieldRule(present(present(d.accounts)[0])) }];
  assert.equal(buildSources(d, '2026-10-24').events.filter(e => e.automaticYield).length, 0);
  assert.equal(present(buildForecast(d, '2026-10-25').accounts[0]).balance, 10010);
});
