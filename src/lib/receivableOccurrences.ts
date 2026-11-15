import type { DateValue } from './calculations/types';
import { bankDay, mexicoDayNumber } from './financialDates';

const DAY_MS = 86400000;
// A notice first appears two days before its scheduled collection.
export const RECEIVABLE_ADVANCE_DAYS = 2;

type CollectionSchedule = { expectedChargeDays?: readonly number[]; originDate?: DateValue };

function scheduledDays(schedule: CollectionSchedule, year: number, month: number) {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return [...new Set((schedule.expectedChargeDays || [])
    .filter(day => Number.isInteger(day) && day >= 1 && day <= 31)
    .map(day => Date.UTC(year, month, Math.min(day, lastDay))))].sort((a, b) => a - b);
}

/** Disjoint collection intervals: anticipations count once, even across months. */
export function receivableOccurrenceWindow(schedule: CollectionSchedule, chargeDate: DateValue) {
  const due = bankDay(chargeDate);
  if (!Number.isFinite(due)) return null;
  const date = new Date(due);
  const year = date.getUTCFullYear(), month = date.getUTCMonth();
  const dates = [-1, 0, 1].flatMap(offset => scheduledDays(schedule, year, month + offset));
  const index = dates.indexOf(due);
  const previous = dates[index - 1], next = dates[index + 1];
  if (index < 0 || previous === undefined || next === undefined) return null;
  const origin = schedule.originDate ? bankDay(schedule.originDate) : -Infinity;
  if (due < origin) return null;
  // Closely spaced dates retain their own day. Never consume an on-time payment
  // of the previous occurrence as an anticipation of this occurrence.
  const start = Math.max(due - RECEIVABLE_ADVANCE_DAYS * DAY_MS, previous + DAY_MS, origin);
  const end = Math.max(next - RECEIVABLE_ADVANCE_DAYS * DAY_MS, due + DAY_MS);
  return { start, end };
}

export function receivableOccurrenceIncomes<T extends { date: DateValue }>(
  account: CollectionSchedule & { incomes?: readonly T[] }, chargeDate: DateValue, now = new Date(),
): T[] {
  const window = receivableOccurrenceWindow(account, chargeDate);
  if (!window) return [];
  const today = mexicoDayNumber(now);
  return (account.incomes || []).filter(income => {
    const day = bankDay(income.date);
    return day >= window.start && day < window.end && day <= today;
  });
}
