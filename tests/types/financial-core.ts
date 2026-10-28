import type { ExpenseCommand, DebtCommand, CollectionCommand } from '@/lib/financialContracts';
import type { FinancialResponse } from '@/lib/financialResponses';
import type { ApiFetchOptions } from '@/lib/apiFetch';
import type { Prisma } from '@prisma/client';
import { getCyclePaymentState } from '@/lib/calculations/cardCyclePayments';
import { runDebtAccountOperation } from '@/lib/debtAccountService';
export const cash: ExpenseCommand = { paymentMethod: 'CASH', date: '2026-10-27', concept: 'Comida', amount: '10.25', categoryId: 'c' };
// @ts-expect-error El gasto con tarjeta exige la tarjeta de crédito.
export const missingCard: ExpenseCommand = { ...cash, paymentMethod: 'CARD' };
// @ts-expect-error El débito exige su cuenta y no admite una tarjeta de crédito.
export const wrongDebit: ExpenseCommand = { ...cash, paymentMethod: 'DEBIT', cardId: 'credit' };
// @ts-expect-error Efectivo no tiene cuenta de débito asociada.
export const wrongCash: ExpenseCommand = { ...cash, debitAccountId: 'bank' };
// @ts-expect-error La deuda por cobrar exige días de cobro explícitos.
export const missingDays: DebtCommand = { kind: 'receivable', personId: 'p', concept: 'Cobro', originalAmount: 10, originDate: '2026-10-27' };
// @ts-expect-error El abono de ingreso exige tipo y origen.
export const incompleteCollection: CollectionCommand = { kind: 'income', amount: 10, date: '2026-10-27', concept: 'Abono', receivableAccountId: 'r' };
// @ts-expect-error La validación HTTP recibe unknown; el consumidor debe acotarlo.
export const unsafeValidator: ApiFetchOptions = { validateResponse: (value: { expense: object }) => value.expense };
export function responseContracts(response: FinancialResponse<'expenses'>, debt: FinancialResponse<'payables'>, db: Prisma.TransactionClient) {
  // @ts-expect-error El contrato JSON contiene fechas serializadas.
  const date: Date = response.expenses[0]!.date;
  // @ts-expect-error Los acumulados tipados no son objetos monetarios Prisma.
  const amount: Prisma.Decimal = response.total;
  // @ts-expect-error Solo se pueden distinguir tipos de deuda existentes.
  const kind: 'CREDIT_CARD' = debt.payables[0]!.accountType;
  // @ts-expect-error La operación exterior exige PrismaClient para abrir la transacción.
  void runDebtAccountOperation(db, 'owner', async () => 1);
  void date; void amount; void kind;
}
export const partialPayment = getCyclePaymentState({ cutDate: '2026-10-10', dueDate: '2026-10-25', statementAmount: 100, paidAmount: 30 });
// @ts-expect-error Un importe pendiente puede ser null si falta el estado de cuenta.
export const assumedPending: number = partialPayment.pendingAmount;
