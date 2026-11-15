import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCutCycleNotices } from '../src/lib/importantNotices';
import { cardStatementHref, cardStatementSchema } from '../src/lib/cardStatementPrefill';

const draft = { statementAmount: '1500.25', startDate: '2026-10-15', cutDate: '2026-11-14', dueDate: '2026-12-04' };

test('cortes: el aviso identifica el ciclo exacto sin transmitir estimaciones ni datos personales', () => {
  const now = new Date('2026-11-14T18:00:00Z');
  const cards = [{ id: 'card', name: 'Tarjeta ficticia' }];
  for (const [displayStatus, cutDate, type] of [
    ['CUT', '2026-11-14', 'CUT_CYCLE'], ['OPEN', '2026-11-16', 'CUT_CYCLE_UPCOMING'],
  ] as const) {
    const notice = buildCutCycleNotices([{
      id: 'cycle-with-dashes', cardId: 'card', month: 11, year: 2026,
      startDate: '2026-10-15', cutDate, dueDate: '2026-12-04', displayStatus, calculatedAmount: 999,
    }], cards, now)[0]!;
    assert.equal(notice.type, type);
    const url = new URL(cardStatementHref(notice)!, 'https://example.test');
    assert.equal(url.pathname, '/tarjetas');
    assert.deepEqual([...url.searchParams], [['statementCycleId', 'cycle-with-dashes']]);
  }
  assert.equal(cardStatementHref({ type: 'CARD_PAYMENT', cycleId: 'cycle' }), null);
  assert.equal(cardStatementHref({ type: 'CUT_CYCLE' }), null);
  assert.equal(new URL(cardStatementHref({ type: 'CUT_CYCLE', cycleId: 'id&year=2025' })!, 'https://example.test').searchParams.get('statementCycleId'), 'id&year=2025');
});

test('estado de cuenta: exige monto real, admite cero y valida las tres fechas bancarias', () => {
  assert.equal(cardStatementSchema.safeParse(draft).success, true);
  assert.equal(cardStatementSchema.safeParse({ ...draft, statementAmount: '0' }).success, true);
  for (const statementAmount of ['', ' ', '-1', '0.001', '1e3', '10,000', '10000000000']) {
    assert.equal(cardStatementSchema.safeParse({ ...draft, statementAmount }).success, false);
  }
  for (const dates of [
    { startDate: '' }, { cutDate: '2026-02-30' }, { startDate: draft.cutDate },
    { dueDate: draft.cutDate }, { startDate: '2026-11-15' }, { dueDate: '2026-11-13' },
  ]) assert.equal(cardStatementSchema.safeParse({ ...draft, ...dates }).success, false);
  assert.equal(cardStatementSchema.safeParse({ ...draft, startDate: '2028-02-01', cutDate: '2028-02-29', dueDate: '2028-03-20' }).success, true);
});
