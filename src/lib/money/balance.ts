import { Prisma } from '@prisma/client';
import type { DateValue, Exposure, MoneyEvent, MoneyValue } from './types';
import { readBaseline } from './persisted';
import { day } from './dates';

export type BalanceReference = { id: string; asOf: DateValue; openingBalance: MoneyValue; baseline?: unknown };
export function cents(value: MoneyValue) { return new Prisma.Decimal(value || 0).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).mul(100).toNumber(); }
export function amount(value: number) { return value / 100; }

// Several receipts can describe the same card payment. Its reference is kept
// at cycle level so identifying those receipts never reapplies the money.
export function exposure(events: readonly MoneyEvent[], from: string, to: string, includeAutomatic = true) {
  const result: Exposure = {};
  for (const e of events) {
    if (e.excluded || !e.date || e.date < from || e.date > to || (!includeAutomatic && e.automaticYield)) continue;
    const key = e.paymentGroup ? `card-flow:${e.paymentGroup}` : e.key;
    result[key] ||= {};
    const account = e.accountId || 'UNASSIGNED';
    result[key]![account] = (result[key]![account] || 0) + e.cents;
  }
  return result;
}

// Shared by the balance and its explanation. Only the change since the saved
// reference affects the account, including removed or reassigned records.
export function accountBalanceEffects(account: BalanceReference, events: readonly MoneyEvent[], today: string) {
  const from = day(account.asOf);
  const applicable = events.filter(e => !e.excluded && e.date && e.date >= from && e.date <= today && (!e.automaticYield || e.date > from));
  const base = readBaseline(account.baseline), current = exposure(applicable, from, today);
  const grouped = new Map<string, MoneyEvent[]>();
  for (const event of applicable) {
    if (event.accountId !== account.id) continue;
    const key = event.paymentGroup ? `card-flow:${event.paymentGroup}` : event.key;
    const group = grouped.get(key) || [];
    group.push(event); grouped.set(key, group);
  }
  const effects = [];
  for (const key of new Set([...Object.keys(base), ...Object.keys(current)])) {
    const now = current[key] || {}, before = base[key] || {};
    const currentCents = now[account.id] || 0, baselineCents = before[account.id] || 0;
    let coveredCents = 0, unknown = Math.abs(before.UNASSIGNED || 0);
    // Assigning money that was already included without an account must not
    // add it again. Keep the existing deterministic allocation across accounts.
    for (const id of Object.keys(now).filter(id => id !== 'UNASSIGNED').sort()) {
      const newlyAssigned = Math.max(0, Math.abs(now[id]!) - Math.abs(before[id] || 0));
      const covered = Math.min(unknown, newlyAssigned);
      if (id === account.id) coveredCents = Math.sign(now[id]!) * covered;
      unknown -= covered;
    }
    const change = currentCents - baselineCents - coveredCents;
    if (change) effects.push({ key, cents: change, currentCents, baselineCents, coveredCents, events: grouped.get(key) || [] });
  }
  return effects;
}
