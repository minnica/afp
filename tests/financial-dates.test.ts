import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { bankDay, daysUntilBankDate, mexicoDayNumber, nextMexicoMidnight, todayInMexico } from '../src/lib/financialDates';
import { todayInMexico as moneyToday } from '../src/lib/money/dates';
import { getNoticeMonth } from '../src/lib/noticeDismissals';
import { getCyclePaymentState } from '../src/lib/calculations/cardCyclePayments';
import { formatPaymentDeadline, getDashboardPayment } from '../src/lib/cardPaymentPresentation';
import { buildDashboardPayments, buildCardPaymentNotices } from '../src/lib/importantNotices';

const cycle = {
  id: 'cycle', cardId: 'card', year: 2026, month: 10,
  startDate: '2026-09-11', cutDate: '2026-10-10', dueDate: '2026-10-15',
  statementAmount: 1000, paidAmount: 1, calculatedAmount: 800,
};

test('A04: el mismo instante conserva día, estado, aviso y leyenda hasta medianoche México', () => {
  for (const instant of ['2026-10-15T06:00:00Z', '2026-10-16T00:01:00Z', '2026-10-16T05:59:59.999Z', '2026-10-16T06:00:00Z']) {
    const now = new Date(instant);
    const overdue = instant === '2026-10-16T06:00:00Z';
    assert.equal(todayInMexico(now), overdue ? '2026-10-16' : '2026-10-15');
    assert.equal(moneyToday(now), todayInMexico(now));
    assert.equal(daysUntilBankDate(cycle.dueDate, now), overdue ? -1 : 0);
    for (const hour of ['00:00:00', '12:00:00', '23:59:59']) {
      const input = { ...cycle, dueDate: `${cycle.dueDate}T${hour}Z` };
      const state = getCyclePaymentState(input, now);
      assert.equal(state.displayStatus, overdue ? 'OVERDUE' : 'PARTIALLY_PAID');
      assert.equal(state.pendingAmount, 999);
      assert.equal(getCyclePaymentState({ ...input, paidAmount: 1000 }, now).displayStatus, 'PAID');
      assert.equal(getCyclePaymentState({ ...input, statementAmount: 0 }, now).displayStatus, 'NO_PAYMENT_DUE');
      assert.equal(getCyclePaymentState({ ...input, paidAmount: 0 }, now).displayStatus, overdue ? 'OVERDUE' : 'PAYMENT_PENDING');
      assert.equal(getCyclePaymentState({ ...input, statementAmount: null }, now).displayStatus, overdue ? 'OVERDUE' : 'CUT');
      const [notice] = buildCardPaymentNotices([{ card: { id: 'card', name: 'Prueba' }, currentPayment: input }], now);
      assert.equal(notice?.group, overdue ? 'overdue' : 'today');
      assert.equal(notice?.amount, 999);
      assert.equal(formatPaymentDeadline(input.dueDate, now), `${overdue ? 'Fue ayer' : 'Es hoy'} [15 octubre]`);
    }
  }
});

test('A04: mes y año cambian en México y el vencimiento conserva el día UTC almacenado', () => {
  for (const [day, before, after] of [
    ['2026-10-31', '2026-11-01T05:59:59.999Z', '2026-11-01T06:00:00Z'],
    ['2026-12-31', '2027-01-01T05:59:59.999Z', '2027-01-01T06:00:00Z'],
  ] as const) {
    const input = { ...cycle, dueDate: day };
    const now = new Date(before);
    assert.equal(todayInMexico(now), day);
    assert.equal(getNoticeMonth(now), day.slice(0, 7));
    assert.equal(getCyclePaymentState(input, now).displayStatus, 'PARTIALLY_PAID');
    assert.equal(getCyclePaymentState(input, new Date(after)).displayStatus, 'OVERDUE');
    assert.equal(bankDay(`${day}T23:59:59Z`), mexicoDayNumber(now));
    assert.equal(nextMexicoMidnight(now).toISOString(), new Date(after).toISOString());
  }
});

test('A04: corte, importe y agrupación del Dashboard cambian juntos al empezar el día en México', () => {
  for (const [instant, expected] of [['2026-10-10T05:59:59.999Z', 'OPEN'], ['2026-10-10T06:00:00Z', 'PAYMENT_PENDING']] as const) {
    const now = new Date(instant);
    const input = { ...cycle, cutDate: '2026-10-10T23:59:59Z', paidAmount: 0 };
    assert.equal(getCyclePaymentState(input, now).displayStatus, expected);
    assert.equal(getDashboardPayment(input, now).isStatement, expected !== 'OPEN');
    assert.equal(getDashboardPayment(input, now).amount, expected === 'OPEN' ? 800 : 1000);
  }
  const next = { ...cycle, id: 'next', cutDate: '2026-11-10', dueDate: '2026-11-30' };
  const payments = buildDashboardPayments([{ id: 'card', name: 'Prueba' }], [cycle, next], new Date('2026-10-10T06:00:00Z'));
  assert.equal(payments[0]?.currentPayment?.id, 'cycle');
  assert.equal(payments[0]?.nextPayment?.id, 'next');
});

test('A04: próxima actualización usa medianoche México, incluidos cambios históricos de offset', () => {
  for (const [instant, next] of [
    ['2026-10-16T00:01:00Z', '2026-10-16T06:00:00.000Z'],
    ['2026-10-16T06:00:00Z', '2026-10-17T06:00:00.000Z'],
    ['2021-04-04T06:00:00Z', '2021-04-05T05:00:00.000Z'],
    ['2021-10-31T05:00:00Z', '2021-11-01T06:00:00.000Z'],
  ] as const) assert.equal(nextMexicoMidnight(new Date(instant)).toISOString(), next);
});

// Each child executes identical UTC instants and assertions, never local constructors.
if (!process.env.AFP_FINANCIAL_TZ_CHILD) {
  for (const TZ of ['UTC', 'America/Mexico_City', 'Asia/Tokyo', 'Pacific/Kiritimati']) {
    test(`A04: regresiones de API, persistencia y presentación bajo TZ=${TZ}`, () => {
      const result = spawnSync(process.execPath, ['--import', 'tsx', 'tests/run-tests.ts',
        'financial-dates.test.ts', 'card-cycle-payments.test.ts', 'card-payment-presentation.test.ts',
        'card-usage-presentation.test.ts', 'android-notices.test.ts', 'notice-dismissals.test.ts',
        'dashboard-breakdowns.test.ts', 'card-usage-waivers.test.ts', 'nu-turbo-usage.test.ts',
        'financial-day-integration.test.ts'], {
        cwd: process.cwd(), env: { ...process.env, TZ, AFP_FINANCIAL_TZ_CHILD: '1' }, encoding: 'utf8',
        timeout: 60_000, maxBuffer: 4 * 1024 * 1024,
      });
      assert.equal(result.status, 0, `${TZ}: ${result.error?.message ?? ''}\n${result.stderr}\n${result.stdout}`);
    });
  }
}
