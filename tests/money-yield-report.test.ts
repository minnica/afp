import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildYieldReport, type YieldReportAccount } from '../src/lib/money/yieldReport';
import { yieldIncomeTypeIds } from '../src/lib/money/yieldIncomeTypes';
import type { DisplayEvent } from '../src/lib/money/responses';

const today = '2026-10-30';
function account(extra: Partial<YieldReportAccount> = {}): YieldReportAccount {
  return { id: 'a', name: 'Ahorro ficticio', asOf: '2026-10-01', yieldIncomeTypeId: 'yield', yieldHistory: [], reconciliations: [], balance: 10000, pendingYield: 3.01, yieldEstimate: { daily: 2.74, weekly: 19.18, monthly: 82.19 }, ...extra };
}
function event(extra: Partial<DisplayEvent> = {}): DisplayEvent {
  return { key: 'income:1', date: '2026-10-15', cents: 500, amount: 5, label: 'Abono ficticio', kind: 'INCOME', status: 'ACTUAL', incomeTypeId: 'yield', accountId: 'a', ...extra };
}

test('rendimientos: confirma solo ingresos del tipo configurado, sin inferirlos del concepto', () => {
  const report = buildYieldReport([account()], [event(), event({ key: 'salary', incomeTypeId: 'salary', label: 'Rendimiento escrito en nómina', cents: 50000 }), event({ key: 'transfer', kind: 'TRANSFER' }), event({ key: 'collection', kind: 'COLLECTION' })], today);
  assert.equal(report.confirmed, 5);
  assert.equal(report.confirmedCount, 1);
  assert.equal(report.entries[0]?.confirmed, true);
});

test('rendimientos: separa cálculos históricos, pendientes de abono y estimados futuros', () => {
  const report = buildYieldReport([account()], [event(), event({ key: 'auto', kind: 'AUTO_YIELD', status: 'CALCULATED', automaticYield: true, cents: 274 }), event({ key: 'future', date: '2026-10-31', status: 'REGISTERED_FUTURE' }), event({ key: 'projection', kind: 'YIELD', status: 'ESTIMATED' })], today);
  assert.equal(report.confirmed, 5);
  assert.equal(report.calculated, 2.74);
  assert.equal(report.pending, 3.01);
  assert.equal(report.weekly, 19.18);
  assert.equal(report.monthly, 82.19);
  assert.equal(report.entries.length, 2);
});

test('rendimientos: ignora exclusiones, fechas desconocidas, días futuros e importes no positivos', () => {
  const report = buildYieldReport([account()], [event({ excluded: true }), event({ date: null }), event({ date: '2026-11-01' }), event({ cents: 0 }), event({ cents: -50 })], today, 'ALL');
  assert.equal(report.confirmed, 0);
  assert.equal(report.entries.length, 0);
});

test('rendimientos: reconoce tipos anteriores después de cambiar las condiciones de una cuenta', () => {
  const a = account({ yieldIncomeTypeId: 'new', yieldHistory: [{ from: '2026-01-01', rule: { yieldIncomeTypeId: 'old' } }, { from: '2026-10-01', rule: { yieldIncomeTypeId: 'new' } }] });
  const report = buildYieldReport([a], [event({ incomeTypeId: 'old' }), event({ key: 'new', incomeTypeId: 'new', cents: 333 })], today);
  assert.equal(report.confirmed, 8.33);
});

test('rendimientos: referencias conciliadas no inventan ganancias ni borran abonos reales previos', () => {
  const a = account({ asOf: '2026-10-29', balance: 50000, reconciliations: [{ id: 'r', date: '2026-10-29', previousBalance: 10000, bankBalance: 50000, reason: 'Saldo ficticio', snapshot: { asOf: '2026-10-01', openingBalance: 10000, yieldIncomeTypeId: 'old' } }] });
  const report = buildYieldReport([a], [event({ incomeTypeId: 'old' })], today);
  assert.equal(report.confirmed, 5);
  assert.equal(report.calculated, 0);
  assert.equal(report.balance, 50000);
  assert.deepEqual([...yieldIncomeTypeIds(a)].sort(), ['old', 'yield']);
});

test('rendimientos: el historial explícito prevalece sobre tipos de snapshots antiguos', () => {
  const a = account({ yieldHistory: [{ from: '2026-10-01', rule: { yieldIncomeTypeId: 'yield' } }], reconciliations: [{ id: 'r', date: '2026-10-29', previousBalance: 0, bankBalance: 0, reason: '', snapshot: { asOf: '2026-09-01', yieldIncomeTypeId: 'obsolete' } }] });
  assert.equal(yieldIncomeTypeIds(a).has('obsolete'), false);
});

test('rendimientos: inicia en el mes actual y permite año e historial, con límites inclusivos', () => {
  const events = [event({ key: 'old-year', date: '2025-12-31', cents: 100 }), event({ key: 'last-month', date: '2026-09-30', cents: 200 }), event({ key: 'first-day', date: '2026-10-01', cents: 300 }), event({ key: 'today', date: today, cents: 400 })];
  assert.equal(buildYieldReport([account()], events, today).confirmed, 7);
  assert.equal(buildYieldReport([account()], events, today, 'YEAR').confirmed, 9);
  assert.equal(buildYieldReport([account()], events, today, 'ALL').confirmed, 10);
  assert.equal(buildYieldReport([account()], events, today, '2026-09').confirmed, 2);
  assert.deepEqual(buildYieldReport([account()], events, today).months, ['2026-10', '2026-09', '2025-12']);
});

test('rendimientos: filtrar cuenta cambia ambos desgloses; filtrar período mantiene los estimados de hoy', () => {
  const accounts = [account(), account({ id: 'b', name: 'Otra cuenta', balance: 1000, pendingYield: 0, yieldEstimate: { daily: 0.3, weekly: 2.1, monthly: 9 } })];
  const events = [event(), event({ key: 'other', accountId: 'b', cents: 100 })];
  const filtered = buildYieldReport(accounts, events, today, 'ALL', 'b');
  assert.equal(filtered.confirmed, 1);
  assert.equal(filtered.balance, 1000);
  assert.equal(filtered.weekly, 2.1);
  assert.equal(filtered.rows.length, 1);
  const emptyMonth = buildYieldReport(accounts, events, today, '2026-09', 'b');
  assert.equal(emptyMonth.confirmed, 0);
  assert.equal(emptyMonth.monthly, 9);
});

test('rendimientos: cuenta una sola vez los tipos compartidos y señala los abonos sin cuenta', () => {
  const report = buildYieldReport([account(), account({ id: 'b' })], [event(), event({ key: 'unassigned', accountId: null, cents: 123 }), event({ key: 'unknown', accountId: null, incomeTypeId: 'salary' })], today);
  assert.equal(report.confirmed, 6.23);
  assert.equal(report.unassigned, 1.23);
  assert.equal(report.rows.reduce((sum, row) => sum + row.confirmed, 0), 5);
  assert.equal(report.entries.find(entry => !entry.accountId)?.accountName, 'Sin cuenta asignada');
});

test('rendimientos: no atribuye el tipo de otra cuenta a un ingreso ya asignado', () => {
  const report = buildYieldReport([account(), account({ id: 'b', yieldIncomeTypeId: 'other-yield' })], [event({ accountId: 'b' })], today);
  assert.equal(report.confirmed, 0);
});

test('rendimientos: agrega a centavos y conserva el orden y los datos originales', () => {
  const accounts = [account({ balance: 0.1, yieldEstimate: { daily: 0.1, weekly: 0.1, monthly: 0.1 } }), account({ id: 'b', balance: 0.2, yieldEstimate: { daily: 0.2, weekly: 0.2, monthly: 0.2 } })];
  const events = [event({ key: 'b', cents: 10 }), event({ key: 'a', cents: 20 })];
  const original = JSON.stringify({ accounts, events });
  const report = buildYieldReport(accounts, events, today);
  assert.equal(report.confirmed, 0.3);
  assert.equal(report.balance, 0.3);
  assert.equal(report.weekly, 0.3);
  assert.deepEqual(report.entries.map(entry => entry.key), ['a', 'b']);
  assert.equal(JSON.stringify({ accounts, events }), original);
});

test('rendimientos: el acumulado incluye días automáticos sin ingresos ni tipo de ingreso configurado', () => {
  const accounts = [account({ yieldIncomeTypeId: null }), account({ id: 'b', yieldIncomeTypeId: null })];
  const events = [event({ key: 'auto:a', kind: 'AUTO_YIELD', status: 'CALCULATED', automaticYield: true, incomeTypeId: null, cents: 274 }), event({ key: 'auto:b', accountId: 'b', kind: 'AUTO_YIELD', status: 'CALCULATED', automaticYield: true, incomeTypeId: null, cents: 950 })];
  const report = buildYieldReport(accounts, events, today);
  assert.equal(report.earned, 12.24);
  assert.equal(report.assignedEarned, 12.24);
  assert.equal(report.confirmed, 0);
  assert.deepEqual(report.rows.map(row => row.earned), [2.74, 9.5]);
  assert.equal(buildYieldReport(accounts, events, today, 'ALL', 'b').earned, 9.5);
});

test('rendimientos: el acumulado mezcla abonos registrados y automáticos a centavos y separa pendientes', () => {
  const report = buildYieldReport([account()], [event({ cents: 10 }), event({ key: 'auto', kind: 'AUTO_YIELD', automaticYield: true, status: 'CALCULATED', cents: 20 }), event({ key: 'unassigned', accountId: null, cents: 1 })], today);
  assert.equal(report.earned, 0.31);
  assert.equal(report.assignedEarned, 0.3);
  assert.equal(report.rows[0]?.earned, 0.3);
  assert.equal(report.pending, 3.01);
});
