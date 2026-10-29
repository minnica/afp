import { closeLocalData, reopenLocalData, clearSyncedFinancialData } from "./localFinancialData";
import { backupOfflineExpenses, clearMigratedLegacyExpenses, hasOfflineData, removeOfflineExpenses, withOfflineExpenseLock } from "./offlineExpenses";
import type { OfflineExpenseBackup } from "./offlineExpenses";

// El listener Auth de esta pestaña deja que el coordinador termine la limpieza.
export let localLogoutRunning = false;

export async function logoutWithLocalData({ userId, keepPending, exported, signOut }: {
  userId: string;
  keepPending: boolean;
  exported: OfflineExpenseBackup | null;
  signOut: () => Promise<void>;
}) {
  if (localLogoutRunning) throw new Error("Ya se está cerrando la sesión.");
  localLogoutRunning = true;
  let signedOut = false;
  try {
    closeLocalData(userId);
    await withOfflineExpenseLock(userId, async () => {
      const current = await backupOfflineExpenses(userId);
      if (!keepPending && hasOfflineData(current) && JSON.stringify(current) !== JSON.stringify(exported)) {
        throw new Error("Hay pendientes sin respaldar o cambiaron desde la exportación. Sincronízalos, exporta una copia actual o consérvalos en un dispositivo de confianza.");
      }
      await clearSyncedFinancialData(userId);
      await signOut();
      signedOut = true;
      if (!keepPending) await removeOfflineExpenses(userId, current);
      else clearMigratedLegacyExpenses(current);
    });
  } catch (error) {
    // Si Auth falla, no se elimina la cola. Si ya cerró, la limpieza se puede
    // reintentar desde el diálogo; no se reactiva una sesión terminada.
    if (!signedOut) reopenLocalData(userId);
    throw error;
  } finally {
    localLogoutRunning = false;
  }
}
