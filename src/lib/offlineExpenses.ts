import { isRecord } from './financialJson';
import { readOfflineEntry, readLegacyEntries, isOfflineChange } from './offlineExpenseContracts';
import type { OfflineExpense, OfflineSyncResult, OfflineChange, SyncedOfflineExpense } from './offlineExpenseContracts';
import type { ExpenseCommand } from './financialContracts';
import type { ApiFetchOptions } from './apiFetch';
import { apiFetch } from "@/lib/apiFetch";

const STORAGE_PREFIX = "afp:offline-expenses:";
const DATABASE = "afp-offline-expenses";
const CHANGE_EVENT = "afp:offline-expenses-changed";
let databasePromise: Promise<IDBDatabase> | undefined;
const localSyncs = new Map<string, Promise<unknown>>();

function openDatabase() {
  if (!databasePromise) {
    databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error("No se pudo abrir el almacenamiento local. El gasto no se ha enviado; conserva el formulario."));
        return;
      }
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        const queue = db.createObjectStore("expenses", { keyPath: ["userId", "clientId"] });
        queue.createIndex("userId", "userId");
        db.createObjectStore("legacyImports", { keyPath: ["userId", "clientId"] });
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Cierra las otras pestañas para abrir el almacenamiento de pendientes."));
      request.onsuccess = () => {
        request.result.onversionchange = () => { request.result.close(); databasePromise = undefined; };
        resolve(request.result);
      };
    }).catch(error => { databasePromise = undefined; throw error; });
  }
  return databasePromise;
}

// Confirma al completar la transacción, nunca solo una petición individual.
async function transaction<T = void>(stores: string[], mode: IDBTransactionMode, run: (tx: IDBTransaction, done: (value: T) => void) => void): Promise<T> {
  const db = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(stores, mode, { durability: "strict" });
    let result: T;
    tx.oncomplete = () => resolve(result!);
    tx.onabort = () => reject(tx.error || new Error("No se pudo guardar el pendiente en este dispositivo."));
    try { run(tx, value => { result = value; }); }
    catch (error) { tx.abort(); reject(error); }
  });
}

function notifyChanges(userId: string, confirmed = false) {
  // Una notificación fallida no convierte una escritura confirmada en un error de alta.
  try {
    const change = { userId, confirmed };
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: change }));
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(CHANGE_EVENT);
      channel.postMessage(change);
      channel.close();
    }
  } catch { /* La siguiente lectura/foco recupera el estado confirmado. */ }
}

export function subscribeOfflineExpenses(userId: string, listener: (change?: OfflineChange) => void) {
  const onLocal = (event: Event) => { const detail: unknown = 'detail' in event ? event.detail : undefined; if (isOfflineChange(detail) && detail.userId === userId) listener(detail); };
  const onFocus = () => listener();
  window.addEventListener(CHANGE_EVENT, onLocal);
  window.addEventListener("focus", onFocus);
  const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANGE_EVENT) : null;
  if (channel) channel.onmessage = event => { const data: unknown = event.data; if (isOfflineChange(data) && data.userId === userId) listener(data); };
  return () => {
    window.removeEventListener(CHANGE_EVENT, onLocal);
    window.removeEventListener("focus", onFocus);
    channel?.close();
  };
}

async function migrateLegacyExpenses(userId: string) {
  // La copia antigua se conserva. Marcador y alta se confirman juntos por entrada.
  // Dos pestañas o una recarga no reimportan gastos ya sincronizados.
  const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${userId}`);
  if (!raw) return;
  let entries: unknown;
  try { entries = JSON.parse(raw); } catch { throw new Error("La cola anterior no se puede leer. Se conserva para recuperarla."); }
  const legacy = readLegacyEntries(entries);
  await transaction(["expenses", "legacyImports"], "readwrite", tx => {
    for (const entry of legacy) {
      const imports = tx.objectStore("legacyImports");
      const request = imports.get([userId, entry.clientId]);
      request.onsuccess = () => {
        if (request.result) return;
        const operationId = crypto.randomUUID();
        tx.objectStore("expenses").add({ ...entry, userId, clientId: operationId,
          payload: { ...entry.payload, operationId } });
        imports.add({ userId, clientId: entry.clientId, operationId });
      };
    }
  });
}

export async function readOfflineExpenses(userId: string | null | undefined): Promise<OfflineExpense[]> {
  if (!userId) return [];
  await migrateLegacyExpenses(userId);
  return transaction<OfflineExpense[]>(["expenses"], "readonly", (tx, done) => {
    const request = tx.objectStore("expenses").index("userId").getAll(userId);
    request.onsuccess = () => {
      const stored: unknown = request.result;
      if (!Array.isArray(stored)) throw new Error("No se pudo leer la cola local.");
      done((stored as unknown[]).map(readOfflineEntry).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    };
  });
}

export async function addOfflineExpense<P extends ExpenseCommand>(userId: string, payload: P) {
  if (!userId) throw new Error("Inicia sesión para guardar el pendiente.");
  const operationId = crypto.randomUUID();
  const expense = { userId, clientId: operationId, createdAt: new Date().toISOString(),
    payload: { ...payload, operationId } };
  await transaction(["expenses"], "readwrite", tx => { tx.objectStore("expenses").add(expense); });
  notifyChanges(userId);
  return expense;
}

async function settleExpense(userId: string, clientId: string, error?: string, status?: number) {
  await transaction(["expenses"], "readwrite", tx => {
    const store = tx.objectStore("expenses");
    if (!error) { store.delete([userId, clientId]); return; }
    const request = store.get([userId, clientId]);
    request.onsuccess = () => {
      // Un fallo tardío de otra pestaña nunca resucita una entrada confirmada.
      const stored: unknown = request.result;
      if (stored) store.put({ ...readOfflineEntry(stored), lastError: error, lastStatus: status || null });
    };
  });
  notifyChanges(userId, !error);
}

async function synchronize(userId: string, onlyClientId: string | undefined, errorMode: ApiFetchOptions['errorMode']): Promise<OfflineSyncResult> {
  const queued = await readOfflineExpenses(userId);
  const syncedExpenses: SyncedOfflineExpense[] = [];
  const confirmations = [];
  for (const entry of queued.filter(row => !onlyClientId || row.clientId === onlyClientId)) {
    try {
      const response = await apiFetch("/api/expenses", {
        errorMode,
        recoveryHint: "Tu gasto está guardado aquí, pendiente de enviar.",
        method: "POST", expectedUserId: userId,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry.payload),
      });
      const raw: unknown = await response.json();
      const data = isRecord(raw) ? raw : {};
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "No se pudo sincronizar el gasto.");
      if (!isRecord(data.expense) || typeof data.expense.id !== "string" || !data.expense.id) throw new Error("No se recibió la confirmación del gasto. Se reintentará con la misma operación.");
      await settleExpense(userId, entry.clientId);
      syncedExpenses.push({ ...data.expense, id: data.expense.id });
      confirmations.push({ clientId: entry.clientId, alreadyConfirmed: Boolean(data.alreadyConfirmed) });
    } catch (error) {
      await settleExpense(userId, entry.clientId, isRecord(error) && typeof error.message === "string" && error.message ? error.message : "Sin conexión. Se reintentará al volver internet.", isRecord(error) && typeof error.status === "number" ? error.status : undefined);
    }
  }
  return { syncedExpenses, confirmations, failedExpenses: await readOfflineExpenses(userId) };
}

export async function syncOfflineExpenses(userId: string, { onlyClientId, errorMode = "inline" }: { onlyClientId?: string; errorMode?: ApiFetchOptions['errorMode'] } = {}): Promise<OfflineSyncResult> {
  const run = () => synchronize(userId, onlyClientId, errorMode);
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request(`${DATABASE}:${userId}`, run);
  }
  // Sin Web Locks: serialización local; el recibo protege entre pestañas.
  const previous = localSyncs.get(userId) || Promise.resolve();
  const current = previous.catch(() => {}).then(run);
  localSyncs.set(userId, current);
  try { return await current; }
  finally { if (localSyncs.get(userId) === current) localSyncs.delete(userId); }
}

export async function resolveOfflineCapture(userId: string, clientId: string, distinct: boolean) {
  if (!userId) throw new Error("Inicia sesión para resolver el pendiente.");
  const run = async () => {
    await transaction(["expenses"], "readwrite", tx => {
      const store = tx.objectStore("expenses");
      const request = store.get([userId, clientId]);
      request.onsuccess = () => {
        const stored: unknown = request.result;
        const row = stored ? readOfflineEntry(stored) : undefined;
        if (!row || row.lastStatus !== 409 || !row.lastError?.includes("captura por conciliar")) return;
        if (distinct) store.put({ ...row, payload: { ...row.payload, confirmDistinctCapture: true }, lastError: "", lastStatus: null });
        else store.delete([userId, clientId]);
      };
    });
    notifyChanges(userId);
  };
  if (typeof navigator !== "undefined" && navigator.locks) return navigator.locks.request(`${DATABASE}:${userId}`, run);
  const previous = localSyncs.get(userId) || Promise.resolve();
  const current = previous.catch(() => {}).then(run); localSyncs.set(userId, current);
  try { return await current; } finally { if (localSyncs.get(userId) === current) localSyncs.delete(userId); }
}
