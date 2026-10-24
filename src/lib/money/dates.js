export function day(value) { return value ? new Date(value).toISOString().slice(0, 10) : null; }
export function todayInMexico(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map(type => parts.find(p => p.type === type).value).join('-');
}
export function validDay(value) { return typeof value === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && day(value) === value; }
export function addDays(value, n) { return day(new Date(Date.parse(`${value}T12:00:00Z`) + n * 86400000)); }
export function monthDay(month, n) {
  const [year, number] = month.split('-').map(Number);
  return `${month}-${String(Math.min(n, new Date(Date.UTC(year, number, 0)).getUTCDate())).padStart(2, '0')}`;
}
export function addMonths(value, n) { const d = new Date(`${value.slice(0, 7)}-01T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return day(d).slice(0, 7); }
export function monthRange(from, to) { const result = []; for (let m = from.slice(0, 7); m <= to.slice(0, 7); m = addMonths(m, 1)) result.push(m); return result; }
