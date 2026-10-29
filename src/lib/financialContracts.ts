import { z } from 'zod';
import { ApiAccessError } from './apiAuth';
import { isRecord } from './financialJson';
import { calendarDaySchema, isCalendarDay, moneyInputSchema, requiredTextSchema } from './financialValidation';
const text = z.string().nullish();
const money = z.union([z.string(), z.number()]).nullish();
const optionalMoney = z.union([moneyInputSchema, z.literal('')]).nullish();
const optionalDay = z.union([calendarDaySchema, z.literal('')]).nullish();
// Deactivation historically accepts both a civil day and the UI's ISO instant.
const deactivation = z.string().refine(value => value === ''
  || (isCalendarDay(value.slice(0, 10)) && z.iso.datetime({ offset: true }).safeParse(value).success) || isCalendarDay(value),
  'Indica una fecha de desactivación válida.').nullish();
// Fields remain optional for partial actions. Semantic checks do not transform
// values or strip unknown fields; handlers enforce requiredness and business rules.
export const financialInputSchema = z.looseObject({
  id: text, userId: z.unknown().optional(), operationId: z.unknown().optional(), action: text, type: text,
  name: requiredTextSchema('El nombre').nullish(), concept: requiredTextSchema('El concepto').nullish(),
  notes: text, source: requiredTextSchema('La fuente').nullish(), email: text,
  cardId: text, debitAccountId: text, categoryId: text, personId: text,
  incomeTypeId: text, receivableAccountId: text, payableAccountId: text, subscriptionId: text,
  date: optionalDay, startDate: optionalDay, cutDate: optionalDay, dueDate: optionalDay, originDate: optionalDay, expectedDate: optionalDay,
  purchaseDate: optionalDay, deactivatedAt: deactivation, paidAt: optionalDay, postCutCreditDate: optionalDay,
  amount: optionalMoney, originalAmount: optionalMoney, totalAmount: optionalMoney, expectedMonthlyPayment: optionalMoney,
  statementAmount: optionalMoney, paidAmount: optionalMoney, postCutCreditAmount: optionalMoney, cashContributionAmount: optionalMoney,
  manualMonthlyPayment: optionalMoney, months: money, initialPaymentsMade: money, chargeDay: money,
  usualCutDay: money, usualDueDay: money, startMonth: money, startYear: money, frequencyMonths: money,
  paymentMethod: text, postCutCreditNotes: text, balanceCaptureId: text, expectedBalanceCaptureId: text,
  toggleActive: z.unknown().optional(), isActive: z.boolean().nullish(), createReceivable: z.unknown().optional(), confirmDistinctCapture: z.unknown().optional(),
  expectedChargeDays: z.unknown().optional(), today: optionalDay, month: text, noticeKey: text,
});
export type FinancialInput = z.output<typeof financialInputSchema>;
export function readFinancialInput(value: unknown): FinancialInput {
  // Preserve the ID validation previously performed before field validation.
  if (!isRecord(value)) throw new ApiAccessError('Datos no válidos.', 400);
  if (value.id !== undefined && (typeof value.id !== 'string' || !value.id)) throw new ApiAccessError('ID no válido.', 400);
  const result = financialInputSchema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new ApiAccessError(issue?.code === 'custom' ? issue.message : 'Datos no válidos.', 400);
  }
  // Zod visits declared fields in schema order. Keep the HTTP key order too.
  return Object.assign({}, value, result.data);
}
export function isPrismaError(error: unknown): error is { code: string } {
  return isRecord(error) && typeof error.code === 'string';
}
const expenseBase = z.object({ date: calendarDaySchema, concept: requiredTextSchema('El concepto'),
  amount: moneyInputSchema.refine(value => Number(value) > 0, 'El monto debe ser mayor a 0.'), categoryId: z.string() });
export const expenseCommandSchema = z.discriminatedUnion('paymentMethod', [
  expenseBase.extend({ paymentMethod: z.literal('CASH'), cardId: z.null().optional(), debitAccountId: z.null().optional() }),
  expenseBase.extend({ paymentMethod: z.literal('CARD'), cardId: z.string(), debitAccountId: z.null().optional() }),
  expenseBase.extend({ paymentMethod: z.literal('DEBIT'), debitAccountId: z.string(), cardId: z.null().optional() }),
]);
export type ExpenseCommand = z.output<typeof expenseCommandSchema>;
export type DebtCommand = { kind: 'receivable'; personId: string; concept: string; originalAmount: number; originDate: string; expectedChargeDays: number[] }
  | { kind: 'payable'; personId: string; concept: string; originalAmount: number; originDate: string; expectedDate: string | null };
export type CollectionCommand = { kind: 'income'; incomeTypeId: string; source: string; amount: number; date: string; concept: string; receivableAccountId: string | null };
