import type { DateValue } from './calculations/types';

export const FINANCIAL_TIME_ZONE = 'America/Mexico_City';
const mexicoDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: FINANCIAL_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
});

/** An instant belongs to the financial day in Mexico, regardless of process/browser TZ. */
export function todayInMexico(now = new Date()) {
  const parts = mexicoDate.formatToParts(now);
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)!.value).join('-');
}

/** Stored banking dates are civil dates encoded in UTC, not instants to shift to Mexico. */
export function bankDay(value: DateValue) {
  const date = new Date(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function mexicoDayNumber(now = new Date()) {
  return Date.parse(todayInMexico(now));
}

export function daysUntilBankDate(value: DateValue, now = new Date()) {
  return (bankDay(value) - mexicoDayNumber(now)) / 86400000;
}

/** Find the next civil-day boundary using IANA rules, including offset changes. */
export function nextMexicoMidnight(now = new Date()) {
  const today = todayInMexico(now);
  let before = now.getTime();
  let after = before + 26 * 60 * 60 * 1000;
  while (after - before > 1) {
    const middle = Math.floor((before + after) / 2);
    if (todayInMexico(new Date(middle)) === today) before = middle;
    else after = middle;
  }
  return new Date(after);
}
