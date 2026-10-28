// Un solo diálogo agrupa los fallos concurrentes. Las promesas conservan la
// interacción original; reintentar una lectura nunca vuelve a enviar un alta.
import { RequestError } from './requestErrors';
interface Pending { error: RequestError; retry: () => Promise<unknown>; resolve: (value: unknown) => void; reject: (reason: unknown) => void; signal?: AbortSignal | null; busy: boolean; retryFailed?: boolean; abort: () => void }
interface Snapshot { items: RequestError[]; busy: boolean; retryFailed: boolean }
const listeners = new Set<() => void>();
const pending = new Set<Pending>();
const emptySnapshot: Snapshot = { items: [], busy: false, retryFailed: false };
let snapshot = emptySnapshot;
let scope = 0;

function publish() {
  snapshot = pending.size ? {
    items: [...pending].map(({ error }) => error),
    busy: [...pending].some((item) => item.busy),
    retryFailed: [...pending].some((item) => item.retryFailed),
  } : emptySnapshot;
  listeners.forEach((listener) => listener());
}

function finish(item: Pending, error?: unknown, result?: unknown) {
  if (!pending.delete(item)) return;
  item.signal?.removeEventListener("abort", item.abort);
  if (error) item.reject(error);
  else item.resolve(result);
  publish();
}

export function subscribeRecovery(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getRecoverySnapshot() {
  return snapshot;
}

export function getServerRecoverySnapshot() {
  return emptySnapshot;
}

export function getRecoveryScope() {
  return scope;
}

export function dismissRecovery() {
  // Durante un reintento hay una petición real en curso.
  for (const item of pending) {
    if (!item.busy) finish(item, item.error);
  }
}

export function resetRecovery() {
  scope += 1;
  for (const item of pending) finish(item, item.error);
}

export function recoverRequest<T>(error: RequestError, retry: () => Promise<T>, { signal, requestScope = scope }: { signal?: AbortSignal | null; requestScope?: number } = {}): Promise<T> {
  if (!listeners.size || requestScope !== scope || signal?.aborted) return Promise.reject(error);
  return new Promise<T>((resolve, reject) => {
    const item: Pending = { error, retry, resolve: value => resolve(value as T), reject, signal, busy: false, abort: () => finish(item, signal?.reason || error) };
    pending.add(item);
    signal?.addEventListener("abort", item.abort, { once: true });
    publish();
  });
}

export async function retryRecovery() {
  const batch = [...pending].filter((item) => !item.busy && item.error.retryable &&
    (!item.error.retryAt || item.error.retryAt <= Date.now()));
  // Bloquear antes de publicar impide dobles clics y envíos simultáneos.
  batch.forEach((item) => { item.busy = true; });
  publish();
  await Promise.all(batch.map(async (item) => {
    try {
      const result = await item.retry();
      finish(item, null, result);
    } catch (error) {
      if (!pending.has(item)) return;
      item.error = error instanceof RequestError ? error : new RequestError(error instanceof Error ? error.message : String(error));
      item.busy = false;
      item.retryFailed = true;
      publish();
    }
  }));
}
