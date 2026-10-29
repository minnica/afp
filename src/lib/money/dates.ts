import type { DateValue } from './types';
import { isCalendarDay } from '../financialValidation';
export { todayInMexico } from '../financialDates';
export function day(value: DateValue): string;
export function day(value: DateValue | null | undefined): string | null;
export function day(value: DateValue | null | undefined) { return value ? new Date(value).toISOString().slice(0, 10) : null; }
export function validDay(value: unknown): value is string { return typeof value === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(value) && isCalendarDay(value); }
export function addDays(value: string, n: number) { return day(new Date(Date.parse(`${value}T12:00:00Z`) + n * 86400000)); }
export function monthDay(month: string, n: number) {
  const [year = 0, number = 0] = month.split('-').map(Number);
  return `${month}-${String(Math.min(n, new Date(Date.UTC(year, number, 0)).getUTCDate())).padStart(2, '0')}`;
}
export function addMonths(value: string, n: number) { const d = new Date(`${value.slice(0, 7)}-01T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return day(d).slice(0, 7); }
export function monthRange(from: string, to: string) { const result = []; for (let m = from.slice(0, 7); m <= to.slice(0, 7); m = addMonths(m, 1)) result.push(m); return result; }
