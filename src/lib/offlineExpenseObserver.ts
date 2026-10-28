import { readOfflineExpenses, subscribeOfflineExpenses } from './offlineExpenses';
import type { OfflineExpense, OfflineChange } from './offlineExpenseContracts';
import { isRecord } from './financialJson';

export interface OfflineExpenseObserverOptions {
  userId: string;
  onPending(pending: OfflineExpense[]): void;
  onConfirmed(): Promise<unknown>;
  onError(message: string): void;
}

// The JSX screen retains its filter dependencies. This consumer owns the queue
// subscription, stale reads and cleanup when that screen or account changes.
export function observeOfflineExpenses({ userId, onPending, onConfirmed, onError }: OfflineExpenseObserverOptions) {
  let active = true;
  let generation = 0;
  const refresh = async ({ confirmed = false }: Partial<OfflineChange> = {}) => {
    const current = ++generation;
    try {
      const pending = await readOfflineExpenses(userId);
      if (active && current === generation) onPending(pending);
      if (active && confirmed && navigator.onLine) await onConfirmed();
    } catch (error) {
      if (active) onError(isRecord(error) && typeof error.message === 'string' && error.message ? error.message : 'No se pudieron leer los pendientes.');
    }
  };
  const unsubscribe = subscribeOfflineExpenses(userId, refresh);
  const timeoutId = window.setTimeout(refresh, 0);
  return () => { active = false; unsubscribe(); window.clearTimeout(timeoutId); };
}
