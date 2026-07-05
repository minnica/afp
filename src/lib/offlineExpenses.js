const STORAGE_PREFIX = "afp:offline-expenses:";

function getStorageKey(userId) {
  return `${STORAGE_PREFIX}${userId}`;
}

function canUseStorage() {
  return typeof window !== "undefined" && window.localStorage;
}

export function readOfflineExpenses(userId) {
  if (!userId || !canUseStorage()) return [];

  try {
    const rawValue = window.localStorage.getItem(getStorageKey(userId));
    const parsedValue = rawValue ? JSON.parse(rawValue) : [];

    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch {
    return [];
  }
}

function writeOfflineExpenses(userId, expenses) {
  if (!userId || !canUseStorage()) return;

  window.localStorage.setItem(
    getStorageKey(userId),
    JSON.stringify(expenses),
  );
}

export function addOfflineExpense(userId, payload) {
  const offlineExpense = {
    clientId: `offline-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: new Date().toISOString(),
    payload,
  };
  const currentExpenses = readOfflineExpenses(userId);

  writeOfflineExpenses(userId, [offlineExpense, ...currentExpenses]);

  return offlineExpense;
}

export async function syncOfflineExpenses(userId) {
  const queuedExpenses = readOfflineExpenses(userId);
  const syncedExpenses = [];
  const failedExpenses = [];

  for (const queuedExpense of queuedExpenses) {
    try {
      const response = await fetch("/api/expenses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(queuedExpense.payload),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        failedExpenses.push({
          ...queuedExpense,
          lastError: data.error || "No se pudo sincronizar el gasto.",
        });
        continue;
      }

      syncedExpenses.push(data.expense);
    } catch {
      failedExpenses.push({
        ...queuedExpense,
        lastError: "Sin conexión. Se reintentará al volver internet.",
      });
    }
  }

  writeOfflineExpenses(userId, failedExpenses);

  return {
    failedExpenses,
    syncedExpenses,
  };
}
