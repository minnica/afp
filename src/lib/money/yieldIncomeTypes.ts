import { day } from './dates';
import { readSnapshot, readYieldHistory } from './persisted';
import type { DateValue } from './types';

type YieldIncomeReference = {
  asOf: DateValue;
  yieldIncomeTypeId?: string | null;
  yieldHistory?: unknown;
  reconciliations?: readonly { snapshot: unknown }[];
};

// Use the same historical types when identifying real deposits and replacing
// automatic calculations. A balance reconciliation alone never proves earnings.
export function yieldIncomeTypeIds(account: YieldIncomeReference) {
  const history = readYieldHistory(account.yieldHistory);
  const references = new Map<string, string | null | undefined>();
  if (!history.length) {
    for (const entry of [...(account.reconciliations || [])].reverse()) {
      const snapshot = readSnapshot(entry.snapshot);
      if (snapshot) references.set(day(snapshot.asOf), snapshot.yieldIncomeTypeId);
    }
    references.set(day(account.asOf), account.yieldIncomeTypeId);
  }
  return new Set([
    ...history.map(entry => entry.rule.yieldIncomeTypeId),
    ...references.values(),
    account.yieldIncomeTypeId,
  ].filter((id): id is string => typeof id === 'string' && !!id));
}
