// Solo metadatos de sesión; no guarda tokens ni importes.
const CLOSED_PREFIX = "afp:local-data-closed:";
const GENERATION_PREFIX = "afp:local-data-generation:";
export const LOCAL_DATA_EVENT = "afp:local-data-changed";

export function isLocalDataClosed(userId: string) {
  return window.localStorage.getItem(`${CLOSED_PREFIX}${userId}`) === "yes";
}

export function localDataGeneration(userId: string) {
  return window.localStorage.getItem(`${GENERATION_PREFIX}${userId}`) || "initial";
}

export function closeLocalData(userId: string) {
  window.localStorage.setItem(`${CLOSED_PREFIX}${userId}`, "yes");
  window.localStorage.setItem(`${GENERATION_PREFIX}${userId}`, crypto.randomUUID());
  window.dispatchEvent(new CustomEvent(LOCAL_DATA_EVENT, { detail: userId }));
}

export function reopenLocalData(userId: string) {
  window.localStorage.removeItem(`${CLOSED_PREFIX}${userId}`);
  window.dispatchEvent(new CustomEvent(LOCAL_DATA_EVENT, { detail: userId }));
}

export function assertLocalDataOpen(userId: string) {
  if (isLocalDataClosed(userId)) throw new Error("La sesión está cerrándose. Conserva la captura e inicia sesión de nuevo.");
}

export function clearFinancialSessionStorage(userId: string) {
  for (let i = window.sessionStorage.length - 1; i >= 0; i--) {
    const key = window.sessionStorage.key(i);
    if (key?.startsWith(`afp:create-draft:v1:${userId}:`) || key?.startsWith(`afp:capture-missing:${userId}:`)) {
      window.sessionStorage.removeItem(key);
    }
  }
}

export async function clearSyncedFinancialData(userId: string) {
  window.localStorage.removeItem(`afp:gastos-bootstrap:${userId}`);
  clearFinancialSessionStorage(userId);
  // Retira copias API de workers antiguos; conserva el shell público de la PWA.
  if ("caches" in window) {
    for (const name of await window.caches.keys()) {
      if (!name.startsWith("afp-")) continue;
      const cache = await window.caches.open(name);
      for (const request of await cache.keys()) {
        if (new URL(request.url).pathname.startsWith("/api/")) await cache.delete(request);
      }
    }
  }
}

export function writeFinancialBootstrap(userId: string, data: unknown, generation: string) {
  if (isLocalDataClosed(userId) || localDataGeneration(userId) !== generation) return;
  window.localStorage.setItem(`afp:gastos-bootstrap:${userId}`, JSON.stringify(data));
}
