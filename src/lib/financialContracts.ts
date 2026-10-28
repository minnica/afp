import { z } from 'zod';
import { ApiAccessError } from './apiAuth';
import { isRecord } from './financialJson';
const text = z.string().nullish();
const money = z.union([z.string(), z.number()]).nullish();
// Raw HTTP fields are optional: each handler retains its existing ordered
// business validations and messages. Parsing neither coerces nor strips data.
export const financialInputSchema = z.looseObject({
  id: text, userId: z.unknown().optional(), operationId: z.unknown().optional(), action: text, type: text,
  name: text, concept: text, notes: text, source: text, email: text,
  cardId: text, debitAccountId: text, categoryId: text, personId: text,
  incomeTypeId: text, receivableAccountId: text, payableAccountId: text, subscriptionId: text,
  date: text, startDate: text, cutDate: text, dueDate: text, originDate: text, expectedDate: text,
  purchaseDate: text, deactivatedAt: text, paidAt: text, postCutCreditDate: text,
  amount: money, originalAmount: money, totalAmount: money, expectedMonthlyPayment: money,
  statementAmount: money, paidAmount: money, postCutCreditAmount: money, cashContributionAmount: money,
  manualMonthlyPayment: money, months: money, initialPaymentsMade: money, chargeDay: money,
  usualCutDay: money, usualDueDay: money, startMonth: money, startYear: money, frequencyMonths: money,
  paymentMethod: text, postCutCreditNotes: text, balanceCaptureId: text, expectedBalanceCaptureId: text,
  toggleActive: z.unknown().optional(), isActive: z.boolean().nullish(), createReceivable: z.unknown().optional(), confirmDistinctCapture: z.unknown().optional(),
  expectedChargeDays: z.unknown().optional(), today: text, month: text, noticeKey: text,
});
export type FinancialInput = z.output<typeof financialInputSchema>;
export function readFinancialInput(value: unknown): FinancialInput {
  // Preserve the ID validation previously performed before field validation.
  if (!isRecord(value)) throw new ApiAccessError('Datos no válidos.', 400);
  if (value.id !== undefined && (typeof value.id !== 'string' || !value.id)) throw new ApiAccessError('ID no válido.', 400);
  const result = financialInputSchema.safeParse(value);
  if (!result.success) throw new ApiAccessError('Datos no válidos.', 400);
  return result.data;
}
export function isPrismaError(error: unknown): error is { code: string } {
  return isRecord(error) && typeof error.code === 'string';
}
const expenseBase = z.object({ date: z.string(), concept: z.string(), amount: z.union([z.string(), z.number()]), categoryId: z.string() });
export const expenseCommandSchema = z.discriminatedUnion('paymentMethod', [
  expenseBase.extend({ paymentMethod: z.literal('CASH'), cardId: z.null().optional(), debitAccountId: z.null().optional() }),
  expenseBase.extend({ paymentMethod: z.literal('CARD'), cardId: z.string(), debitAccountId: z.null().optional() }),
  expenseBase.extend({ paymentMethod: z.literal('DEBIT'), debitAccountId: z.string(), cardId: z.null().optional() }),
]);
export type ExpenseCommand = z.output<typeof expenseCommandSchema>;
export type DebtCommand = { kind: 'receivable'; personId: string; concept: string; originalAmount: number; originDate: string; expectedChargeDays: number[] }
  | { kind: 'payable'; personId: string; concept: string; originalAmount: number; originDate: string; expectedDate: string | null };
export type CollectionCommand = { kind: 'income'; incomeTypeId: string; source: string; amount: number; date: string; concept: string; receivableAccountId: string | null };
