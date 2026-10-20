// Un solo diálogo agrupa los fallos concurrentes. Las promesas conservan la
// interacción original; reintentar una lectura nunca vuelve a enviar un alta.
const listeners = new Set();
const pending = new Set();
const emptySnapshot = { items: [], busy: false, retryFailed: false };
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

function finish(item, error, result) {
  if (!pending.delete(item)) return;
  item.signal?.removeEventListener("abort", item.abort);
  if (error) item.reject(error);
  else item.resolve(result);
  publish();
}

export function subscribeRecovery(listener) {
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

export function recoverRequest(error, retry, { signal, requestScope = scope } = {}) {
  if (!listeners.size || requestScope !== scope || signal?.aborted) return Promise.reject(error);
  return new Promise((resolve, reject) => {
    const item = { error, retry, resolve, reject, signal, busy: false };
    item.abort = () => finish(item, signal.reason || error);
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
      item.error = error;
      item.busy = false;
      item.retryFailed = true;
      publish();
    }
  }));
}
