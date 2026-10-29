import { uiFetch } from './uiClient';
import type { UiResponse } from './uiResponseSchemas';
import { errorMessage } from './uiTypes';

export type ExpensesUrl = `/api/expenses?${string}`;
type ReadOptions = { force?: boolean; errorMode?: 'dialog' | 'inline'; mutationCompleted?: boolean };
type ExpenseSnapshot = Pick<UiResponse<'expenses'>, 'expenses' | 'availableMonths'>;

// Una selección invalida la generación anterior antes del debounce. El transporte
// recibe signal, pero también comprobamos identidad por si ya estaba leyendo JSON.
export function createExpenseReader(callbacks: {
  onData: (data: ExpenseSnapshot) => void;
  onInvalidate: () => void;
  onLoading: (loading: boolean) => void;
  onError: (message: string) => void;
}) {
  type Read = { controller: AbortController; promise: Promise<void> | null };
  let selected: ExpensesUrl | null = null;
  let loaded: ExpensesUrl | null = null;
  let requested = false;
  let current: Read | null = null;

  return {
    select(url: ExpensesUrl | null) {
      if (selected === url) return;
      current?.controller.abort();
      current = null;
      selected = url;
      loaded = null;
      requested = false;
      if (url) {
        callbacks.onInvalidate();
        callbacks.onError('');
        callbacks.onLoading(true);
      }
    },
    prime(url: ExpensesUrl, data: ExpenseSnapshot) {
      // Bootstrap (también offline) nunca sustituye una lectura más reciente.
      if (selected !== url || requested) return;
      callbacks.onData(data);
      loaded = url;
      callbacks.onLoading(false);
    },
    load(owner: string, { force = false, errorMode = 'dialog', mutationCompleted = false }: ReadOptions = {}): Promise<void> {
      // Las operaciones que terminan después de cambiar filtros leen la URL actual.
      const url = selected;
      if (!url || new URL(url, 'http://localhost').searchParams.get('userId') !== owner) return Promise.resolve();
      if (!force && current) return current.promise!;
      if (!force && loaded === url) return Promise.resolve();

      current?.controller.abort();
      const read: Read = { controller: new AbortController(), promise: null };
      current = read;
      requested = true;
      loaded = null;
      const isCurrent = () => current === read && selected === url && !read.controller.signal.aborted;
      callbacks.onLoading(true);
      callbacks.onError('');
      read.promise = (async () => {
        try {
          const response = await uiFetch(url, {
            signal: read.controller.signal, expectedUserId: owner, mutationCompleted,
            errorMode: typeof navigator !== 'undefined' && !navigator.onLine ? 'inline' : errorMode,
          });
          const data = await response.json();
          if (!isCurrent()) return;
          if (!response.ok) throw new Error(data.error || 'No se pudieron cargar gastos.');
          callbacks.onData(data);
          loaded = url;
        } catch (cause) {
          if (!isCurrent()) return;
          callbacks.onError(errorMessage(cause) || 'No se pudieron cargar gastos.');
          throw cause;
        } finally {
          if (isCurrent()) {
            current = null;
            callbacks.onLoading(false);
          }
        }
      })();
      return read.promise;
    },
  };
}
