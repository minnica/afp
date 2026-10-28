import { addOfflineExpense, syncOfflineExpenses, subscribeOfflineExpenses } from '@/lib/offlineExpenses';
import { observeOfflineExpenses } from '@/lib/offlineExpenseObserver';

export const queued = addOfflineExpense('owner', { date: '2026-10-28', concept: 'Compra', amount: '1.25', paymentMethod: 'CASH', categoryId: 'c' });
// @ts-expect-error La captura nueva con débito necesita su cuenta de salida.
void addOfflineExpense('owner', { date: '2026-10-28', concept: 'Compra', amount: '1.25', paymentMethod: 'DEBIT', categoryId: 'c' });
// @ts-expect-error La sincronización de una cuenta requiere un ID de usuario textual.
void syncOfflineExpenses(12);
// @ts-expect-error El modo de recuperación conserva los valores del cliente HTTP.
void syncOfflineExpenses('owner', { errorMode: 'automatic' });
export const stop = subscribeOfflineExpenses('owner', change => {
  // @ts-expect-error Foco también refresca sin una notificación de confirmación.
  const confirmed: boolean = change.confirmed;
  void confirmed;
});
export const observer = observeOfflineExpenses({ userId: 'owner', onPending: rows => {
  // @ts-expect-error La cola histórica puede contener valores parciales por validar.
  const amount: number = rows[0]!.payload.amount;
  void amount;
}, onConfirmed: async () => {}, onError: message => { void message; } });
