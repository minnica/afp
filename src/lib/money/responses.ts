import { z } from 'zod';
import { baselineSchema, paymentMixSchema, yieldHistoryEntrySchema } from './persisted';
const monetary = z.union([z.string(), z.number()]);
const nullableId = z.string().nullable();
const named = z.object({ id: z.string(), name: z.string() }).passthrough();
export const accountResponseSchema = named.extend({
  kind: z.enum(['BANK', 'SAVINGS', 'CASH']), version: z.number(), openingBalance: monetary, asOf: z.string(), baseline: baselineSchema,
  reservedAmount: monetary, annualYield: monetary, yieldTaxPercent: monetary, yieldBasis: z.number(),
  yieldFrequency: z.string(), yieldPayDay: z.number(), yieldCap: monetary.nullable(), yieldStartDate: nullableId, yieldEndDate: nullableId,
  yieldIncomeTypeId: nullableId, autoYield: z.boolean(), yieldMethod: z.enum(['NOMINAL', 'DAILY_AMOUNT']), yieldDailyAmount: monetary.nullable(),
  yieldExcessRate: monetary, yieldPayout: z.enum(['DAILY', 'MX_BUSINESS']), yieldRounding: z.enum(['ROUND', 'DOWN']), yieldInitialPendingDays: z.number().nullable(),
  yieldHistory: z.array(yieldHistoryEntrySchema), reconciliations: z.array(z.object({ id: z.string(), date: z.string(), previousBalance: monetary, bankBalance: monetary, reason: z.string(), snapshot: z.json() }).passthrough()),
  balance: z.number(), available: z.number(), delta: z.number(), calculatedYield: z.number(), recordedBalance: z.number(), pendingYield: z.number(),
});
export const planResponseSchema = named.extend({
  kind: z.enum(['PAYROLL', 'INCOME', 'EXPENSE', 'VARIABLE']), amount: monetary, accountId: z.string(), cardId: nullableId, incomeTypeId: nullableId, categoryId: nullableId,
  startDate: z.string(), endDate: nullableId, frequencyMonths: z.number(), days: z.array(z.number()), payrollBusinessDays: z.boolean(), paymentMix: paymentMixSchema.nullable(),
  isActive: z.boolean(), version: z.number(), occurrences: z.array(z.object({ id: z.string(), planId: z.string(), date: z.string(), status: z.string() })),
});
const eventSchema = z.object({
  key: z.string(), date: z.string().nullable(), cents: z.number(), amount: z.number(), label: z.string(), kind: z.string(), accountId: nullableId.optional(), excluded: z.boolean().optional(),
  status: z.enum(['ACTUAL', 'CALCULATED', 'REGISTERED_FUTURE', 'EXPECTED', 'ESTIMATED', 'COMMITTED']).optional(),
  planId: nullableId.optional(), occurrenceDate: nullableId.optional(), incomeTypeId: nullableId.optional(), receivableId: nullableId.optional(), payableId: nullableId.optional(), subscriptionId: nullableId.optional(),
  categoryId: nullableId.optional(), cardId: nullableId.optional(), route: z.string().optional(), transferId: z.string().optional(), withdrawalId: z.string().optional(), debitExpenseId: z.string().optional(), ownPaymentId: nullableId.optional(),
  paymentGroup: z.string().optional(), approximateDate: z.boolean().optional(), automaticYield: z.boolean().optional(), originalDate: z.string().optional(), includedInReference: z.boolean().optional(), needsAccount: z.boolean().optional(),
});
export const dailySchema = z.object({ date: z.string(), balance: z.number(), available: z.number(), incoming: z.number(), outgoing: z.number(), accounts: z.record(z.string(), z.number()) });
export const monthlySchema = z.object({ month: z.string(), opening: z.number(), incoming: z.number(), outgoing: z.number(), closing: z.number(), minimum: z.number() });
export const forecastResponseSchema = z.object({
  today: z.string(), end: z.string(), accounts: z.array(accountResponseSchema), actual: z.array(eventSchema), events: z.array(eventSchema.extend({ date: z.string() })),
  daily: z.array(dailySchema), monthly: z.array(monthlySchema),
  planOccurrences: z.array(z.object({ planId: z.string(), date: z.string(), label: z.string(), pending: z.number(), status: z.string(), kind: z.string() })),
  variableBudgets: z.array(z.object({ id: z.string(), categoryId: nullableId, name: z.string(), monthlyAmount: z.number(), recordedAmount: z.number(), pendingConsumption: z.number(), referenceMonths: z.array(z.string()).nullable() })),
  issues: z.array(z.object({ key: z.string(), message: z.string(), scope: z.enum(['HISTORICAL', 'PROJECTION']).optional() })),
  summary: z.object({ balance: z.number(), available: z.number(), reserved: z.number(), minimum: z.number(), minimumDate: z.string(), belowReserveDate: nullableId, zeroDate: nullableId }),
  accountShortfalls: z.array(z.object({ id: z.string(), name: z.string(), date: nullableId })),
});
export const moneyResponseSchema = z.object({
  forecast: forecastResponseSchema, simulated: forecastResponseSchema.nullable(), plans: z.array(planResponseSchema),
  routes: z.array(z.object({ id: z.string(), userId: z.string(), key: z.string(), accountId: nullableId, excluded: z.boolean(), planId: nullableId, occurrenceDate: nullableId })),
  routingOptions: z.array(z.object({ key: z.string(), label: z.string(), forecastOnly: z.boolean().optional(), payrollDefault: z.boolean().optional() })),
  incomeTypes: z.array(named), categories: z.array(named), cards: z.array(named), historyMonths: z.array(z.string()),
  budgetSuggestions: z.array(z.object({ categoryId: z.string(), name: z.string(), amount: z.number(), monthsWithRecords: z.number() })),
  cycles: z.array(z.object({ id: z.string(), cardName: z.string(), month: z.number(), year: z.number(), pending: z.number(), dueDate: z.string() })),
});
export type MoneyResponse = z.output<typeof moneyResponseSchema>;
export type ForecastResponse = z.output<typeof forecastResponseSchema>;
export type AccountResponse = z.output<typeof accountResponseSchema>;
export type PlanResponse = z.output<typeof planResponseSchema>;
export type DisplayEvent = z.output<typeof eventSchema>;
