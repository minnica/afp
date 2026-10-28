import { isRecord } from './financialJson';

// Stored drafts predate the complete expense command. Preserve partial values
// and metadata; validate the envelope without coercing money or operation IDs.
export type OfflineExpensePayload = Record<string, unknown>;
export interface OfflineExpense extends Record<string, unknown> {
  userId: string; clientId: string; createdAt: string; payload: OfflineExpensePayload;
  lastError?: string | null; lastStatus?: number | null;
}
export interface OfflineChange { userId: string; confirmed?: boolean }
export interface SyncedOfflineExpense extends Record<string, unknown> { id: string }
export interface OfflineSyncResult {
  syncedExpenses: SyncedOfflineExpense[];
  confirmations: { clientId: string; alreadyConfirmed: boolean }[];
  failedExpenses: OfflineExpense[];
}
export function readOfflineEntry(value: unknown): OfflineExpense {
  if (!isRecord(value) || typeof value.userId !== 'string' || typeof value.clientId !== 'string'
    || typeof value.createdAt !== 'string' || !isRecord(value.payload)
    || (value.lastError != null && typeof value.lastError !== 'string')
    || (value.lastStatus != null && typeof value.lastStatus !== 'number')) {
    throw new Error('La cola local tiene datos no válidos. Se conserva para recuperarla.');
  }
  // All known fields have been checked; retain the original object, not a
  // normalized copy, so retries send precisely the original payload.
  return value as OfflineExpense;
}
export function readLegacyEntries(value: unknown): (Record<string, unknown> & { clientId: IDBValidKey; payload: object })[] {
  if (!Array.isArray(value)) throw new Error('La cola anterior tiene datos no válidos. Se conserva para recuperarla.');
  return (value as unknown[]).map(entry => {
    if (!isRecord(entry) || !entry.clientId || !(typeof entry.clientId === 'string' || typeof entry.clientId === 'number')
      || !entry.payload || typeof entry.payload !== 'object') throw new Error('La cola anterior tiene datos no válidos. Se conserva para recuperarla.');
    return { ...entry, clientId: entry.clientId, payload: entry.payload };
  });
}
export function isOfflineChange(value: unknown): value is OfflineChange {
  return isRecord(value) && typeof value.userId === 'string' && (value.confirmed === undefined || typeof value.confirmed === 'boolean');
}

// The existing form retains ignored card IDs (including an empty string) when
// switching payment method. Queue the original body; the API validates it later.
export type OfflineExpenseDraft = { date: string; concept: string; amount: string | number; categoryId: string } & (
  | { paymentMethod: 'CASH'; cardId?: string | null; debitAccountId?: null }
  | { paymentMethod: 'CARD'; cardId: string; debitAccountId?: null }
  | { paymentMethod: 'DEBIT'; debitAccountId: string; cardId?: string | null }
);
