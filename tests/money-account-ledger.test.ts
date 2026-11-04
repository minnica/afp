import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildAccountLedger, filterAccountLedger } from '../src/lib/money/accountLedger';
import { accountBalances } from '../src/lib/money/sources';
import { exposure } from '../src/lib/money/balance';
import type { MoneyEvent } from '../src/lib/money/types';

const today = '2026-11-03';
const reference = '2026-10-24';
const account = (baseline: unknown = {}, id = 'a') => ({ id, asOf: reference, openingBalance: '1000.00', baseline });
const event = (key: string, value: number, extra: Partial<MoneyEvent> = {}): MoneyEvent => ({
  key, cents: value, label: key, kind: value > 0 ? 'INCOME' : 'EXPENSE', date: '2026-11-02', accountId: 'a', ...extra,
});
function check(events: MoneyEvent[], baseline: unknown = {}, id = 'a') {
  const result = buildAccountLedger(account(baseline, id), events, today);
  assert.equal(result.balance, accountBalances([account(baseline, id)], events, today)[0]!.balance);
  assert.equal(Math.round((result.openingBalance + result.incoming - result.outgoing + result.adjustments) * 100), Math.round(result.balance * 100));
  const ordered = [...result.entries].reverse();
  let balance = 100000;
  for (const row of ordered) { balance += row.cents; assert.equal(row.balance, balance / 100); }
  return result;
}

test('desglose: referencia, entradas y salidas explican el saldo con centavos y orden diario estable', () => {
  const events = [event('income:salary', 123456, { date: '2026-10-30', label: 'Nómina' }), event('expense:coffee', -4567), event('income:collection', 17500, { date: today, kind: 'COLLECTION' })];
  const result = check(events);
  assert.equal(result.balance, 2363.89); assert.equal(result.incoming, 1409.56); assert.equal(result.outgoing, 45.67);
  assert.deepEqual(result.entries.map(e => e.balance), [2363.89, 2188.89, 2234.56]);
  assert.deepEqual(buildAccountLedger(account(), [...events].reverse(), today), result);
});
test('desglose: cada cuenta recibe su propio lado de una transferencia y conserva el total', () => {
  const events = [event('transfer:1:out', -7525, { kind: 'TRANSFER' }), event('transfer:1:in', 7525, { kind: 'TRANSFER', accountId: 'b' })];
  const a = check(events), b = check(events, {}, 'b');
  assert.equal(a.balance, 924.75); assert.equal(b.balance, 1075.25); assert.equal(a.balance + b.balance, 2000);
  assert.equal(a.entries.length, 1); assert.equal(b.entries.length, 1);
});
test('desglose: excluye previsiones, movimientos futuros, sin cuenta y anteriores a la referencia', () => {
  const result = check([event('future', 10000, { date: '2026-11-04' }), event('past', 10000, { date: '2026-10-23' }), event('excluded', 10000, { excluded: true }), event('unassigned', 10000, { accountId: null }), event('missing-date', 10000, { date: null }), event('other', 10000, { accountId: 'b' })]);
  assert.equal(result.balance, 1000); assert.deepEqual(result.entries, []);
});
test('desglose: los movimientos ya incluidos en la referencia no se vuelven a sumar', () => {
  const events = [event('income:included', 25000, { date: reference })];
  const result = check(events, exposure(events, reference, reference));
  assert.equal(result.balance, 1000); assert.equal(result.entries.length, 0);
});
test('desglose: editar un registro incluido muestra solo su cambio neto como ajuste', () => {
  const result = check([event('income:old', 30000, { date: reference, label: 'Depósito editado' })], { 'income:old': { a: 25000 } });
  assert.equal(result.balance, 1050); assert.equal(result.adjustments, 50); assert.equal(result.incoming, 0);
  assert.equal(result.entries[0]!.adjustment, true); assert.equal(result.entries[0]!.date, reference);
  assert.match(result.entries[0]!.description!, /No representa una nueva operación bancaria/);
});
test('desglose: un ingreso eliminado y un gasto excluido conservan el efecto de corrección', () => {
  const result = check([event('expense:removed', -10000, { excluded: true, date: reference })], { 'income:deleted': { a: 25000 }, 'expense:removed': { a: -10000 } });
  assert.equal(result.balance, 850); assert.equal(result.adjustments, -150); assert.equal(result.entries.length, 2);
  assert.ok(result.entries.every(row => row.adjustment && row.date === reference && row.source === null));
});
test('desglose: al trasladar un registro de referencia entre cuentas se explican ambos cambios', () => {
  const events = [event('income:moved', 25000, { date: reference, accountId: 'b' })];
  assert.equal(check(events, { 'income:moved': { a: 25000 } }).adjustments, -250);
  assert.equal(check(events, { 'income:moved': { a: 25000 } }, 'b').balance, 1250);
});
test('desglose: asignar un registro de referencia sin cuenta no crea una entrada nueva', () => {
  const events = [event('income:assigned', 25000, { date: reference })];
  const result = check(events, { 'income:assigned': { UNASSIGNED: 25000 } });
  assert.equal(result.balance, 1000); assert.equal(result.entries.length, 0);
});
test('desglose: una asignación sin cuenta que también cambia importe muestra solo el excedente', () => {
  const result = check([event('income:assigned', 27500, { date: reference })], { 'income:assigned': { UNASSIGNED: 25000 } });
  assert.equal(result.balance, 1025); assert.equal(result.adjustments, 25); assert.equal(result.entries.length, 1);
});
test('desglose: reparto de importes sin cuenta conserva la asignación determinista entre cuentas', () => {
  const events = [event('payment:1', -15000, { paymentGroup: 'cycle' }), event('payment:2', -15000, { paymentGroup: 'cycle', accountId: 'b' })];
  const baseline = { 'card-flow:cycle': { UNASSIGNED: -20000 } };
  const a = check(events, baseline), b = check(events, baseline, 'b');
  assert.equal(a.balance, 1000); assert.equal(b.balance, 900);
});
test('desglose: identificaciones de pagos de tarjeta ya incluidos no duplican salidas', () => {
  const events = [event('payment:receipt', -15000, { kind: 'CARD_PAYMENT', paymentGroup: 'cycle' }), event('payment:legacy', -10000, { kind: 'CARD_PAYMENT', paymentGroup: 'cycle', approximateDate: true })];
  const result = check(events, { 'card-flow:cycle': { a: -25000 } });
  assert.equal(result.entries.length, 0); assert.equal(result.balance, 1000);
});
test('desglose: pagos nuevos del mismo corte muestran sus partidas individuales una sola vez', () => {
  const result = check([event('payment:a', -15000, { kind: 'CARD_PAYMENT', paymentGroup: 'cycle' }), event('payment:b', -10000, { kind: 'CARD_PAYMENT', paymentGroup: 'cycle' })]);
  assert.equal(result.outgoing, 250); assert.equal(result.entries.length, 2); assert.equal(result.balance, 750);
});
test('desglose: un abono adicional a un corte incluido se expresa como ajuste neto de referencia', () => {
  const result = check([event('payment:all', -30000, { kind: 'CARD_PAYMENT', paymentGroup: 'cycle' })], { 'card-flow:cycle': { a: -25000 } });
  assert.equal(result.balance, 950); assert.equal(result.adjustments, -50); assert.equal(result.outgoing, 0);
});
test('desglose: rendimientos calculados e ingresos estimados conservan su certeza', () => {
  const result = check([event('yield:reference', 100, { date: reference, automaticYield: true, kind: 'AUTO_YIELD' }), event('yield:after', 125, { automaticYield: true, kind: 'AUTO_YIELD' }), event('payroll:estimated', 50000, { estimatedIncome: true })]);
  assert.equal(result.balance, 1501.25); assert.equal(result.calculated, 1.25); assert.equal(result.estimated, 500);
  assert.equal(result.entries.find(e => e.key === 'yield:after')!.certainty, 'CALCULATED');
  assert.equal(result.entries.find(e => e.key === 'payroll:estimated')!.certainty, 'ESTIMATED');
  assert.ok(!result.entries.some(e => e.key === 'yield:reference'));
});
test('desglose: mover un registro de referencia al futuro no inventa una operación futura o una fecha de edición', () => {
  const result = check([event('income:changed-date', 25000, { date: '2026-11-30' })], { 'income:changed-date': { a: 25000 } });
  assert.equal(result.balance, 750); assert.equal(result.entries[0]!.date, reference); assert.equal(result.entries[0]!.adjustment, true);
});
test('desglose: los ajustes de una nómina estimada siguen identificados como aproximados', () => {
  const result = check([event('income:estimate', 30000, { date: reference, estimatedIncome: true })], { 'income:estimate': { a: 25000 } });
  assert.equal(result.balance, 1050); assert.equal(result.adjustments, 50);
  assert.equal(result.entries[0]!.certainty, 'ESTIMATED'); assert.equal(result.estimated, 50);
});
test('desglose: búsqueda y mes conservan el saldo acumulado de los registros ocultos', () => {
  const result = check([event('income:oct', 10000, { date: '2026-10-30', label: 'Nómina' }), event('expense:nov', -5000, { label: 'Café' }), event('income:nov', 2500, { label: 'Devolución' })]);
  const filtered = filterAccountLedger(result.entries, 'CAFE', '2026-11');
  assert.equal(filtered.length, 1); assert.equal(filtered[0]!.key, 'expense:nov');
  assert.equal(filtered[0]!.balance, result.entries.find(e => e.key === 'expense:nov')!.balance);
  assert.equal(filterAccountLedger(result.entries, 'nomina', '2026-11').length, 0);
  assert.equal(filterAccountLedger(result.entries, 'nomina', '2026-10').length, 1);
});
test('desglose: efectivo aportado, retiros y saldo negativo mantienen sus signos', () => {
  const result = check([event('contribution', 2500, { kind: 'CONTRIBUTION' }), event('withdrawal', -200000, { kind: 'WITHDRAWAL' })]);
  assert.equal(result.balance, -975); assert.equal(result.incoming, 25); assert.equal(result.outgoing, 2000);
});
test('desglose: el saldo de referencia conserva el redondeo financiero y no muta los datos', () => {
  const input = { ...account(), openingBalance: '1.005' }, events = [event('small', 1)];
  const before = JSON.stringify({ input, events });
  assert.equal(buildAccountLedger(input, events, today).balance, 1.02);
  assert.equal(JSON.stringify({ input, events }), before);
});
