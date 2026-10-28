import { isRecord, jsonRecords } from '../financialJson';
// Fields are inspected independently, as in the historical readers. Malformed
// optional receipts must not discard a valid statement or change other charges.
export function usageEvidence(value: unknown) {
  if (!isRecord(value)) return null;
  return {
    version: value.version,
    source: typeof value.source === 'string' ? value.source : '',
    sourceSha256: typeof value.sourceSha256 === 'string' ? value.sourceSha256 : '',
    startDate: typeof value.startDate === 'string' ? value.startDate : '',
    cutDate: typeof value.cutDate === 'string' ? value.cutDate : '',
    excludedExpenseIds: Array.isArray(value.excludedExpenseIds) ? value.excludedExpenseIds.filter((id): id is string => typeof id === 'string') : [],
    subscriptionCharges: jsonRecords(value.subscriptionCharges).map(receipt => ({
      ...receipt,
      subscriptionId: typeof receipt.subscriptionId === 'string' ? receipt.subscriptionId : '',
      date: typeof receipt.date === 'string' ? receipt.date : '',
      amount: receipt.amount,
      name: receipt.name,
      applyToCycleAmount: receipt.applyToCycleAmount,
    })),
  };
}
