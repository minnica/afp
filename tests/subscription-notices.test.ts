import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildImportantNotices, buildSubscriptionNotices } from '../src/lib/importantNotices';
import type { FinancialSubscription, StatementCycle } from '../src/lib/calculations/types';
import { getNoticeKey, isNoticeKey, partitionNotices } from '../src/lib/noticeDismissals';

const subscription: FinancialSubscription = {
  id: 'service', name: 'Servicio ficticio', amount: 199, paymentMethod: 'CARD', cardId: 'card',
  chargeDay: 15, isActive: true, frequencyMonths: 1, startYear: 2026, startMonth: 1,
};
const at = (day: string) => new Date(`${day}T12:00:00Z`);

test('suscripciones: efectivo y tarjeta avisan desde dos días antes, hoy y mientras estén pendientes', () => {
  for (const paymentMethod of ['CASH', 'CARD'] as const) {
    const sub = { ...subscription, paymentMethod };
    assert.equal(buildSubscriptionNotices([sub], at('2026-10-12')).length, 0);
    for (const [day, group] of [[13, 'upcoming'], [14, 'upcoming'], [15, 'today'], [16, 'overdue']] as const) {
      const notices = buildImportantNotices({ subscriptions: [sub], now: at(`2026-10-${day}`),
        payments: [], activeReceivables: [], cyclesWithAmounts: [], cards: [] });
      assert.equal(notices.length, 1);
      assert.equal(notices[0]?.type, `${paymentMethod}_SUBSCRIPTION`);
      assert.equal(notices[0]?.group, group);
      assert.equal(notices[0]?.amount, 199);
      assert.equal(new Date(notices[0]!.date).toISOString().slice(0, 10), '2026-10-15');
      assert.match(notices[0]!.description, /199\.00/);
    }
  }
});

test('suscripciones: anticipa cobros al cambiar de mes y año sin duplicar ocurrencias', () => {
  for (const [today, due, expected] of [
    ['2026-10-29', '2026-11-01', 0], ['2026-10-30', '2026-11-01', 1],
    ['2026-12-30', '2027-01-01', 1], ['2027-01-01', '2027-01-01', 1],
  ] as const) {
    const notices = buildSubscriptionNotices([{ ...subscription, chargeDay: 1,
      charges: [{ month: today.slice(0, 7), status: 'SKIPPED' as const, expenseId: null }].filter(charge => charge.month !== due.slice(0, 7)) }], at(today));
    assert.equal(notices.length, expected);
    if (expected) assert.equal(new Date(notices[0]!.date).toISOString().slice(0, 10), due);
  }
});

test('suscripciones: respeta frecuencia, inicio, desactivación y último día real del mes', () => {
  for (const sub of [
    { ...subscription, isActive: false, deactivatedAt: at('2026-10-01') },
    { ...subscription, startMonth: 11 },
    { ...subscription, startYear: 2027 },
    { ...subscription, frequencyMonths: 3, startMonth: 2 },
  ]) assert.equal(buildSubscriptionNotices([sub], at('2026-10-15')).length, 0);
  for (const [today, due] of [['2026-02-26', '2026-02-28'], ['2028-02-27', '2028-02-29']] as const) {
    const notices = buildSubscriptionNotices([{ ...subscription, chargeDay: 31 }], at(today));
    assert.equal(notices.length, 1);
    assert.equal(new Date(notices[0]!.date).toISOString().slice(0, 10), due);
  }
  const annual = { ...subscription, chargeDay: 1, startMonth: 1, frequencyMonths: 12 };
  assert.equal(buildSubscriptionNotices([annual], at('2026-10-30')).length, 0);
  assert.equal(buildSubscriptionNotices([annual], at('2026-12-30')).length, 1);
});

test('suscripciones: confirmar u omitir resuelve solo su mes; borrar el gasto restaura el aviso', () => {
  for (const decision of [{ status: 'CONFIRMED', expenseId: 'expense' }, { status: 'SKIPPED', expenseId: null }] as const) {
    const sub = { ...subscription, charges: [{ ...decision, month: '2026-10' }] };
    assert.equal(buildSubscriptionNotices([sub], at('2026-10-15')).length, 0);
    assert.equal(buildSubscriptionNotices([sub], at('2026-11-15')).length, 1);
  }
  const restored = { ...subscription, charges: [{ month: '2026-10', status: 'CONFIRMED' as const, expenseId: null }] };
  assert.equal(buildSubscriptionNotices([restored], at('2026-10-15')).length, 1);
});

test('suscripciones: gastos anticipados o contabilizados en otro mes resuelven la ocurrencia correcta', () => {
  assert.equal(buildSubscriptionNotices([{ ...subscription,
    dailyExpenses: [{ date: '2026-10-01' }] }], at('2026-10-13')).length, 0);
  const sub = { ...subscription, chargeDay: 1, dailyExpenses: [{ id: 'early', date: '2026-10-29', subscriptionCharge: { month: '2026-11' } }] };
  const notices = buildSubscriptionNotices([sub], at('2026-10-30'));
  assert.equal(notices.length, 1);
  assert.equal(new Date(notices[0]!.date).toISOString().slice(0, 10), '2026-10-01');
  assert.equal(buildSubscriptionNotices([{ ...subscription, chargeDay: 1,
    dailyExpenses: [{ date: '2026-11-01' }],
    charges: [{ month: '2026-10', status: 'SKIPPED', expenseId: null }] }], at('2026-10-30')).length, 0);
});

test('suscripciones: un comprobante bancario válido resuelve el aviso de tarjeta', () => {
  const cycle: StatementCycle = { cardId: 'card', year: 2026, month: 10, usageReconciliation: {
    version: 1, source: 'Estado ficticio', sourceSha256: 'a'.repeat(64), startDate: '2026-09-20', cutDate: '2026-10-19',
    subscriptionCharges: [{ subscriptionId: subscription.id, date: '2026-10-15', amount: 199 }],
  } };
  assert.equal(buildSubscriptionNotices([subscription], at('2026-10-20'), [cycle]).length, 0);
  assert.equal(buildSubscriptionNotices([subscription], at('2026-10-20'), [{ ...cycle, cardId: 'other' }]).length, 1);
});

test('suscripciones: la anticipación usa el día de México al cambiar de mes', () => {
  const sub = { ...subscription, chargeDay: 2, charges: [{ month: '2026-10', status: 'SKIPPED' as const, expenseId: null }] };
  assert.equal(buildSubscriptionNotices([sub], new Date('2026-10-31T05:59:59Z')).length, 0);
  const notices = buildSubscriptionNotices([sub], new Date('2026-10-31T06:00:00Z'));
  assert.equal(notices.length, 1);
  assert.equal(notices[0]?.group, 'upcoming');
});

test('suscripciones: efectivo conserva su clave y tarjeta permite ocultar/restaurar por ocurrencia', () => {
  for (const paymentMethod of ['CASH', 'CARD'] as const) {
    const notice = buildSubscriptionNotices([{ ...subscription, paymentMethod }], at('2026-10-13'))[0]!;
    const key = getNoticeKey(notice);
    assert.ok(key);
    assert.equal(isNoticeKey(key), true);
    assert.equal(key, JSON.stringify([`${paymentMethod}_SUBSCRIPTION`, 'subscription-service-2026-10', '2026-10-15', null]));
    const dismissals = [{ month: '2026-10', noticeKey: key }];
    assert.equal(partitionNotices([notice], dismissals, '2026-10').hidden.length, 1);
    assert.equal(partitionNotices([notice], [], '2026-10').visible.length, 1);
    assert.equal(partitionNotices([notice], dismissals, '2026-11').visible.length, 1);
  }
});
