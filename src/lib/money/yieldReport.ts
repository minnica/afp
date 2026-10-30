import type { AccountResponse, DisplayEvent } from './responses';
import { yieldIncomeTypeIds } from './yieldIncomeTypes';

export type YieldReportAccount = Pick<AccountResponse, 'id' | 'name' | 'asOf' | 'yieldIncomeTypeId' | 'yieldHistory' | 'reconciliations' | 'balance' | 'yieldEstimate' | 'pendingYield'>;
type YieldReportEvent = Pick<DisplayEvent, 'key' | 'date' | 'cents' | 'kind' | 'accountId' | 'incomeTypeId' | 'excluded' | 'automaticYield' | 'status' | 'label'>;
export type YieldEntry = YieldReportEvent & { date: string; confirmed: boolean; accountName: string };

const toCents = (value: number) => Math.round(value * 100);
export function buildYieldReport(accounts: readonly YieldReportAccount[], actual: readonly YieldReportEvent[], today: string, period = today.slice(0, 7), accountId = 'ALL') {
  const typesByAccount = new Map(accounts.map(account => [account.id, yieldIncomeTypeIds(account)]));
  const knownTypes = new Set([...typesByAccount.values()].flatMap(types => [...types]));
  const entries: YieldEntry[] = [];
  for (const event of actual) {
    if (event.excluded || !event.date || event.date > today || event.cents <= 0) continue;
    const calculated = event.automaticYield === true && event.status === 'CALCULATED';
    const types = event.accountId ? typesByAccount.get(event.accountId) : knownTypes;
    const confirmed = !event.automaticYield && event.status === 'ACTUAL' && event.kind === 'INCOME' && !!event.incomeTypeId && !!types?.has(event.incomeTypeId);
    if (!calculated && !confirmed) continue;
    entries.push({ ...event, date: event.date, confirmed, accountName: accounts.find(account => account.id === event.accountId)?.name || 'Sin cuenta asignada' });
  }
  entries.sort((a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key));
  const months = [...new Set([today.slice(0, 7), ...entries.map(entry => entry.date.slice(0, 7))])].sort().reverse();
  const filtered = entries.filter(entry => (accountId === 'ALL' || entry.accountId === accountId)
    && (period === 'ALL' || (period === 'YEAR' ? entry.date.startsWith(today.slice(0, 4)) : entry.date.startsWith(period))));
  const sumEntries = (rows: readonly YieldEntry[], confirmed: boolean) => rows.filter(entry => entry.confirmed === confirmed).reduce((sum, entry) => sum + entry.cents, 0) / 100;
  const earned = (rows: readonly YieldEntry[]) => rows.reduce((sum, entry) => sum + entry.cents, 0) / 100;
  const rows = accounts.filter(account => accountId === 'ALL' || account.id === accountId).map(account => {
    const history = filtered.filter(entry => entry.accountId === account.id);
    return { account, earned: earned(history), confirmed: sumEntries(history, true), calculated: sumEntries(history, false) };
  });
  const unassigned = filtered.filter(entry => !entry.accountId);
  const sumAccounts = (getValue: (account: YieldReportAccount) => number) => rows.reduce((sum, row) => sum + toCents(getValue(row.account)), 0) / 100;
  return {
    months, entries: filtered, rows,
    earned: earned(filtered), assignedEarned: earned(filtered.filter(entry => !!entry.accountId)),
    confirmed: sumEntries(filtered, true), calculated: sumEntries(filtered, false),
    confirmedCount: filtered.filter(entry => entry.confirmed).length,
    unassigned: sumEntries(unassigned, true),
    balance: sumAccounts(account => account.balance),
    daily: sumAccounts(account => account.yieldEstimate.daily),
    weekly: sumAccounts(account => account.yieldEstimate.weekly),
    monthly: sumAccounts(account => account.yieldEstimate.monthly),
    pending: sumAccounts(account => account.pendingYield),
  };
}
