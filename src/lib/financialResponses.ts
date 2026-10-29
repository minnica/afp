import { z } from 'zod';
export const monetarySchema = z.union([z.string(), z.number()]);
const id = z.string();
const named = z.object({ id, name: z.string() }).passthrough();
const dated = z.object({ id, date: z.string(), amount: monetarySchema }).passthrough();
export const expenseResponseSchema = dated.extend({ concept: z.string(), paymentMethod: z.enum(['CASH', 'CARD', 'DEBIT']), cardId: id.nullable(), debitAccountId: id.nullable().optional(), categoryId: id, cashContributionAmount: monetarySchema.optional() });
export const incomeResponseSchema = dated.extend({ concept: z.string(), source: z.string(), incomeTypeId: id, receivableAccountId: id.nullable() });
export const cardResponseSchema = named.extend({ usualCutDay: z.number(), usualDueDay: z.number(), creditLimit: monetarySchema.nullable().optional(), usedBalance: monetarySchema.nullable().optional(), balanceAsOf: z.string().nullable().optional() });
export const cycleResponseSchema = z.object({ id, cardId: id, year: z.number(), month: z.number(), startDate: z.string(), cutDate: z.string(), dueDate: z.string(), statementAmount: monetarySchema.nullable(), paidAmount: monetarySchema.nullable(), postCutCreditAmount: monetarySchema,
  paymentStatus: z.enum(['UNCONFIRMED', 'NO_PAYMENT_DUE', 'PAID', 'PARTIALLY_PAID', 'PENDING']), paymentDueAmount: z.number().nullable(), pendingAmount: z.number().nullable(), excessAmount: z.number(), isSettled: z.boolean(), displayStatus: z.enum(['PAID', 'NO_PAYMENT_DUE', 'OVERDUE', 'PARTIALLY_PAID', 'PAYMENT_PENDING', 'CUT', 'OPEN']), calculatedAmount: z.number().optional(),
}).passthrough();
export const subscriptionResponseSchema = named.extend({ amount: monetarySchema, paymentMethod: z.enum(['CASH', 'CARD']), cardId: id.nullable(), categoryId: id, chargeDay: z.number(), frequencyMonths: z.number(), startYear: z.number(), startMonth: z.number(), isActive: z.boolean(), deactivatedAt: z.string().nullable() });
export const purchaseResponseSchema = z.object({ id, concept: z.string(), cardId: id, totalAmount: monetarySchema, months: z.number(), purchaseDate: z.string(), status: z.enum(['ACTIVE', 'PAID_OFF', 'CANCELLED']) }).passthrough();
const debt = z.object({ id, concept: z.string(), personId: id, originalAmount: monetarySchema, originDate: z.string(), paidAmount: z.number(), pendingBalance: z.number(), excessAmount: z.number(), status: z.enum(['ACTIVE', 'PAID_OFF', 'CANCELLED']) }).passthrough();
export const receivableResponseSchema = debt.extend({ balanceAdjustment: monetarySchema, expectedChargeDays: z.array(z.number()), incomes: z.array(dated) });
export const payableResponseSchema = debt.extend({ accountType: z.enum(['SIMPLE', 'LOAN']), currentBalance: monetarySchema.nullable(), dailyExpenses: z.array(dated.omit({ amount: true }).extend({ amount: monetarySchema })), reimbursementReceivable: z.json().nullable().optional() });
const charge = z.object({ id, subscriptionId: id, month: z.string(), name: z.string(), date: z.string(), amount: z.number(), paymentMethod: z.enum(['CASH', 'CARD']), status: z.enum(['CONFIRMED', 'VERIFIED', 'SKIPPED', 'PENDING']), expenseId: id.nullable(), confirmedAmount: z.number().nullable() }).passthrough();
const category = z.object({ id, name: z.string(), total: z.number(), percentage: z.number() });
const weekly = z.object({ prevMonthLabel: z.string(), currMonthLabel: z.string(), prevMonthTotal: z.number(), currMonthTotal: z.number(), weeks: z.array(z.object({ week: z.number(), label: z.string(), startDay: z.number(), endDay: z.number(), prevTotal: z.number(), currTotal: z.number() })) });
const cardComparison = z.object({ prevMonthLabel: z.string(), currMonthLabel: z.string(), data: z.array(z.object({ cardId: id, cardName: z.string(), prevAmount: z.number(), currAmount: z.number(), prevIsStatement: z.boolean(), currIsStatement: z.boolean() }).passthrough()) });
const usage = z.object({ card: named, status: z.string(), isExempt: z.boolean(), minimumAmount: z.number().nullable() }).passthrough();
const notice = z.object({ id, type: z.string(), group: z.string(), title: z.string(), description: z.string(), date: z.string(), amount: z.number() });
const byMonth = <T extends z.ZodType>(schema: T) => z.record(z.string(), schema);
export const dashboardResponseSchema = z.object({
  payments: z.array(z.object({ card: named, previousPayment: cycleResponseSchema.nullish(), currentPayment: cycleResponseSchema.nullish(), nextPayment: cycleResponseSchema.nullish() })), cycles: z.array(cycleResponseSchema),
  monthlySummary: z.object({ incomeTotal: z.number(), dailyExpensesTotal: z.number(), subscriptionsTotal: z.number(), installmentPurchasesTotal: z.number(), monthlyExpenseTotal: z.number(), monthlyDifference: z.number() }),
  categoryBreakdownPrev: z.array(category), categoryBreakdownCurrent: z.array(category), categoryBreakdownNext: z.array(category), categoryBreakdownByMonth: byMonth(z.array(category)),
  weeklyComparisonByMonth: byMonth(weekly), weeklyComparisonByCategoryAndMonth: byMonth(byMonth(weekly)), cardMonthlyComparisonByMonth: byMonth(cardComparison),
  cardUsageWaivers: z.array(usage), cardUsageWaiversByMonth: byMonth(z.array(usage)), cardUsageWaiversCurrent: z.array(usage), cardUsageWaiverHistory: z.array(usage),
  categories: z.array(named), activeReceivables: z.array(receivableResponseSchema), importantNotices: z.array(notice),
});
export const financialReadSchemas = {
  cards: z.object({ cards: z.array(cardResponseSchema) }),
  'card-cycles': z.union([z.object({ cycles: z.array(cycleResponseSchema) }), z.object({ cycle: cycleResponseSchema.nullable() })]),
  expenses: z.object({ expenses: z.array(expenseResponseSchema), total: z.number(), personalTotal: z.number(), availableMonths: z.array(z.string()) }),
  incomes: z.object({ incomes: z.array(incomeResponseSchema), total: z.number() }),
  subscriptions: z.object({ subscriptions: z.array(subscriptionResponseSchema), total: z.number() }),
  'subscription-charges': z.object({ charges: z.array(charge) }),
  'installment-purchases': z.object({ purchases: z.array(purchaseResponseSchema) }),
  receivables: z.object({ receivables: z.array(receivableResponseSchema) }),
  payables: z.object({ payables: z.array(payableResponseSchema) }),
  'gastos/bootstrap': z.object({ categories: z.array(named), people: z.array(named), cards: z.array(cardResponseSchema), expenses: z.array(expenseResponseSchema), availableMonths: z.array(z.string()), receivables: z.array(receivableResponseSchema), payables: z.array(payableResponseSchema), subscriptions: z.array(subscriptionResponseSchema), moneyAccounts: z.array(named) }),
  dashboard: dashboardResponseSchema,
  "dashboard/summary": dashboardResponseSchema.pick({ importantNotices: true, cardUsageWaiversCurrent: true, cardUsageWaiverHistory: true }),
  'notice-dismissals': z.object({ dismissals: z.array(z.object({ month: z.string(), noticeKey: z.string() })) }),
};
export type FinancialResource = keyof typeof financialReadSchemas;
export type FinancialResponse<K extends FinancialResource> = z.output<(typeof financialReadSchemas)[K]>;
const ok = z.object({ ok: z.literal(true) });
export const financialWriteSchemas = {
  cards: z.object({ card: cardResponseSchema }),
  'card-cycles': z.union([z.object({ cycle: cycleResponseSchema }), ok.extend({ cycles: z.array(cycleResponseSchema) })]),
  expenses: z.object({ expense: expenseResponseSchema, alreadyConfirmed: z.boolean().optional() }),
  incomes: z.object({ income: incomeResponseSchema }),
  subscriptions: z.object({ subscription: subscriptionResponseSchema }),
  'subscription-charges': z.union([z.object({ expenseId: id, alreadyConfirmed: z.boolean() }), z.object({ skipped: z.literal(true) }), z.object({ restored: z.literal(true) })]),
  'installment-purchases': z.object({ purchase: purchaseResponseSchema }),
  receivables: z.object({ receivable: receivableResponseSchema }), payables: z.object({ payable: payableResponseSchema }),
  'notice-dismissals': financialReadSchemas['notice-dismissals'],
};
export function validateFinancialResponse(url: string, method: string, value: unknown) {
  const key = new URL(url, 'http://localhost').pathname.slice(5);
  if (method === 'GET') {
    if (key in financialReadSchemas) financialReadSchemas[key as FinancialResource].parse(value);
  } else if (key === 'notice-dismissals') financialReadSchemas['notice-dismissals'].parse(value);
  else if (method === 'DELETE' && key in financialWriteSchemas) ok.parse(value);
  else if (key in financialWriteSchemas) financialWriteSchemas[key as keyof typeof financialWriteSchemas].parse(value);
}
