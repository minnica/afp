import type { MoneyAccount, MoneyEvent } from './types';
import { readSnapshot, readYieldHistory, preserveYieldHistory } from './persisted';

type YieldFields = Pick<MoneyAccount, 'autoYield' | 'annualYield' | 'yieldTaxPercent' | 'yieldBasis' | 'yieldCap' | 'yieldStartDate' | 'yieldEndDate' | 'yieldIncomeTypeId' | 'yieldMethod' | 'yieldDailyAmount' | 'yieldExcessRate' | 'yieldPayout' | 'yieldRounding'>;
type YieldAccount = { [K in keyof YieldFields]?: YieldFields[K] | null };
type YieldReference = YieldAccount & { asOf: MoneyAccount['asOf']; yieldHistory?: unknown; reconciliations?: { snapshot: unknown }[] };
type YieldRule = ReturnType<typeof yieldRule>;
import { Prisma } from '@prisma/client';
import { day, addDays, todayInMexico } from '@/lib/money/dates';

export const yieldFields = ['autoYield', 'annualYield', 'yieldTaxPercent', 'yieldBasis', 'yieldCap', 'yieldStartDate', 'yieldEndDate', 'yieldIncomeTypeId', 'yieldMethod', 'yieldDailyAmount', 'yieldExcessRate', 'yieldPayout', 'yieldRounding'];
export function yieldRule(account: YieldAccount) {
  return {
    autoYield: !!account.autoYield, annualYield: Number(account.annualYield || 0), yieldTaxPercent: Number(account.yieldTaxPercent || 0), yieldBasis: Number(account.yieldBasis || 365),
    yieldCap: account.yieldCap == null || account.yieldCap === '' ? null : Number(account.yieldCap),
    yieldStartDate: day(account.yieldStartDate), yieldEndDate: day(account.yieldEndDate), yieldIncomeTypeId: account.yieldIncomeTypeId || null,
    yieldMethod: account.yieldMethod || 'NOMINAL', yieldDailyAmount: account.yieldDailyAmount == null || account.yieldDailyAmount === '' ? null : Number(account.yieldDailyAmount),
    yieldExcessRate: Number(account.yieldExcessRate || 0), yieldPayout: account.yieldPayout || 'DAILY', yieldRounding: account.yieldRounding || 'ROUND',
  };
}
export function yieldHistory(account: YieldReference) {
  const stored = readYieldHistory(account.yieldHistory);
  if (stored.length) return stored;
  const references = new Map<string, { from: string; rule: YieldRule }>();
  for (const entry of [...(account.reconciliations || [])].reverse()) {
    const snapshot = readSnapshot(entry.snapshot);
    if (snapshot) references.set(day(snapshot.asOf), { from: day(snapshot.asOf), rule: yieldRule({ ...snapshot, yieldBasis: Number(snapshot.yieldBasis || 365) }) });
  }
  references.set(day(account.asOf), { from: day(account.asOf), rule: yieldRule(account) });
  return [...references.values()];
}
export function ruleAt(account: YieldReference, date: string) {
  return [...yieldHistory(account)].sort((a, b) => b.from.localeCompare(a.from)).find(r => r.from <= date)?.rule || { ...yieldRule(account), autoYield: false, annualYield: 0, yieldDailyAmount: 0, yieldExcessRate: 0 };
}
export function changedYieldHistory(account: YieldReference, values: YieldAccount, today = todayInMexico()) {
  const next = yieldRule(values), history = yieldHistory(account);
  if (JSON.stringify(yieldRule(account)) === JSON.stringify(next)) return preserveYieldHistory(account.yieldHistory);
  return [...history.filter(r => r.from !== today), { from: today, rule: next }].sort((a, b) => a.from.localeCompare(b.from));
}

// Calendario bancario de México. El calendario futuro es una previsión basada
// en las fechas recurrentes; una suspensión extraordinaria requiere actualizarlo.
function easter(year: number) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), date = (h + l - 7 * m + 114) % 31 + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
}
const holidayCache = new Map<number, Set<string>>();
export function bankHolidays(year: number) {
  if (holidayCache.has(year)) return holidayCache.get(year)!;
  const monday = (month: number, ordinal: number) => { const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); return `${year}-${String(month).padStart(2, '0')}-${String(1 + (8 - first) % 7 + (ordinal - 1) * 7).padStart(2, '0')}`; };
  const days = new Set(['01-01', '05-01', '09-16', '11-02', '12-12', '12-25'].map(d => `${year}-${d}`));
  for (const d of [monday(2, 1), monday(3, 3), monday(11, 3), addDays(easter(year), -3), addDays(easter(year), -2)]) days.add(d);
  if ((year - 2024) % 6 === 0) days.add(`${year}-10-01`);
  holidayCache.set(year, days); return days;
}
export function paysOn(rule: { yieldPayout?: string | null }, date: string) {
  if (rule.yieldPayout !== 'MX_BUSINESS') return true;
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !bankHolidays(Number(date.slice(0, 4))).has(date);
}
export function previousBankingDay(date: string) {
  let result = date;
  while (!paysOn({ yieldPayout: 'MX_BUSINESS' }, result)) result = addDays(result, -1);
  return result;
}
export function dailyYieldCents(principalCents: number, rule: ReturnType<typeof ruleAt>, date: string) {
  if ((rule.yieldStartDate && date < rule.yieldStartDate) || (rule.yieldEndDate && date > rule.yieldEndDate)) return new Prisma.Decimal(0);
  const balance = new Prisma.Decimal(Math.max(0, principalCents));
  const cap = rule.yieldCap == null ? balance : new Prisma.Decimal(rule.yieldCap).mul(100);
  const base = Prisma.Decimal.min(balance, cap), excess = Prisma.Decimal.max(0, balance.sub(cap));
  let total = rule.yieldMethod === 'DAILY_AMOUNT'
    ? (cap.gt(0) ? base.div(cap).mul(rule.yieldDailyAmount || 0).mul(100) : new Prisma.Decimal(0))
    : base.mul(rule.annualYield || 0).div(100).div(rule.yieldBasis || 365);
  total = total.add(excess.mul(rule.yieldExcessRate || 0).div(100).div(rule.yieldBasis || 365));
  return total.mul(new Prisma.Decimal(100).sub(rule.yieldTaxPercent || 0)).div(100);
}
export function roundedYieldCents(value: Prisma.Decimal, rule: { yieldRounding?: string | null }) {
  return value.toDecimalPlaces(0, rule.yieldRounding === 'DOWN' ? Prisma.Decimal.ROUND_DOWN : Prisma.Decimal.ROUND_HALF_UP).toNumber();
}
export function isRecordedYield(account: YieldReference & { id: string }, events: MoneyEvent[], date: string) {
  const types = new Set(yieldHistory(account).map(r => r.rule.yieldIncomeTypeId).filter(Boolean));
  if (account.yieldIncomeTypeId) types.add(account.yieldIncomeTypeId);
  return events.some(e => !e.automaticYield && !e.excluded && e.accountId === account.id && e.date === date && types.has(e.incomeTypeId));
}
