import assert from 'node:assert/strict';
import { test } from 'node:test';
import { receivableOccurrenceIncomes, receivableOccurrenceWindow } from '../src/lib/receivableOccurrences';
import { buildReceivableNotices } from '../src/lib/importantNotices';

const account = { id: 'debt', concept: 'Cobro ficticio', originalAmount: 5000, expectedMonthlyPayment: 100,
  expectedChargeDays: [15, 31], status: 'ACTIVE' as const, originDate: '2026-01-01',
  person: { name: 'Persona ficticia' }, incomes: [{ date: '2026-11-13', amount: 100 }] };
const at = (date: string) => new Date(`${date}T12:00:00Z`);

test('cobros: un abono del 13 retira el aviso del 15 antes, durante y después del vencimiento', () => {
  for (const date of ['2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16']) {
    assert.equal(buildReceivableNotices([account], at(date)).length, 0);
  }
  assert.equal(buildReceivableNotices([{ ...account, incomes: [] }], at('2026-11-14'))[0]?.group, 'upcoming');
  assert.equal(buildReceivableNotices([{ ...account, incomes: [] }], at('2026-11-16'))[0]?.group, 'overdue');
});

test('cobros: pagar el 13 no resuelve el día 30 ni la próxima quincena', () => {
  const notices = buildReceivableNotices([account], at('2026-11-30'));
  assert.deepEqual(notices.map(notice => new Date(notice.date).toISOString().slice(0, 10)), ['2026-11-30']);
  assert.equal(buildReceivableNotices([account], at('2026-12-15')).length, 1);
  const both = { ...account, incomes: [...account.incomes, { date: '2026-11-28', amount: 100 }] };
  assert.equal(buildReceivableNotices([both], at('2026-11-30')).length, 0);
  const unpaidFirst = buildReceivableNotices([{ ...account, incomes: [{ date: '2026-11-28', amount: 100 }] }], at('2026-11-30'))[0]!;
  assert.equal(new Date(unpaidFirst.date).toISOString().slice(0, 10), '2026-11-15');
});

test('cobros: los intervalos no reutilizan un abono anticipado para un cobro anterior vencido', () => {
  const paid = { ...account, incomes: [{ date: '2026-11-28', amount: 100 }] };
  assert.equal(receivableOccurrenceIncomes(paid, '2026-11-15', at('2026-11-30')).length, 0);
  assert.equal(receivableOccurrenceIncomes(paid, '2026-11-30', at('2026-11-30')).length, 1);
  assert.equal(receivableOccurrenceIncomes({ ...account, incomes: [{ date: '2026-11-20', amount: 100 }] }, '2026-11-15', at('2026-11-30')).length, 1);
});

test('cobros: los anticipos del día 1 sobreviven al cambio de mes y año', () => {
  for (const [chargeDate, paymentDate] of [['2026-11-01', '2026-10-30'], ['2027-01-01', '2026-12-30']]) {
    assert.ok(chargeDate && paymentDate);
    const paid = { ...account, expectedChargeDays: [1, 15], incomes: [{ date: paymentDate, amount: 100 }] };
    assert.equal(receivableOccurrenceIncomes(paid, chargeDate, at(chargeDate)).length, 1);
    assert.equal(buildReceivableNotices([paid], at(chargeDate)).length, 0);
  }
});

test('cobros: febrero, días repetidos y días consecutivos conservan intervalos sin solaparse', () => {
  const february = { ...account, expectedChargeDays: [31, 30, 29, 29], incomes: [{ date: '2028-02-27', amount: 100 }] };
  assert.equal(receivableOccurrenceIncomes(february, '2028-02-29', at('2028-02-28')).length, 1);
  const consecutive = { ...account, expectedChargeDays: [14, 15, 16], incomes: [{ date: '2026-11-14', amount: 100 }] };
  assert.equal(receivableOccurrenceIncomes(consecutive, '2026-11-14', at('2026-11-16')).length, 1);
  assert.equal(receivableOccurrenceIncomes(consecutive, '2026-11-15', at('2026-11-16')).length, 0);
  assert.equal(receivableOccurrenceIncomes(consecutive, '2026-11-16', at('2026-11-16')).length, 0);
});

test('cobros: limita al origen, las fechas programadas y el día actual en México', () => {
  assert.equal(receivableOccurrenceWindow({ ...account, expectedChargeDays: [] }, '2026-11-15'), null);
  assert.equal(receivableOccurrenceWindow(account, '2026-11-14'), null);
  assert.equal(receivableOccurrenceWindow({ ...account, originDate: '2026-11-16' }, '2026-11-15'), null);
  assert.equal(receivableOccurrenceIncomes({ ...account, originDate: '2026-11-14' }, '2026-11-15', at('2026-11-15')).length, 0);
  assert.equal(receivableOccurrenceIncomes(account, '2026-11-15', new Date('2026-11-13T05:59:59Z')).length, 0);
  assert.equal(receivableOccurrenceIncomes(account, '2026-11-15', new Date('2026-11-13T06:00:00Z')).length, 1);
});

test('cobros: editar, borrar o reasignar el ingreso restaura el aviso sin alterar el movimiento', () => {
  const before = structuredClone(account);
  assert.equal(buildReceivableNotices([account], at('2026-11-14')).length, 0);
  assert.deepEqual(account, before);
  assert.equal(buildReceivableNotices([{ ...account, incomes: [] }], at('2026-11-14')).length, 1);
  assert.equal(buildReceivableNotices([{ ...account, incomes: [{ date: '2026-11-12', amount: 100 }] }], at('2026-11-14')).length, 1);
});
