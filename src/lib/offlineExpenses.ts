import { isRecord } from './financialJson';
import { readOfflineEntry, readLegacyEntries, isOfflineChange } from './offlineExpenseContracts';
import type { OfflineExpense, OfflineSyncResult, OfflineChange, SyncedOfflineExpense } from './offlineExpenseContracts';
import type { OfflineExpenseDraft } from './offlineExpenseContracts';
import type { ApiFetchOptions } from './apiFetch';
import { apiFetch } from "@/lib/apiFetch";

import { assertLocalDataOpen, isLocalDataClosed } from "./localFinancialData";

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
  if (isLocalDataClosed(userId)) return;
  const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${userId}`);
  if (!raw) return;
  let entries: unknown;
  try { entries = JSON.parse(raw); } catch { throw new Error("La cola anterior no se puede leer. Se conserva para recuperarla."); }
  const legacy = readLegacyEntries(entries);
  await transaction(["expenses", "legacyImports"], "readwrite", tx => {
    if (isLocalDataClosed(userId)) return;
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
      try { done((stored as unknown[]).map(readOfflineEntry).sort((a, b) => b.createdAt.localeCompare(a.createdAt))); }
      catch { tx.abort(); }
    };
  });
}

export async function addOfflineExpense<P extends OfflineExpenseDraft>(userId: string, payload: P) {
  if (!userId) throw new Error("Inicia sesión para guardar el pendiente.");
  const operationId = crypto.randomUUID();
  const expense = { userId, clientId: operationId, createdAt: new Date().toISOString(),
    payload: { ...payload, operationId } };
  await transaction(["expenses"], "readwrite", tx => { assertLocalDataOpen(userId); tx.objectStore("expenses").add(expense); });
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
  return withOfflineExpenseLock(userId, () => {
    assertLocalDataOpen(userId);
    return synchronize(userId, onlyClientId, errorMode);
  });
}

export async function withOfflineExpenseLock<T>(userId: string, run: () => Promise<T>): Promise<T> {
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
    assertLocalDataOpen(userId);
    await transaction(["expenses"], "readwrite", tx => {
      assertLocalDataOpen(userId);
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

export interface OfflineExpenseBackup {
  format: "afp-offline-expenses";
  version: 1;
  userId: string;
  expenses: unknown[];
  legacyImports: unknown[];
  legacy: string | null;
}

// Incluye datos sin normalizar: incluso una cola dañada se puede rescatar.
export async function backupOfflineExpenses(userId: string): Promise<OfflineExpenseBackup> {
  const legacy = window.localStorage.getItem(`${STORAGE_PREFIX}${userId}`) ?? null;
  return transaction<OfflineExpenseBackup>(["expenses", "legacyImports"], "readonly", (tx, done) => {
    const expenses = tx.objectStore("expenses").index("userId").getAll(userId);
    const imports = tx.objectStore("legacyImports").getAll();
    imports.onsuccess = () => {
      const entries: unknown[] = imports.result;
      done({ format: "afp-offline-expenses", version: 1, userId, expenses: expenses.result,
        legacyImports: entries.filter(row => isRecord(row) && row.userId === userId), legacy });
    };
  });
}

export function hasOfflineData(backup: OfflineExpenseBackup) {
  if (backup.expenses.length > 0) return true;
  if (backup.legacy === null) return false;
  try {
    const parsed: unknown = JSON.parse(backup.legacy);
    const legacy = readLegacyEntries(parsed);
    return legacy.some(entry => !backup.legacyImports.some(marker => isRecord(marker) && marker.clientId === entry.clientId));
  } catch { return true; }
}

export async function removeOfflineExpenses(userId: string, expected: OfflineExpenseBackup) {
  if (expected.userId !== userId) throw new Error("El respaldo pertenece a otra cuenta.");
  if ((window.localStorage.getItem(`${STORAGE_PREFIX}${userId}`) ?? null) !== expected.legacy) {
    throw new Error("La cola anterior cambió. Exporta una copia actual antes de salir.");
  }
  await transaction(["expenses", "legacyImports"], "readwrite", tx => {
    const expenses = tx.objectStore("expenses").index("userId").getAll(userId);
    const imports = tx.objectStore("legacyImports").getAll();
    imports.onsuccess = () => {
      const rows: unknown[] = imports.result;
      const current = { ...expected, expenses: expenses.result,
        legacyImports: rows.filter(row => isRecord(row) && row.userId === userId) };
      if (JSON.stringify(current) !== JSON.stringify(expected)) { tx.abort(); return; }
      for (const name of ["expenses", "legacyImports"]) {
        const request = tx.objectStore(name).openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          const row: unknown = cursor.value;
          if (isRecord(row) && row.userId === userId) cursor.delete();
          cursor.continue();
        };
      }
    };
  });
  window.localStorage.removeItem(`${STORAGE_PREFIX}${userId}`);
  notifyChanges(userId);
}

export async function restoreOfflineExpenses(userId: string, value: unknown) {
  if (!isRecord(value) || value.format !== "afp-offline-expenses" || value.version !== 1 || value.userId !== userId
    || !Array.isArray(value.expenses) || !Array.isArray(value.legacyImports)
    || (value.legacy !== null && typeof value.legacy !== "string")) {
    throw new Error("El respaldo no es válido o pertenece a otra cuenta. Inicia sesión con la cuenta que lo exportó.");
  }
  const expenses: unknown[] = value.expenses, imports: unknown[] = value.legacyImports;
  // No reasigna propietarios, cuerpos ni UUID. No sobrescribe una captura local.
  for (const row of expenses) {
    const entry = readOfflineEntry(row);
    if (entry.userId !== userId || entry.payload.operationId !== entry.clientId) throw new Error("El respaldo contiene una operación no válida.");
  }
  for (const row of imports) {
    if (!isRecord(row) || row.userId !== userId || !["string", "number"].includes(typeof row.clientId)
      || typeof row.operationId !== "string") throw new Error("El respaldo contiene una referencia no válida.");
  }
  const legacy = value.legacy;
  // Copias antiguas sanas ya se migran antes de exportar; las dañadas se
  // conservan literalmente y requieren revisión antes de sincronizar.
  return withOfflineExpenseLock(userId, async () => {
    assertLocalDataOpen(userId);
    const currentLegacy = window.localStorage.getItem(`${STORAGE_PREFIX}${userId}`) ?? null;
    if (legacy !== null && currentLegacy !== null && currentLegacy !== legacy) throw new Error("Ya existe otra cola anterior en este dispositivo. Consérvala antes de restaurar.");
    await transaction(["expenses", "legacyImports"], "readwrite", tx => {
      assertLocalDataOpen(userId);
      for (const [name, rows] of [["expenses", expenses], ["legacyImports", imports]] as const) {
        const store = tx.objectStore(name);
        for (const row of rows) {
          if (!isRecord(row)) throw new Error("Entrada no válida.");
          const request = store.get([userId, row.clientId as IDBValidKey]);
          request.onsuccess = () => {
            const existing: unknown = request.result;
            if (!existing) store.add(row);
            else {
              const same = name === "expenses" && isRecord(existing)
                ? JSON.stringify(existing.payload) === JSON.stringify(row.payload)
                : JSON.stringify(existing) === JSON.stringify(row);
              if (!same) tx.abort();
            }
          };
        }
      }
    });
    assertLocalDataOpen(userId);
    if (legacy !== null) window.localStorage.setItem(`${STORAGE_PREFIX}${userId}`, legacy);
    notifyChanges(userId);
    return expenses.length;
  });
}

// Después de migrar correctamente, el respaldo legado es redundante: la cola
// durable y sus marcadores ya conservan los pendientes y evitan reimportarlos.
export function clearMigratedLegacyExpenses(backup: OfflineExpenseBackup) {
  if (backup.legacy === null) return;
  let migrated: boolean;
  try {
    const parsed: unknown = JSON.parse(backup.legacy);
    const legacy = readLegacyEntries(parsed);
    migrated = legacy.every(entry => backup.legacyImports.some(marker => isRecord(marker) && marker.clientId === entry.clientId));
  } catch { return; } // Una copia ilegible solo se elimina después de exportarla.
  // Un fallo al limpiar no se confunde con una copia ilegible: llega al diálogo
  // aunque Auth ya haya terminado, para permitir reintentar la limpieza.
  if (migrated) window.localStorage.removeItem(`${STORAGE_PREFIX}${backup.userId}`);
}
