// JSON contracts for the remaining UI flows. Dates cross HTTP as strings;
// amounts accept the historical string/number representations. No server imports.
import { z } from 'zod';
import { financialReadSchemas } from './financialResponses';
import { captureProposalSchema } from './captureJson';

// Known fields of historical JSON are checked without importing server services.
const captureSnapshotSchema = z.object({ amount: z.string().nullish(), date: z.string().nullish(), fromAccountId: z.string().nullish(), toAccountId: z.string().nullish(), fromName: z.string().nullish(), toName: z.string().nullish() }).passthrough();
const reportedStateSchema = z.object({ deliveryPaused: z.boolean().optional(), notificationAccess: z.boolean().optional(), selectedPackages: z.array(z.string()).optional(), pausedPackages: z.array(z.string()).optional() }).passthrough().nullable();

const cardsCardsItemSchema = z.object({
  "name": z.string(),
  "id": z.string(),
  "createdAt": z.string().optional(),
  "userId": z.string().optional(),
  "usualCutDay": z.number(),
  "usualDueDay": z.number(),
  "notes": z.union([z.null(), z.string()]),
  "creditLimit": z.union([z.null(), z.union([z.string(), z.number()])]),
  "usedBalance": z.union([z.null(), z.union([z.string(), z.number()])]),
  "balanceAsOf": z.union([z.null(), z.string()]),
  "balanceTracking": z.json().nullish(),
  "updatedAt": z.string().optional(),
  "balanceTrackingStatus": z.string()
}).passthrough();

const cardsCardsItemSchema2 = z.object({
  "name": z.string(),
  "id": z.string(),
  "createdAt": z.string().optional(),
  "userId": z.string().optional(),
  "usualCutDay": z.number(),
  "usualDueDay": z.number(),
  "notes": z.union([z.null(), z.string()]),
  "creditLimit": z.union([z.null(), z.union([z.string(), z.number()])]),
  "usedBalance": z.union([z.string(), z.number()]),
  "balanceAsOf": z.union([z.null(), z.string()]),
  "balanceTracking": z.json().nullish(),
  "updatedAt": z.string().optional(),
  "bankUsedBalance": z.union([z.string(), z.number()]),
  "balanceAdjustment": z.union([z.string(), z.number()]),
  "balanceTrackingStatus": z.string(),
  "balanceCalculatedAt": z.string()
}).passthrough();

const cardsSchema = z.object({
  "cards": z.array(z.union([cardsCardsItemSchema, cardsCardsItemSchema2]))
}).passthrough();

const cardCyclesCycleIncludedExpensesItemCaptureMovementsItemEventsItemSchema = z.object({
  "sourcePackage": z.string()
}).passthrough();

const cardCyclesCycleIncludedExpensesItemCaptureMovementsItemSchema = z.object({
  "id": z.union([z.undefined(), z.string()]).optional(),
  "status": z.union([z.undefined(), z.string()]).optional(),
  "events": z.union([z.undefined(), z.array(cardCyclesCycleIncludedExpensesItemCaptureMovementsItemEventsItemSchema)]).optional()
}).passthrough();

const cardCyclesCycleIncludedExpensesItemSchema = z.object({
  "id": z.string(),
  "concept": z.string(),
  "amount": z.number(),
  "cashContributionAmount": z.number(),
  "date": z.string(),
  "categoryName": z.union([z.null(), z.string()]),
  "reconciliationStatus": z.union([z.undefined(), z.string()]).optional(),
  "reconciledAt": z.union([z.undefined(), z.null(), z.string()]).optional(),
  "captureMovements": z.union([z.undefined(), z.array(cardCyclesCycleIncludedExpensesItemCaptureMovementsItemSchema)]).optional()
}).passthrough();

const cardCyclesCycleIncludedSubscriptionsItemSchema = z.object({
  "id": z.string(),
  "subscriptionId": z.string(),
  "name": z.string(),
  "amount": z.number(),
  "chargeDate": z.string(),
  "categoryName": z.union([z.null(), z.string()])
}).passthrough();

const cardCyclesCycleIncludedPurchasesItemSchema = z.object({
  "id": z.string(),
  "concept": z.string(),
  "amount": z.number(),
  "totalAmount": z.number(),
  "purchaseDate": z.string(),
  "months": z.number(),
  "currentMonth": z.number(),
  "initialPaymentsMade": z.union([z.undefined(), z.number()]).optional(),
  "categoryName": z.union([z.null(), z.string()]),
  "reconciliationStatus": z.union([z.undefined(), z.string()]).optional(),
  "reconciledAt": z.union([z.undefined(), z.null(), z.string()]).optional(),
  "captureMovements": z.union([z.undefined(), z.array(cardCyclesCycleIncludedExpensesItemCaptureMovementsItemSchema)]).optional()
}).passthrough();

const cardCyclesCycleIncludedCreditsItemSchema = z.object({
  "id": z.string(),
  "incomeId": z.string(),
  "concept": z.string(),
  "date": z.string(),
  "amount": z.number(),
  "incomeAmount": z.number(),
  "notes": z.union([z.null(), z.string()])
}).passthrough();

const cardCyclesCycleCardSchema = z.object({
  "name": z.string(),
  "id": z.string(),
  "usualCutDay": z.number(),
  "usualDueDay": z.number()
}).passthrough();

const cardCyclesCycleSchema = z.object({
  "includedExpenses": z.union([z.undefined(), z.array(cardCyclesCycleIncludedExpensesItemSchema)]).optional(),
  "includedSubscriptions": z.union([z.undefined(), z.array(cardCyclesCycleIncludedSubscriptionsItemSchema)]).optional(),
  "includedPurchases": z.union([z.undefined(), z.array(cardCyclesCycleIncludedPurchasesItemSchema)]).optional(),
  "includedCredits": z.union([z.undefined(), z.array(cardCyclesCycleIncludedCreditsItemSchema)]).optional(),
  "expensesAmount": z.number(),
  "cashContributionsAmount": z.number(),
  "subscriptionsAmount": z.number(),
  "purchasesAmount": z.number(),
  "grossCalculatedAmount": z.number(),
  "creditsAmount": z.number(),
  "credits": z.undefined().optional(),
  "calculatedAmount": z.number(),
  // The local cycle also receives PATCH replies with Decimal's JSON string.
  "statementAmount": z.union([z.null(), z.number(), z.string()]),
  "difference": z.union([z.null(), z.number()]),
  "dataWarnings": z.array(z.string()),
  "paymentStatus": z.union([z.literal("PAID"), z.literal("UNCONFIRMED"), z.literal("NO_PAYMENT_DUE"), z.literal("PARTIALLY_PAID"), z.literal("PENDING")]),
  "paymentDueAmount": z.union([z.null(), z.number()]),
  "pendingAmount": z.union([z.null(), z.number()]),
  "excessAmount": z.number(),
  "isSettled": z.boolean(),
  "displayStatus": z.union([z.literal("OPEN"), z.literal("CUT"), z.literal("PAYMENT_PENDING"), z.literal("PAID"), z.literal("OVERDUE"), z.literal("NO_PAYMENT_DUE"), z.literal("PARTIALLY_PAID")]),
  "id": z.string(),
  "createdAt": z.string().optional(),
  "card": cardCyclesCycleCardSchema,
  "userId": z.string().optional(),
  "notes": z.union([z.null(), z.string()]),
  "updatedAt": z.string().optional(),
  "cardId": z.string(),
  "month": z.number(),
  "year": z.number(),
  "startDate": z.string(),
  "cutDate": z.string(),
  "dueDate": z.string(),
  "datesConfirmedAt": z.union([z.null(), z.string()]),
  "status": z.union([z.literal("OPEN"), z.literal("CUT"), z.literal("PAYMENT_PENDING"), z.literal("PAID"), z.literal("OVERDUE")]),
  "paidAt": z.union([z.null(), z.string()]),
  "paidAmount": z.union([z.null(), z.union([z.string(), z.number()])]),
  "postCutCreditAmount": z.union([z.string(), z.number()]),
  "postCutCreditDate": z.union([z.null(), z.string()]),
  "postCutCreditNotes": z.union([z.null(), z.string()]),
  "usageReconciliation": z.union([z.null(), z.string(), z.number(), z.literal(false), z.literal(true), z.record(z.string(), z.union([z.undefined(), z.null(), z.string(), z.number(), z.literal(false), z.literal(true), z.json(), z.array(z.json())])), z.array(z.json())]).optional()
}).passthrough();

const cardCyclesSchema = z.object({
  "cycle": z.union([z.null(), cardCyclesCycleSchema])
}).passthrough();

const cardCyclesSchema2 = z.object({
  "cycles": z.array(cardCyclesCycleSchema)
}).passthrough();

const expensesExpensesItemCardSchema = z.object({
  "name": z.string(),
  "id": z.string()
}).passthrough();

const expensesExpensesItemCategorySchema = z.object({
  "name": z.string(),
  "id": z.string()
}).passthrough();

const expensesExpensesItemPersonSchema = z.object({
  "name": z.string(),
  "id": z.string()
}).passthrough();

const expensesExpensesItemSubscriptionSchema = z.object({
  "name": z.string(),
  "id": z.string()
}).passthrough();

const expensesExpensesItemReceivableAccountSchema = z.object({
  "id": z.string(),
  "concept": z.string()
}).passthrough();

const expensesExpensesItemPayableAccountSchema = z.object({
  "id": z.string(),
  "concept": z.string()
}).passthrough();

const expensesExpensesItemCaptureMovementsItemEventsItemSchema = z.object({
  "sourcePackage": z.string()
}).passthrough();

const expensesExpensesItemCaptureMovementsItemSchema = z.object({
  "id": z.string(),
  "events": z.array(expensesExpensesItemCaptureMovementsItemEventsItemSchema)
}).passthrough();

const expensesExpensesItemDebitAccountSchema = z.object({
  "name": z.string(),
  "id": z.string()
}).passthrough();

const expensesExpensesItemSchema = z.object({
  "id": z.string(),
  "createdAt": z.string().optional(),
  "card": z.union([z.null(), expensesExpensesItemCardSchema]),
  "userId": z.string().optional(),
  "notes": z.union([z.null(), z.string()]),
  "updatedAt": z.string().optional(),
  "cardId": z.union([z.null(), z.string()]),
  "amount": z.union([z.string(), z.number()]),
  "category": expensesExpensesItemCategorySchema,
  "person": z.union([z.null(), expensesExpensesItemPersonSchema]),
  "date": z.string(),
  "paymentMethod": z.union([z.literal("CASH"), z.literal("CARD"), z.literal("DEBIT")]),
  "debitAccountId": z.union([z.null(), z.string()]),
  "concept": z.string(),
  "refundOriginalAmount": z.union([z.null(), z.union([z.string(), z.number()])]),
  "cashContributionAmount": z.union([z.string(), z.number()]),
  "categoryId": z.string(),
  "personId": z.union([z.null(), z.string()]),
  "receivableAccountId": z.union([z.null(), z.string()]),
  "payableAccountId": z.union([z.null(), z.string()]),
  "subscriptionId": z.union([z.null(), z.string()]),
  "reconciliationStatus": z.string(),
  "reconciledAt": z.union([z.null(), z.string()]),
  "subscription": z.union([z.null(), expensesExpensesItemSubscriptionSchema]),
  "receivableAccount": z.union([z.null(), expensesExpensesItemReceivableAccountSchema]),
  "payableAccount": z.union([z.null(), expensesExpensesItemPayableAccountSchema]),
  "captureMovements": z.array(expensesExpensesItemCaptureMovementsItemSchema),
  "debitAccount": z.union([z.null(), expensesExpensesItemDebitAccountSchema])
}).passthrough();

const expensesSchema = z.object({
  "expenses": z.array(expensesExpensesItemSchema),
  "total": z.number(),
  "personalTotal": z.number(),
  "availableMonths": z.array(z.string())
}).passthrough();

const gastosBootstrapCategoriesItemSchema = z.object({
  "name": z.string(),
  "id": z.string(),
  "createdAt": z.string().optional(),
  "userId": z.string().optional()
}).passthrough();

const gastosBootstrapPeopleItemSchema = z.object({
  "name": z.string(),
  "id": z.string(),
  "createdAt": z.string().optional(),
  "userId": z.string().optional(),
  "notes": z.union([z.null(), z.string()])
}).passthrough();

const gastosBootstrapCardsItemSchema = z.object({
  "name": z.string(),
  "id": z.string(),
  "createdAt": z.string().optional(),
  "userId": z.string().optional(),
  "usualCutDay": z.number(),
  "usualDueDay": z.number(),
  "notes": z.union([z.null(), z.string()]),
  "updatedAt": z.string().optional()
}).passthrough();

const gastosBootstrapExpensesItemCardSchema = z.object({
  "name": z.string(),
  "id": z.string()
}).passthrough();

const gastosBootstrapExpensesItemCategorySchema = z.object({
  "name": z.string(),
  "id": z.string()
}).passthrough();

const gastosBootstrapExpensesItemPersonSchema = z.object({
  "name": z.string(),
  "id": z.string()
}).passthrough();

const gastosBootstrapExpensesItemSubscriptionSchema = z.object({
  "name": z.string(),
  "id": z.string()
}).passthrough();

const gastosBootstrapExpensesItemReceivableAccountSchema = z.object({
  "id": z.string(),
  "concept": z.string()
}).passthrough();

const gastosBootstrapExpensesItemPayableAccountSchema = z.object({
  "id": z.string(),
  "concept": z.string()
}).passthrough();

const gastosBootstrapExpensesItemCaptureMovementsItemEventsItemSchema = z.object({
  "sourcePackage": z.string()
}).passthrough();

const gastosBootstrapExpensesItemCaptureMovementsItemSchema = z.object({
  "id": z.string(),
  "events": z.array(gastosBootstrapExpensesItemCaptureMovementsItemEventsItemSchema)
}).passthrough();

const gastosBootstrapExpensesItemDebitAccountSchema = z.object({
  "name": z.string(),
  "id": z.string()
}).passthrough();

const gastosBootstrapExpensesItemSchema = z.object({
  "id": z.string(),
  "createdAt": z.string().optional(),
  "card": z.union([z.null(), gastosBootstrapExpensesItemCardSchema]),
  "userId": z.string().optional(),
  "notes": z.union([z.null(), z.string()]),
  "updatedAt": z.string().optional(),
  "cardId": z.union([z.null(), z.string()]),
  "amount": z.union([z.string(), z.number()]),
  "category": gastosBootstrapExpensesItemCategorySchema,
  "person": z.union([z.null(), gastosBootstrapExpensesItemPersonSchema]),
  "date": z.string(),
  "paymentMethod": z.union([z.literal("CASH"), z.literal("CARD"), z.literal("DEBIT")]),
  "debitAccountId": z.union([z.null(), z.string()]),
  "concept": z.string(),
  "refundOriginalAmount": z.union([z.null(), z.union([z.string(), z.number()])]),
  "cashContributionAmount": z.union([z.string(), z.number()]),
  "categoryId": z.string(),
  "personId": z.union([z.null(), z.string()]),
  "receivableAccountId": z.union([z.null(), z.string()]),
  "payableAccountId": z.union([z.null(), z.string()]),
  "subscriptionId": z.union([z.null(), z.string()]),
  "reconciliationStatus": z.string(),
  "reconciledAt": z.union([z.null(), z.string()]),
  "subscription": z.union([z.null(), gastosBootstrapExpensesItemSubscriptionSchema]),
  "receivableAccount": z.union([z.null(), gastosBootstrapExpensesItemReceivableAccountSchema]),
  "payableAccount": z.union([z.null(), gastosBootstrapExpensesItemPayableAccountSchema]),
  "captureMovements": z.array(gastosBootstrapExpensesItemCaptureMovementsItemSchema),
  "debitAccount": z.union([z.null(), gastosBootstrapExpensesItemDebitAccountSchema])
}).passthrough();

const gastosBootstrapReceivablesItemPersonSchema = z.object({
  "name": z.string(),
  "id": z.string()
}).passthrough();

const gastosBootstrapReceivablesItemIncomesItemSchema = z.object({
  "id": z.string(),
  "notes": z.union([z.null(), z.string()]),
  "amount": z.union([z.string(), z.number()]),
  "date": z.string(),
  "concept": z.string(),
  "source": z.string()
}).passthrough();

const gastosBootstrapReceivablesItemSchema = z.object({
  "paidAmount": z.number(),
  "pendingBalance": z.number(),
  "excessAmount": z.number(),
  "status": z.union([z.literal("ACTIVE"), z.literal("PAID_OFF"), z.literal("CANCELLED")]),
  "id": z.string(),
  "createdAt": z.string().optional(),
  "userId": z.string().optional(),
  "notes": z.union([z.null(), z.string()]),
  "updatedAt": z.string().optional(),
  "person": gastosBootstrapReceivablesItemPersonSchema,
  "concept": z.string(),
  "personId": z.string(),
  "originalAmount": z.union([z.string(), z.number()]),
  "balanceAdjustment": z.union([z.string(), z.number()]),
  "balanceAdjustmentNotes": z.union([z.null(), z.string()]),
  "originDate": z.string(),
  "expectedMonthlyPayment": z.union([z.null(), z.union([z.string(), z.number()])]),
  "expectedChargeDays": z.array(z.number()),
  "originType": z.union([z.literal("MANUAL"), z.literal("DAILY_EXPENSE"), z.literal("INSTALLMENT_PURCHASE")]),
  "originId": z.union([z.null(), z.string()]),
  "incomes": z.array(gastosBootstrapReceivablesItemIncomesItemSchema)
}).passthrough();

const gastosBootstrapPayablesItemPersonSchema = z.object({
  "name": z.string(),
  "id": z.string()
}).passthrough();

const gastosBootstrapPayablesItemDailyExpensesItemSchema = z.object({
  "id": z.string(),
  "amount": z.union([z.string(), z.number()]),
  "date": z.string(),
  "concept": z.string(),
  "loanPrincipalAmount": z.union([z.null(), z.union([z.string(), z.number()])])
}).passthrough();

const gastosBootstrapPayablesItemSchema = z.object({
  "paidAmount": z.number(),
  "pendingBalance": z.number(),
  "excessAmount": z.number(),
  "status": z.union([z.literal("ACTIVE"), z.literal("PAID_OFF"), z.literal("CANCELLED")]),
  "id": z.string(),
  "createdAt": z.string().optional(),
  "userId": z.string().optional(),
  "notes": z.union([z.null(), z.string()]),
  "updatedAt": z.string().optional(),
  "person": gastosBootstrapPayablesItemPersonSchema,
  "concept": z.string(),
  "personId": z.string(),
  "originalAmount": z.union([z.string(), z.number()]),
  "originDate": z.string(),
  "expectedMonthlyPayment": z.union([z.null(), z.union([z.string(), z.number()])]),
  "originType": z.union([z.literal("MANUAL"), z.literal("DAILY_EXPENSE")]),
  "originId": z.union([z.null(), z.string()]),
  "expectedDate": z.union([z.null(), z.string()]),
  "accountType": z.union([z.literal("SIMPLE"), z.literal("LOAN")]),
  "currentBalance": z.union([z.null(), z.union([z.string(), z.number()])]),
  "dailyExpenses": z.array(gastosBootstrapPayablesItemDailyExpensesItemSchema)
}).passthrough();

const gastosBootstrapSubscriptionsItemCardSchema = z.object({
  "name": z.string(),
  "id": z.string()
}).passthrough();

const gastosBootstrapSubscriptionsItemCategorySchema = z.object({
  "name": z.string(),
  "id": z.string()
}).passthrough();

const gastosBootstrapSubscriptionsItemSchema = z.object({
  "name": z.string(),
  "id": z.string(),
  "createdAt": z.string().optional(),
  "card": z.union([z.null(), gastosBootstrapSubscriptionsItemCardSchema]),
  "userId": z.string().optional(),
  "updatedAt": z.string().optional(),
  "cardId": z.union([z.null(), z.string()]),
  "amount": z.union([z.string(), z.number()]),
  "category": gastosBootstrapSubscriptionsItemCategorySchema,
  "paymentMethod": z.union([z.literal("CASH"), z.literal("CARD"), z.literal("DEBIT")]),
  "categoryId": z.string(),
  "chargeDay": z.number(),
  "frequencyMonths": z.number(),
  "startMonth": z.number(),
  "startYear": z.number(),
  "isActive": z.boolean(),
  "deactivatedAt": z.union([z.null(), z.string()])
}).passthrough();

const gastosBootstrapMoneyAccountsItemSchema = z.object({
  "name": z.string(),
  "id": z.string(),
  "kind": z.string()
}).passthrough();

const gastosBootstrapSchema = z.object({
  "categories": z.array(gastosBootstrapCategoriesItemSchema),
  "people": z.array(gastosBootstrapPeopleItemSchema),
  "cards": z.array(gastosBootstrapCardsItemSchema),
  "expenses": z.array(gastosBootstrapExpensesItemSchema),
  "availableMonths": z.array(z.string()),
  "receivables": z.array(gastosBootstrapReceivablesItemSchema),
  "payables": z.array(gastosBootstrapPayablesItemSchema),
  "subscriptions": z.array(gastosBootstrapSubscriptionsItemSchema),
  "moneyAccounts": z.array(gastosBootstrapMoneyAccountsItemSchema)
}).passthrough();

const incomesIncomesItemIncomeTypeSchema = z.object({
  "name": z.string(),
  "id": z.string()
}).passthrough();

const incomesIncomesItemReceivableAccountPersonSchema = z.object({
  "name": z.string(),
  "id": z.string()
}).passthrough();

const incomesIncomesItemReceivableAccountSchema = z.object({
  "id": z.string(),
  "person": incomesIncomesItemReceivableAccountPersonSchema,
  "concept": z.string()
}).passthrough();

const incomesIncomesItemSchema = z.object({
  "id": z.string(),
  "createdAt": z.string().optional(),
  "userId": z.string().optional(),
  "notes": z.union([z.null(), z.string()]),
  "updatedAt": z.string().optional(),
  "amount": z.union([z.string(), z.number()]),
  "incomeType": incomesIncomesItemIncomeTypeSchema,
  "date": z.string(),
  "concept": z.string(),
  "receivableAccountId": z.union([z.null(), z.string()]),
  "incomeTypeId": z.string(),
  "source": z.string(),
  "receivableAccount": z.union([z.null(), incomesIncomesItemReceivableAccountSchema])
}).passthrough();

const incomesSchema = z.object({
  "incomes": z.array(incomesIncomesItemSchema),
  "total": z.number(),
  "totalCount": z.number().int().nonnegative(),
  "page": z.number().int().positive(),
  "pageSize": z.number().int().min(1).max(100),
  "pageCount": z.number().int().positive()
}).passthrough();

const subscriptionsSubscriptionsItemCardSchema = z.object({
  "name": z.string(),
  "id": z.string()
}).passthrough();

const subscriptionsSubscriptionsItemCategorySchema = z.object({
  "name": z.string(),
  "id": z.string()
}).passthrough();

const subscriptionsSubscriptionsItemSchema = z.object({
  "name": z.string(),
  "id": z.string(),
  "createdAt": z.string().optional(),
  "card": z.union([z.null(), subscriptionsSubscriptionsItemCardSchema]),
  "userId": z.string().optional(),
  "updatedAt": z.string().optional(),
  "cardId": z.union([z.null(), z.string()]),
  "amount": z.union([z.string(), z.number()]),
  "category": subscriptionsSubscriptionsItemCategorySchema,
  "paymentMethod": z.union([z.literal("CASH"), z.literal("CARD"), z.literal("DEBIT")]),
  "categoryId": z.string(),
  "chargeDay": z.number(),
  "frequencyMonths": z.number(),
  "startMonth": z.number(),
  "startYear": z.number(),
  "isActive": z.boolean(),
  "deactivatedAt": z.union([z.null(), z.string()])
}).passthrough();

const subscriptionsSchema = z.object({
  "subscriptions": z.array(subscriptionsSubscriptionsItemSchema),
  "total": z.number()
}).passthrough();

const subscriptionChargesSchema = z.object({
  "expenseId": z.string(),
  "alreadyConfirmed": z.boolean(),
  "restored": z.undefined().optional(),
  "skipped": z.undefined().optional()
}).passthrough();

const subscriptionChargesSchema2 = z.object({
  "restored": z.literal(true),
  "expenseId": z.undefined().optional(),
  "alreadyConfirmed": z.undefined().optional(),
  "skipped": z.undefined().optional()
}).passthrough();

const subscriptionChargesSchema3 = z.object({
  "skipped": z.literal(true),
  "expenseId": z.undefined().optional(),
  "alreadyConfirmed": z.undefined().optional(),
  "restored": z.undefined().optional()
}).passthrough();

const subscriptionChargesChargesItemSchema = z.object({
  "id": z.string(),
  "subscriptionId": z.string(),
  "month": z.string(),
  "name": z.string(),
  "date": z.string(),
  "amount": z.number(),
  "paymentMethod": z.union([z.literal("CASH"), z.literal("CARD")]),
  "cardId": z.union([z.null(), z.string()]),
  "cardName": z.union([z.null(), z.string()]),
  "categoryName": z.union([z.null(), z.string()]),
  "status": z.string(),
  "confirmedAmount": z.union([z.null(), z.number()]),
  "confirmedPaymentMethod": z.union([z.null(), z.literal("CASH"), z.literal("CARD")]),
  "confirmedCardName": z.union([z.null(), z.string()]),
  "expenseId": z.union([z.null(), z.string()])
}).passthrough();

const subscriptionChargesSchema4 = z.object({
  "charges": z.array(subscriptionChargesChargesItemSchema)
}).passthrough();

const installmentPurchasesPurchasesItemCardSchema = z.object({
  "name": z.string(),
  "id": z.string(),
  "usualCutDay": z.number(),
  "usualDueDay": z.number()
}).passthrough();

const installmentPurchasesPurchasesItemCategorySchema = z.object({
  "name": z.string(),
  "id": z.string()
}).passthrough();

const installmentPurchasesPurchasesItemPersonSchema = z.object({
  "name": z.string(),
  "id": z.string()
}).passthrough();

const installmentPurchasesPurchasesItemReceivableAccountSchema = z.object({
  "id": z.string(),
  "concept": z.string()
}).passthrough();

const installmentPurchasesPurchasesItemCaptureMovementsItemEventsItemSchema = z.object({
  "sourcePackage": z.string()
}).passthrough();

const installmentPurchasesPurchasesItemCaptureMovementsItemSchema = z.object({
  "id": z.string(),
  "events": z.array(installmentPurchasesPurchasesItemCaptureMovementsItemEventsItemSchema)
}).passthrough();

const installmentPurchasesPurchasesItemSchema = z.object({
  "currentMonth": z.number(),
  "monthlyPaymentUsed": z.number(),
  "remainingMonths": z.number(),
  "remainingBalance": z.number(),
  "verifiedStatementDate": z.union([z.undefined(), z.string()]).optional(),
  "calculatedMonthlyPayment": z.number(),
  "id": z.string(),
  "createdAt": z.string().optional(),
  "card": installmentPurchasesPurchasesItemCardSchema,
  "userId": z.string().optional(),
  "notes": z.union([z.null(), z.string()]),
  "updatedAt": z.string().optional(),
  "cardId": z.string(),
  "status": z.union([z.literal("ACTIVE"), z.literal("PAID_OFF"), z.literal("CANCELLED"), z.literal("ADJUSTED")]),
  "category": installmentPurchasesPurchasesItemCategorySchema,
  "person": z.union([z.null(), installmentPurchasesPurchasesItemPersonSchema]),
  "concept": z.string(),
  "categoryId": z.string(),
  "personId": z.union([z.null(), z.string()]),
  "receivableAccountId": z.union([z.null(), z.string()]),
  "reconciliationStatus": z.string(),
  "reconciledAt": z.union([z.null(), z.string()]),
  "purchaseDate": z.string(),
  "totalAmount": z.union([z.string(), z.number()]),
  "months": z.number(),
  "manualMonthlyPayment": z.union([z.null(), z.union([z.string(), z.number()])]),
  "statementReconciliations": z.json().nullish(),
  "initialPaymentsMade": z.number(),
  "receivableAccount": z.union([z.null(), installmentPurchasesPurchasesItemReceivableAccountSchema]),
  "captureMovements": z.array(installmentPurchasesPurchasesItemCaptureMovementsItemSchema)
}).passthrough();

const installmentPurchasesSchema = z.object({
  "purchases": z.array(installmentPurchasesPurchasesItemSchema)
}).passthrough();

const receivablesReceivablesItemPersonSchema = z.object({
  "name": z.string(),
  "id": z.string()
}).passthrough();

const receivablesReceivablesItemIncomesItemSchema = z.object({
  "id": z.string(),
  "notes": z.union([z.null(), z.string()]),
  "amount": z.union([z.string(), z.number()]),
  "date": z.string(),
  "concept": z.string(),
  "source": z.string()
}).passthrough();

const receivablesReceivablesItemSchema = z.object({
  "paidAmount": z.number(),
  "pendingBalance": z.number(),
  "excessAmount": z.number(),
  "status": z.union([z.literal("ACTIVE"), z.literal("PAID_OFF"), z.literal("CANCELLED")]),
  "id": z.string(),
  "createdAt": z.string().optional(),
  "userId": z.string().optional(),
  "notes": z.union([z.null(), z.string()]),
  "updatedAt": z.string().optional(),
  "person": receivablesReceivablesItemPersonSchema,
  "concept": z.string(),
  "personId": z.string(),
  "originalAmount": z.union([z.string(), z.number()]),
  "balanceAdjustment": z.union([z.string(), z.number()]),
  "balanceAdjustmentNotes": z.union([z.null(), z.string()]),
  "originDate": z.string(),
  "expectedMonthlyPayment": z.union([z.null(), z.union([z.string(), z.number()])]),
  "expectedChargeDays": z.array(z.number()),
  "originType": z.union([z.literal("MANUAL"), z.literal("DAILY_EXPENSE"), z.literal("INSTALLMENT_PURCHASE")]),
  "originId": z.union([z.null(), z.string()]),
  "incomes": z.array(receivablesReceivablesItemIncomesItemSchema)
}).passthrough();

const receivablesSchema = z.object({
  "receivables": z.array(receivablesReceivablesItemSchema)
}).passthrough();

const payablesPayablesItemReimbursementReceivablePersonSchema = z.object({
  "name": z.string(),
  "id": z.string()
}).passthrough();

const payablesPayablesItemReimbursementReceivableSchema = z.object({
  "paidAmount": z.number(),
  "pendingBalance": z.number(),
  "excessAmount": z.number(),
  "status": z.union([z.literal("ACTIVE"), z.literal("PAID_OFF"), z.literal("CANCELLED")]),
  "id": z.string(),
  "person": payablesPayablesItemReimbursementReceivablePersonSchema,
  "concept": z.string(),
  "originalAmount": z.union([z.string(), z.number()]),
  "balanceAdjustment": z.union([z.string(), z.number()]),
  "balanceAdjustmentNotes": z.union([z.null(), z.string()])
}).passthrough();

const payablesPayablesItemPersonSchema = z.object({
  "name": z.string(),
  "id": z.string()
}).passthrough();

const payablesPayablesItemDailyExpensesItemSchema = z.object({
  "id": z.string(),
  "amount": z.union([z.string(), z.number()]),
  "date": z.string(),
  "concept": z.string(),
  "loanInterestAmount": z.union([z.null(), z.union([z.string(), z.number()])]),
  "loanPrincipalAmount": z.union([z.null(), z.union([z.string(), z.number()])])
}).passthrough();

const payablesPayablesItemSchema = z.object({
  "reimbursementReceivable": z.union([z.null(), payablesPayablesItemReimbursementReceivableSchema]),
  "paidAmount": z.number(),
  "pendingBalance": z.number(),
  "excessAmount": z.number(),
  "status": z.union([z.literal("ACTIVE"), z.literal("PAID_OFF"), z.literal("CANCELLED")]),
  "id": z.string(),
  "createdAt": z.string().optional(),
  "userId": z.string().optional(),
  "notes": z.union([z.null(), z.string()]),
  "updatedAt": z.string().optional(),
  "person": payablesPayablesItemPersonSchema,
  "concept": z.string(),
  "personId": z.string(),
  "originalAmount": z.union([z.string(), z.number()]),
  "originDate": z.string(),
  "expectedMonthlyPayment": z.union([z.null(), z.union([z.string(), z.number()])]),
  "originType": z.union([z.literal("MANUAL"), z.literal("DAILY_EXPENSE")]),
  "originId": z.union([z.null(), z.string()]),
  "expectedDate": z.union([z.null(), z.string()]),
  "accountType": z.union([z.literal("SIMPLE"), z.literal("LOAN")]),
  "annualInterestRate": z.union([z.null(), z.string()]),
  "currentBalance": z.union([z.null(), z.union([z.string(), z.number()])]),
  "firstPaymentDate": z.union([z.null(), z.string()]),
  "paymentAmount": z.union([z.null(), z.union([z.string(), z.number()])]),
  "paymentDays": z.array(z.number()),
  "paymentsMade": z.union([z.null(), z.number()]),
  "reimbursementReceivableId": z.union([z.null(), z.string()]),
  "totalPayments": z.union([z.null(), z.number()]),
  "dailyExpenses": z.array(payablesPayablesItemDailyExpensesItemSchema)
}).passthrough();

const payablesSchema = z.object({
  "payables": z.array(payablesPayablesItemSchema)
}).passthrough();

const dashboardPaymentsItemCardSchema = z.object({
  "name": z.string(),
  "id": z.string(),
  "usualCutDay": z.number(),
  "usualDueDay": z.number(),
  "usagePolicy": z.json().nullish()
}).passthrough();

const dashboardPaymentsItemPreviousPaymentSchema = z.object({
  "includedExpenses": z.union([z.undefined(), z.array(cardCyclesCycleIncludedExpensesItemSchema)]).optional(),
  "includedSubscriptions": z.union([z.undefined(), z.array(cardCyclesCycleIncludedSubscriptionsItemSchema)]).optional(),
  "includedPurchases": z.union([z.undefined(), z.array(cardCyclesCycleIncludedPurchasesItemSchema)]).optional(),
  "includedCredits": z.union([z.undefined(), z.array(cardCyclesCycleIncludedCreditsItemSchema)]).optional(),
  "expensesAmount": z.number(),
  "cashContributionsAmount": z.number(),
  "subscriptionsAmount": z.number(),
  "purchasesAmount": z.number(),
  "grossCalculatedAmount": z.number(),
  "creditsAmount": z.number(),
  "credits": z.undefined().optional(),
  "calculatedAmount": z.number(),
  "statementAmount": z.union([z.null(), z.number()]),
  "difference": z.union([z.null(), z.number()]),
  "dataWarnings": z.array(z.string()),
  "paymentStatus": z.union([z.literal("PAID"), z.literal("UNCONFIRMED"), z.literal("NO_PAYMENT_DUE"), z.literal("PARTIALLY_PAID"), z.literal("PENDING")]),
  "paymentDueAmount": z.union([z.null(), z.number()]),
  "pendingAmount": z.union([z.null(), z.number()]),
  "excessAmount": z.number(),
  "isSettled": z.boolean(),
  "displayStatus": z.union([z.literal("OPEN"), z.literal("CUT"), z.literal("PAYMENT_PENDING"), z.literal("PAID"), z.literal("OVERDUE"), z.literal("NO_PAYMENT_DUE"), z.literal("PARTIALLY_PAID")]),
  "id": z.string(),
  "createdAt": z.string().optional(),
  "card": dashboardPaymentsItemCardSchema,
  "userId": z.string().optional(),
  "notes": z.union([z.null(), z.string()]),
  "updatedAt": z.string().optional(),
  "cardId": z.string(),
  "month": z.number(),
  "year": z.number(),
  "startDate": z.string(),
  "cutDate": z.string(),
  "dueDate": z.string(),
  "status": z.union([z.literal("OPEN"), z.literal("CUT"), z.literal("PAYMENT_PENDING"), z.literal("PAID"), z.literal("OVERDUE")]),
  "paidAt": z.union([z.null(), z.string()]),
  "paidAmount": z.union([z.null(), z.union([z.string(), z.number()])]),
  "postCutCreditAmount": z.union([z.string(), z.number()]),
  "postCutCreditDate": z.union([z.null(), z.string()]),
  "postCutCreditNotes": z.union([z.null(), z.string()]),
  "usageReconciliation": z.union([z.null(), z.string(), z.number(), z.literal(false), z.literal(true), z.record(z.string(), z.union([z.undefined(), z.null(), z.string(), z.number(), z.literal(false), z.literal(true), z.json(), z.array(z.json())])), z.array(z.json())]).optional()
}).passthrough();

const dashboardPaymentsItemSchema = z.object({
  "card": dashboardPaymentsItemCardSchema,
  "previousPayment": z.union([z.undefined(), z.null(), dashboardPaymentsItemPreviousPaymentSchema]).optional(),
  "currentPayment": z.union([z.null(), dashboardPaymentsItemPreviousPaymentSchema]),
  "nextPayment": z.union([z.null(), dashboardPaymentsItemPreviousPaymentSchema])
}).passthrough();

const dashboardMonthlySummarySchema = z.object({
  "incomeTotal": z.number(),
  "dailyExpensesTotal": z.number(),
  "subscriptionsTotal": z.number(),
  "installmentPurchasesTotal": z.number(),
  "monthlyExpenseTotal": z.number(),
  "monthlyDifference": z.number()
}).passthrough();

const dashboardCategoryBreakdownPrevItemSchema = z.object({
  "id": z.string(),
  "name": z.string(),
  "total": z.number(),
  "percentage": z.number()
}).passthrough();

const dashboardCategoryBreakdownByMonthSchema = financialReadSchemas.dashboard.shape.categoryBreakdownByMonth;

const dashboardWeeklyComparisonByMonthSchema = financialReadSchemas.dashboard.shape.weeklyComparisonByMonth;

const dashboardCardMonthlyComparisonByMonthSchema = financialReadSchemas.dashboard.shape.cardMonthlyComparisonByMonth;

const dashboardCardUsageWaiversItemCardSchema = z.object({
  "name": z.string(),
  "id": z.string(),
  "usagePolicy": z.json().nullish().optional()
}).passthrough();

const dashboardCardUsageWaiversItemSubscriptionForecastSchema = z.object({
  "upcomingCount": z.number(),
  "upcomingAmount": z.number(),
  "unconfirmedCount": z.number(),
  "unconfirmedAmount": z.number()
}).passthrough();

const dashboardCardUsageWaiversItemSelectedCycleSchema = z.object({
  "id": z.string(),
  "startDate": z.string(),
  "cutDate": z.string(),
  "dueDate": z.string(),
  "month": z.number(),
  "year": z.number(),
  "displayStatus": z.union([z.undefined(), z.string()]).optional()
}).passthrough();

const dashboardCardUsageWaiversItemBreakdownIncludedDailyExpensesItemSchema = z.object({
  "id": z.string(),
  "concept": z.union([z.undefined(), z.string()]).optional(),
  "name": z.union([z.undefined(), z.string()]).optional(),
  "amount": z.number(),
  "date": z.union([z.undefined(), z.string()]).optional(),
  "chargeDate": z.union([z.undefined(), z.string()]).optional(),
  "purchaseDate": z.union([z.undefined(), z.string()]).optional(),
  "months": z.union([z.undefined(), z.number()]).optional(),
  "categoryName": z.union([z.undefined(), z.null(), z.string()]).optional(),
  "source": z.union([z.undefined(), z.string()]).optional(),
  "reason": z.union([z.undefined(), z.string()]).optional(),
  "subscriptionProjection": z.union([z.undefined(), z.string()]).optional()
}).passthrough();

const dashboardCardUsageWaiversItemBreakdownSchema = z.object({
  "dailyExpensesAmount": z.number(),
  "subscriptionsAmount": z.number(),
  "installmentPurchasesAmount": z.number(),
  "includedDailyExpenses": z.array(dashboardCardUsageWaiversItemBreakdownIncludedDailyExpensesItemSchema),
  "includedSubscriptions": z.array(dashboardCardUsageWaiversItemBreakdownIncludedDailyExpensesItemSchema),
  "includedInstallmentPurchases": z.array(dashboardCardUsageWaiversItemBreakdownIncludedDailyExpensesItemSchema),
  "excludedExpenses": z.array(dashboardCardUsageWaiversItemBreakdownIncludedDailyExpensesItemSchema),
  "excludedAmount": z.number(),
  "projectedCharges": z.array(dashboardCardUsageWaiversItemBreakdownIncludedDailyExpensesItemSchema)
}).passthrough();

const dashboardCardUsageWaiversItemSchema = z.object({
  "requirementType": z.undefined().optional(),
  "renewBy": z.undefined().optional(),
  "card": dashboardCardUsageWaiversItemCardSchema,
  "applies": z.boolean(),
  "bank": z.string(),
  "product": z.string(),
  "ruleSourceUrl": z.string(),
  "policyVerifiedAt": z.unknown(),
  "minimumAmount": z.number(),
  "eligibleSpend": z.number(),
  "remainingAmount": z.number(),
  "progress": z.number(),
  "isExempt": z.boolean(),
  "confirmationPending": z.boolean(),
  "projectedAmount": z.number(),
  "projectedTotal": z.number(),
  "subscriptionForecast": dashboardCardUsageWaiversItemSubscriptionForecastSchema,
  "status": z.string(),
  "periodVerified": z.boolean(),
  "statementSource": z.union([z.null(), z.string()]),
  "selectedCycle": z.union([z.null(), dashboardCardUsageWaiversItemSelectedCycleSchema]),
  "breakdown": dashboardCardUsageWaiversItemBreakdownSchema
  ,"periodSelectionPending": z.boolean().optional()
}).passthrough();

const dashboardCardUsageWaiversByMonthSchema = z.record(z.string(), z.array(dashboardCardUsageWaiversItemSchema));

const dashboardCardUsageWaiversCurrentItemLastPurchaseSchema = z.object({
  "id": z.string(),
  "concept": z.string(),
  "amount": z.number(),
  "date": z.string()
}).passthrough();

const dashboardCardUsageWaiversCurrentItemSchema = z.object({
  "card": dashboardCardUsageWaiversItemCardSchema,
  "product": z.string(),
  "requirementType": z.literal("PURCHASE_FREQUENCY"),
  "ruleSourceUrl": z.string(),
  "requiredPurchases": z.number(),
  "requirementDays": z.number(),
  "minimumAmount": z.null(),
  "status": z.string(),
  "isExempt": z.boolean(),
  "lastPurchase": z.union([z.null(), dashboardCardUsageWaiversCurrentItemLastPurchaseSchema]),
  "renewBy": z.union([z.null(), z.string()]),
  "daysRemaining": z.union([z.null(), z.number()]),
  "purchaseCount": z.number(),
  "recentPurchases": z.array(dashboardCardUsageWaiversCurrentItemLastPurchaseSchema)
,
  "selectedCycle": z.undefined().optional(),
  "subscriptionForecast": z.undefined().optional()
}).passthrough();

const dashboardCardUsageWaiversCurrentItemSchema2 = z.object({
  "requirementType": z.undefined().optional(),
  "renewBy": z.undefined().optional(),
  "card": dashboardCardUsageWaiversItemCardSchema,
  "applies": z.boolean(),
  "bank": z.string(),
  "product": z.string(),
  "ruleSourceUrl": z.string(),
  "policyVerifiedAt": z.unknown(),
  "minimumAmount": z.number(),
  "eligibleSpend": z.number(),
  "remainingAmount": z.number(),
  "progress": z.number(),
  "isExempt": z.boolean(),
  "confirmationPending": z.boolean(),
  "projectedAmount": z.number(),
  "projectedTotal": z.number(),
  "subscriptionForecast": dashboardCardUsageWaiversItemSubscriptionForecastSchema,
  "status": z.string(),
  "periodVerified": z.boolean(),
  "statementSource": z.union([z.null(), z.string()]),
  "selectedCycle": z.union([z.null(), dashboardCardUsageWaiversItemSelectedCycleSchema]),
  "breakdown": dashboardCardUsageWaiversItemBreakdownSchema,
  "periodSelectionPending": z.boolean()
}).passthrough();

const dashboardCategoriesItemSchema = z.object({
  "id": z.string(),
  "name": z.string()
}).passthrough();

const dashboardActiveReceivablesItemPersonSchema = z.object({
  "name": z.string(),
  "id": z.string()
}).passthrough();

const dashboardActiveReceivablesItemIncomesItemSchema = z.object({
  "id": z.string(),
  "amount": z.union([z.string(), z.number()]),
  "date": z.string()
}).passthrough();

const dashboardActiveReceivablesItemSchema = z.object({
  "paidAmount": z.number(),
  "pendingBalance": z.number(),
  "excessAmount": z.number(),
  "status": z.union([z.literal("ACTIVE"), z.literal("PAID_OFF"), z.literal("CANCELLED")]),
  "id": z.string(),
  "person": dashboardActiveReceivablesItemPersonSchema,
  "concept": z.string(),
  "personId": z.string(),
  "originalAmount": z.union([z.string(), z.number()]),
  "balanceAdjustment": z.union([z.string(), z.number()]),
  "originDate": z.string(),
  "expectedMonthlyPayment": z.union([z.null(), z.union([z.string(), z.number()])]),
  "expectedChargeDays": z.array(z.number()),
  "incomes": z.array(dashboardActiveReceivablesItemIncomesItemSchema)
}).passthrough();

const dashboardImportantNoticesItemSchema = z.object({
  "id": z.string(),
  "type": z.string(),
  "group": z.string(),
  "title": z.string(),
  "description": z.string(),
  "date": z.string(),
  "amount": z.number()
}).passthrough();

const dashboardSchema = z.object({
  "payments": z.array(dashboardPaymentsItemSchema),
  "cycles": z.array(dashboardPaymentsItemPreviousPaymentSchema),
  "monthlySummary": dashboardMonthlySummarySchema,
  "categoryBreakdownPrev": z.array(dashboardCategoryBreakdownPrevItemSchema),
  "categoryBreakdownCurrent": z.array(dashboardCategoryBreakdownPrevItemSchema),
  "categoryBreakdownNext": z.array(dashboardCategoryBreakdownPrevItemSchema),
  "categoryBreakdownByMonth": dashboardCategoryBreakdownByMonthSchema,
  "weeklyComparisonByMonth": dashboardWeeklyComparisonByMonthSchema,
  "weeklyComparisonByCategoryAndMonth": z.record(z.string(), dashboardWeeklyComparisonByMonthSchema),
  "cardMonthlyComparisonByMonth": dashboardCardMonthlyComparisonByMonthSchema,
  "cardUsageWaivers": z.array(dashboardCardUsageWaiversItemSchema),
  "cardUsageWaiversByMonth": dashboardCardUsageWaiversByMonthSchema,
  "cardUsageWaiversCurrent": z.array(z.union([dashboardCardUsageWaiversCurrentItemSchema, dashboardCardUsageWaiversCurrentItemSchema2])),
  "cardUsageWaiverHistory": z.array(dashboardCardUsageWaiversItemSchema),
  "categories": z.array(dashboardCategoriesItemSchema),
  "activeReceivables": z.array(dashboardActiveReceivablesItemSchema),
  "importantNotices": z.array(dashboardImportantNoticesItemSchema)
}).passthrough();

const settingsCategoriesItemSchema = z.object({
  "name": z.string(),
  "id": z.string(),
  "createdAt": z.string().optional(),
  "userId": z.string().optional()
}).passthrough();

const settingsPeopleItemSchema = z.object({
  "name": z.string(),
  "id": z.string(),
  "createdAt": z.string().optional(),
  "userId": z.string().optional(),
  "notes": z.union([z.null(), z.string()])
}).passthrough();

const settingsIncomeTypesItemSchema = z.object({
  "name": z.string(),
  "id": z.string(),
  "createdAt": z.string().optional(),
  "userId": z.string().optional()
}).passthrough();

const settingsSchema = z.object({
  "categories": z.array(settingsCategoriesItemSchema),
  "people": z.array(settingsPeopleItemSchema),
  "incomeTypes": z.array(settingsIncomeTypesItemSchema)
}).passthrough();

const capturesDevicesSchema = z.object({
  "reported": z.boolean()
}).passthrough();

const capturesDevicesSchema2 = z.object({
  "deviceId": z.string(),
  "code": z.string(),
  "expiresAt": z.string()
}).passthrough();

const capturesDevicesDeviceSchema = z.object({
  "name": z.string(),
  "id": z.string(),
  "createdAt": z.string().optional(),
  "approvedAt": z.union([z.null(), z.string()]),
  "pausedAt": z.union([z.null(), z.string()]),
  "revokedAt": z.union([z.null(), z.string()]),
  "lastSeenAt": z.union([z.null(), z.string()]),
  "pausedPackages": z.array(z.string()).nullable(),
  "reportedState": reportedStateSchema,
  "reportedAt": z.union([z.null(), z.string()])
}).passthrough();

const capturesDevicesSchema3 = z.object({
  "device": capturesDevicesDeviceSchema
}).passthrough();

const capturesDevicesSchema4 = z.object({
  "state": z.string(),
  "ownerId": z.union([z.null(), z.string()]),
  "deviceId": z.string()
}).passthrough();

const capturesDevicesEventSchema = z.object({
  "id": z.string(),
  "eventId": z.string(),
  "status": z.string(),
  "receivedAt": z.string()
}).passthrough();

const capturesDevicesSchema5 = z.object({
  "event": capturesDevicesEventSchema
}).passthrough();

const capturesDevicesSchema6 = z.object({
  "devices": z.array(capturesDevicesDeviceSchema)
}).passthrough();

const capturesConfigurationMoneyWithdrawalSamplesItemMoneyPostingWithdrawalSchema = z.object({
  "reversedAt": z.union([z.null(), z.string()])
}).passthrough();

const capturesConfigurationMoneyWithdrawalSamplesItemMoneyPostingSchema = z.object({
  "snapshot": captureSnapshotSchema,
  "withdrawal": z.union([z.null(), capturesConfigurationMoneyWithdrawalSamplesItemMoneyPostingWithdrawalSchema])
}).passthrough();

const capturesConfigurationMoneyWithdrawalSamplesItemSchema = z.object({
  "id": z.string(),
  "proposal": captureProposalSchema,
  "moneyPosting": z.union([z.null(), capturesConfigurationMoneyWithdrawalSamplesItemMoneyPostingSchema])
}).passthrough();

const capturesConfigurationMoneyAccountsItemSchema = z.object({
  "name": z.string(),
  "id": z.string(),
  "kind": z.string(),
  "asOf": z.string()
}).passthrough();

const capturesConfigurationMoneyPoliciesItemSchema = z.object({
  "id": z.string(),
  "createdAt": z.string().optional(),
  "userId": z.string().optional(),
  "updatedAt": z.string().optional(),
  "kind": z.string(),
  "mode": z.string(),
  "datePolicy": z.string(),
  "currency": z.string(),
  "acceptedAt": z.string(),
  "fromAccountId": z.string(),
  "toAccountId": z.union([z.null(), z.string()]),
  "destinationLabel": z.string(),
  "accountLast4": z.union([z.null(), z.string()]),
  "accountSuffixes": z.array(z.string()),
  "verifiedMovementId": z.union([z.null(), z.string()])
}).passthrough();

const capturesConfigurationCardsItemSchema = z.object({
  "name": z.string(),
  "id": z.string()
}).passthrough();

const capturesConfigurationAliasesItemSchema = z.object({
  "id": z.string(),
  "userId": z.string().optional(),
  "cardId": z.string(),
  "sourcePackage": z.string(),
  "kind": z.string(),
  "value": z.string(),
  "verifiedAt": z.union([z.null(), z.string()]),
  "evidence": z.json().nullish()
}).passthrough();

const capturesConfigurationAutomationsItemSchema = z.object({
  "id": z.string(),
  "userId": z.string().optional(),
  "cardId": z.string(),
  "parserKey": z.string(),
  "mode": z.string(),
  "datePolicy": z.string(),
  "completionPolicy": z.union([z.null(), z.string()]),
  "policyAcceptedAt": z.union([z.null(), z.string()]),
  "policySubscriptionId": z.union([z.null(), z.string()])
}).passthrough();

const capturesConfigurationRulesItemSchema = z.object({
  "id": z.string(),
  "userId": z.string().optional(),
  "cardId": z.string(),
  "categoryId": z.string(),
  "subscriptionId": z.union([z.null(), z.string()]),
  "merchant": z.string()
}).passthrough();

const capturesConfigurationCategoriesItemSchema = z.object({
  "name": z.string(),
  "id": z.string()
}).passthrough();

const capturesConfigurationSubscriptionsItemSchema = z.object({
  "name": z.string(),
  "id": z.string(),
  "cardId": z.union([z.null(), z.string()]),
  "paymentMethod": z.union([z.literal("CASH"), z.literal("CARD"), z.literal("DEBIT")])
}).passthrough();

const capturesConfigurationPaymentPoliciesItemSchema = z.object({
  "id": z.string(),
  "createdAt": z.string().optional(),
  "userId": z.string().optional(),
  "cardId": z.string(),
  "source": z.string(),
  "mode": z.string(),
  "acceptedAt": z.union([z.null(), z.string()]),
  "destinationLast4": z.union([z.null(), z.string()]),
  "destinationHash": z.union([z.null(), z.string()])
}).passthrough();

const capturesConfigurationFallbackPoliciesItemSchema = z.object({
  "id": z.string(),
  "userId": z.string().optional(),
  "cardId": z.string(),
  "mode": z.string(),
  "bankSourcePackage": z.string(),
  "currency": z.string(),
  "bankDatePolicy": z.string(),
  "purchasesOnly": z.boolean(),
  "waitMinutes": z.number(),
  "acceptedAt": z.string(),
  "evidenceMovementId": z.string()
}).passthrough();

const capturesConfigurationFallbackOptionsItemSchema = z.object({
  "cardId": z.string(),
  "bankSourcePackage": z.string(),
  "bankDatePolicy": z.string(),
  "evidenceMovementId": z.string()
}).passthrough();

const capturesConfigurationRolloutItemRetiredFormatsItemSchema = z.object({
  "parserKey": z.string(),
  "mode": z.string()
}).passthrough();

const capturesConfigurationRolloutItemSourcesItemFormatsItemSchema = z.object({
  "mode": z.string(),
  "datePolicy": z.string(),
  "verifiedAliases": z.number(),
  "ambiguousAliases": z.number(),
  "reviewedCaptures": z.number(),
  "blockers": z.array(z.union([z.literal("UNVERIFIED_FORMAT"), z.literal("NO_VERIFIED_ALIAS"), z.literal("AMBIGUOUS_ALIAS"), z.literal("NO_REVIEWED_CAPTURE"), z.literal("FORMAT_POLICY_REQUIRED")])),
  "canEnable": z.boolean(),
  "completionPolicy": z.union([z.undefined(), z.string()]).optional(),
  "policyRequiresSubscription": z.union([z.undefined(), z.literal(false), z.literal(true)]).optional(),
  "hasFormatPolicy": z.union([z.undefined(), z.literal(false), z.literal(true)]).optional(),
  "policySubscriptionId": z.union([z.undefined(), z.null(), z.string()]).optional(),
  "parserKey": z.string(),
  "sourcePackage": z.string(),
  "verified": z.boolean(),
  "dateSource": z.string()
}).passthrough();

const capturesConfigurationRolloutItemSourcesItemSchema = z.object({
  "sourcePackage": z.string(),
  "verifiedAliases": z.number(),
  "formats": z.array(capturesConfigurationRolloutItemSourcesItemFormatsItemSchema)
}).passthrough();

const capturesConfigurationRolloutItemSchema = z.object({
  "cardId": z.string(),
  "retiredFormats": z.array(capturesConfigurationRolloutItemRetiredFormatsItemSchema),
  "sources": z.array(capturesConfigurationRolloutItemSourcesItemSchema)
}).passthrough();

const capturesConfigurationParsersItemSchema = z.object({
  "key": z.string(),
  "sourcePackage": z.string(),
  "verified": z.boolean(),
  "dateSource": z.string()
}).passthrough();

const capturesConfigurationSchema = z.object({
  "moneyWithdrawalSamples": z.array(capturesConfigurationMoneyWithdrawalSamplesItemSchema),
  "moneyAccounts": z.array(capturesConfigurationMoneyAccountsItemSchema),
  "moneyPolicies": z.array(capturesConfigurationMoneyPoliciesItemSchema),
  "cards": z.array(capturesConfigurationCardsItemSchema),
  "aliases": z.array(capturesConfigurationAliasesItemSchema),
  "automations": z.array(capturesConfigurationAutomationsItemSchema),
  "rules": z.array(capturesConfigurationRulesItemSchema),
  "categories": z.array(capturesConfigurationCategoriesItemSchema),
  "subscriptions": z.array(capturesConfigurationSubscriptionsItemSchema),
  "paymentPolicies": z.array(capturesConfigurationPaymentPoliciesItemSchema),
  "fallbackPolicies": z.array(capturesConfigurationFallbackPoliciesItemSchema),
  "fallbackOptions": z.array(capturesConfigurationFallbackOptionsItemSchema),
  "rollout": z.array(capturesConfigurationRolloutItemSchema),
  "parsers": z.array(capturesConfigurationParsersItemSchema)
}).passthrough();

const capturesMovementsPaymentDetailPaymentCycleSchema = z.object({
  "cardId": z.string(),
  "month": z.number(),
  "year": z.number()
}).passthrough();

const capturesMovementsPaymentDetailPaymentSchema = z.object({
  "cycle": capturesMovementsPaymentDetailPaymentCycleSchema,
  "id": z.string(),
  "createdAt": z.string().optional(),
  "userId": z.string().optional(),
  "cycleId": z.string(),
  "amount": z.union([z.string(), z.number()]),
  "date": z.string(),
  "movementId": z.string(),
  "kind": z.string(),
  "reversedAt": z.union([z.null(), z.string()])
}).passthrough();

const capturesMovementsPaymentDetailCyclesItemSchema = z.object({
  "id": z.string(),
  "cardId": z.string(),
  "month": z.number(),
  "year": z.number(),
  "statementAmount": z.union([z.null(), z.union([z.string(), z.number()])]),
  "paidAt": z.union([z.null(), z.string()]),
  "paidAmount": z.union([z.null(), z.union([z.string(), z.number()])]),
  "postCutCreditAmount": z.union([z.string(), z.number()])
}).passthrough();

const capturesMovementsPaymentDetailSchema = z.object({
  "payment": z.union([z.null(), capturesMovementsPaymentDetailPaymentSchema]),
  "cycles": z.array(capturesMovementsPaymentDetailCyclesItemSchema)
}).passthrough();

const capturesMovementsRefundDetailCandidatesItemSchema = z.object({
  "id": z.string(),
  "concept": z.string(),
  "cardId": z.union([z.null(), z.string()]),
  "amount": z.union([z.string(), z.number()]),
  "originalAmount": z.union([z.string(), z.number()]),
  "date": z.string(),
  "updatedAt": z.string().optional()
}).passthrough();

const capturesMovementsRefundDetailRefundSchema = z.object({
  "id": z.string(),
  "createdAt": z.string().optional(),
  "userId": z.string().optional(),
  "amount": z.union([z.string(), z.number()]),
  "date": z.string(),
  "expenseId": z.union([z.null(), z.string()]),
  "movementId": z.string(),
  "originalExpenseId": z.string(),
  "expenseSnapshot": z.union([z.null(), z.string(), z.number(), z.literal(false), z.literal(true), z.record(z.string(), z.union([z.undefined(), z.null(), z.string(), z.number(), z.literal(false), z.literal(true), z.json(), z.array(z.json())])), z.array(z.json())]).optional(),
  "reversedAt": z.union([z.null(), z.string()])
}).passthrough();

const capturesMovementsRefundDetailPossibleDuplicatesItemSchema = z.object({
  "id": z.string(),
  "amount": z.union([z.string(), z.number()]),
  "date": z.string(),
  "reversedAt": z.union([z.null(), z.string()])
}).passthrough();

const capturesMovementsRefundDetailSchema = z.object({
  "candidates": z.array(capturesMovementsRefundDetailCandidatesItemSchema),
  "refund": z.union([z.null(), capturesMovementsRefundDetailRefundSchema]),
  "possibleDuplicates": z.array(capturesMovementsRefundDetailPossibleDuplicatesItemSchema)
}).passthrough();

const capturesMovementsMoneyDetailPostingExpenseSchema = z.object({
  "id": z.string(),
  "amount": z.union([z.string(), z.number()]),
  "paymentMethod": z.union([z.literal("CASH"), z.literal("CARD"), z.literal("DEBIT")]),
  "debitAccountId": z.union([z.null(), z.string()]),
  "concept": z.string()
}).passthrough();

const capturesMovementsMoneyDetailPostingCardPaymentCycleCardSchema = z.object({
  "name": z.string()
}).passthrough();

const capturesMovementsMoneyDetailPostingCardPaymentCycleSchema = z.object({
  "card": capturesMovementsMoneyDetailPostingCardPaymentCycleCardSchema,
  "month": z.number(),
  "year": z.number()
}).passthrough();

const capturesMovementsMoneyDetailPostingCardPaymentSchema = z.object({
  "cycle": capturesMovementsMoneyDetailPostingCardPaymentCycleSchema,
  "id": z.string(),
  "createdAt": z.string().optional(),
  "userId": z.string().optional(),
  "cycleId": z.string(),
  "amount": z.union([z.string(), z.number()]),
  "date": z.string(),
  "reversedAt": z.union([z.null(), z.string()]),
  "accountId": z.string()
}).passthrough();

const capturesMovementsMoneyDetailPostingTransferSchema = z.object({
  "id": z.string(),
  "createdAt": z.string().optional(),
  "userId": z.string().optional(),
  "amount": z.union([z.string(), z.number()]),
  "date": z.string(),
  "concept": z.string(),
  "reversedAt": z.union([z.null(), z.string()]),
  "fromAccountId": z.string(),
  "toAccountId": z.string()
}).passthrough();

const capturesMovementsMoneyDetailPostingWithdrawalSchema = z.object({
  "id": z.string(),
  "createdAt": z.string().optional(),
  "userId": z.string().optional(),
  "amount": z.union([z.string(), z.number()]),
  "date": z.string(),
  "concept": z.string(),
  "reversedAt": z.union([z.null(), z.string()]),
  "accountId": z.string()
}).passthrough();

const capturesMovementsMoneyDetailPostingSchema = z.object({
  "expense": z.union([z.null(), capturesMovementsMoneyDetailPostingExpenseSchema]),
  "cardPayment": z.union([z.null(), capturesMovementsMoneyDetailPostingCardPaymentSchema]),
  "transfer": z.union([z.null(), capturesMovementsMoneyDetailPostingTransferSchema]),
  "withdrawal": z.union([z.null(), capturesMovementsMoneyDetailPostingWithdrawalSchema]),
  "id": z.string(),
  "createdAt": z.string().optional(),
  "userId": z.string().optional(),
  "expenseId": z.union([z.null(), z.string()]),
  "movementId": z.string(),
  "kind": z.string(),
  "sourceKey": z.string(),
  "transferId": z.union([z.null(), z.string()]),
  "withdrawalId": z.union([z.null(), z.string()]),
  "cardPaymentId": z.union([z.null(), z.string()]),
  "originalRecordId": z.string(),
  "snapshot": captureSnapshotSchema,
}).passthrough();

const capturesMovementsMoneyDetailCyclesItemCardSchema = z.object({
  "name": z.string()
}).passthrough();

const capturesMovementsMoneyDetailCyclesItemSchema = z.object({
  "id": z.string(),
  "card": capturesMovementsMoneyDetailCyclesItemCardSchema,
  "month": z.number(),
  "year": z.number(),
  "statementAmount": z.union([z.null(), z.union([z.string(), z.number()])]),
  "paidAmount": z.union([z.null(), z.union([z.string(), z.number()])]),
  "postCutCreditAmount": z.union([z.string(), z.number()])
}).passthrough();

const capturesMovementsMoneyDetailSchema = z.object({
  "posting": z.union([z.null(), capturesMovementsMoneyDetailPostingSchema]),
  "cycles": z.array(capturesMovementsMoneyDetailCyclesItemSchema)
}).passthrough();

const capturesMovementsMovementEventsItemSchema = z.object({
  "fields": z.record(z.string(), z.string()),
  "id": z.string(),
  "sourcePackage": z.string(),
  "postedAt": z.string(),
  "receivedAt": z.string()
}).passthrough();

const capturesMovementsMovementSchema = z.object({
  "events": z.array(capturesMovementsMovementEventsItemSchema),
  "id": z.string(),
  "createdAt": z.string().optional(),
  "userId": z.string().optional(),
  "cardId": z.union([z.null(), z.string()]),
  "status": z.string(),
  "amount": z.union([z.null(), z.union([z.string(), z.number()])]),
  "expenseId": z.union([z.null(), z.string()]),
  "parserKey": z.union([z.null(), z.string()]),
  "reason": z.string(),
  "proposal": captureProposalSchema,
  "correction": captureProposalSchema.nullable(),
  "analysisHistory": z.array(z.unknown()).nullable(),
  "operationDate": z.union([z.null(), z.string()]),
  "referenceKey": z.union([z.null(), z.string()]),
  "originalExpenseId": z.union([z.null(), z.string()]),
  "installmentPurchaseId": z.union([z.null(), z.string()]),
  "resolvedAt": z.union([z.null(), z.string()]),
  "fallbackDueAt": z.union([z.null(), z.string()])
}).passthrough();

const capturesMovementsCandidatesItemSchema = z.object({
  "type": z.enum(["EXPENSE", "INSTALLMENT"]),
  "date": z.string().optional(),
  "amount": z.union([z.string(), z.number()]).optional(),
  "id": z.string(),
  "concept": z.string()
}).passthrough();

const capturesMovementsCandidatesItemSchema2 = z.object({
  "type": z.string(),
  "id": z.string(),
  "expenseId": z.union([z.null(), z.string()]),
  "deleted": z.boolean()
}).passthrough();

const capturesMovementsSchema = z.object({
  "paymentDetail": z.union([z.undefined(), capturesMovementsPaymentDetailSchema]).optional(),
  "refundDetail": z.union([z.undefined(), capturesMovementsRefundDetailSchema]).optional(),
  "moneyDetail": z.union([z.undefined(), capturesMovementsMoneyDetailSchema]).optional(),
  "movement": capturesMovementsMovementSchema,
  "candidates": z.array(z.union([capturesMovementsCandidatesItemSchema, capturesMovementsCandidatesItemSchema2]))
}).passthrough();

const capturesMovementsMovementsItemInstallmentPurchaseSchema = z.object({
  "id": z.string(),
  "concept": z.string(),
  "reconciliationStatus": z.string(),
  "reconciledAt": z.union([z.null(), z.string()])
}).passthrough();

const capturesMovementsMovementsItemEventsItemSchema = z.object({
  "fields": z.record(z.string(), z.string()),
  "sourcePackage": z.string(),
  "receivedAt": z.string()
}).passthrough();

const capturesMovementsMovementsItemExpenseSchema = z.object({
  "id": z.string(),
  "concept": z.string(),
  "reconciliationStatus": z.string(),
  "reconciledAt": z.union([z.null(), z.string()])
}).passthrough();

const capturesMovementsMovementsItemSchema = z.object({
  "kind": z.string(),
  "inboxState": z.string(),
  "installmentPurchase": z.union([z.null(), capturesMovementsMovementsItemInstallmentPurchaseSchema]),
  "events": z.array(capturesMovementsMovementsItemEventsItemSchema),
  "expense": z.union([z.null(), capturesMovementsMovementsItemExpenseSchema]),
  "id": z.string(),
  "createdAt": z.string().optional(),
  "userId": z.string().optional(),
  "cardId": z.union([z.null(), z.string()]),
  "status": z.string(),
  "amount": z.union([z.null(), z.union([z.string(), z.number()])]),
  "expenseId": z.union([z.null(), z.string()]),
  "parserKey": z.union([z.null(), z.string()]),
  "reason": z.string(),
  "proposal": captureProposalSchema,
  "correction": captureProposalSchema.nullable(),
  "analysisHistory": z.array(z.unknown()).nullable(),
  "operationDate": z.union([z.null(), z.string()]),
  "referenceKey": z.union([z.null(), z.string()]),
  "originalExpenseId": z.union([z.null(), z.string()]),
  "installmentPurchaseId": z.union([z.null(), z.string()]),
  "resolvedAt": z.union([z.null(), z.string()]),
  "fallbackDueAt": z.union([z.null(), z.string()])
}).passthrough();

const capturesMovementsSchema2 = z.object({
  "movements": z.array(capturesMovementsMovementsItemSchema),
  "pendingCounts": z.record(z.string(), z.number()),
  "nextCursor": z.union([z.null(), z.string()])
}).passthrough();

const capturesReconciliationPeriodSchema = z.object({
  "cardId": z.string(),
  "startDate": z.string(),
  "endDate": z.string()
}).passthrough();

const capturesReconciliationStatementSchema = z.object({
  "operations": z.union([z.null(), z.string(), z.number(), z.literal(false), z.literal(true), z.record(z.string(), z.union([z.undefined(), z.null(), z.string(), z.number(), z.literal(false), z.literal(true), z.json(), z.array(z.json())])), z.array(z.json())]).optional(),
  "id": z.string(),
  "userId": z.string().optional(),
  "notes": z.string(),
  "updatedAt": z.string().optional(),
  "cardId": z.string(),
  "startDate": z.string(),
  "endDate": z.string(),
  "chargesTotal": z.union([z.null(), z.string()]),
  "matches": z.union([z.null(), z.string(), z.number(), z.literal(false), z.literal(true), z.record(z.string(), z.union([z.undefined(), z.null(), z.string(), z.number(), z.literal(false), z.literal(true), z.json(), z.array(z.json())])), z.array(z.json())]).optional()
}).passthrough();

const capturesReconciliationRecordsItemSchema = z.object({
  "matched": z.boolean(),
  "changed": z.boolean(),
  "type": z.string(),
  "chargeAmount": z.union([z.string(), z.number()]),
  "fingerprint": z.string(),
  "id": z.string(),
  "createdAt": z.string().optional(),
  "userId": z.string().optional(),
  "notes": z.union([z.null(), z.string()]),
  "updatedAt": z.string().optional(),
  "cardId": z.union([z.null(), z.string()]),
  "amount": z.union([z.string(), z.number()]),
  "date": z.string(),
  "paymentMethod": z.union([z.literal("CASH"), z.literal("CARD"), z.literal("DEBIT")]),
  "debitAccountId": z.union([z.null(), z.string()]),
  "concept": z.string(),
  "refundOriginalAmount": z.union([z.null(), z.union([z.string(), z.number()])]),
  "cashContributionAmount": z.union([z.string(), z.number()]),
  "categoryId": z.string(),
  "personId": z.union([z.null(), z.string()]),
  "receivableAccountId": z.union([z.null(), z.string()]),
  "payableAccountId": z.union([z.null(), z.string()]),
  "subscriptionId": z.union([z.null(), z.string()]),
  "reconciliationStatus": z.string(),
  "reconciledAt": z.union([z.null(), z.string()]),
  "loanBalanceAfterPayment": z.union([z.null(), z.string()]),
  "loanInterestAmount": z.union([z.null(), z.union([z.string(), z.number()])]),
  "loanPrincipalAmount": z.union([z.null(), z.union([z.string(), z.number()])])
}).passthrough();

const capturesReconciliationRecordsItemSchema2 = z.object({
  "matched": z.boolean(),
  "changed": z.boolean(),
  "type": z.string(),
  "chargeAmount": z.union([z.string(), z.number()]),
  "date": z.string(),
  "fingerprint": z.string(),
  "id": z.string(),
  "createdAt": z.string().optional(),
  "userId": z.string().optional(),
  "notes": z.union([z.null(), z.string()]),
  "updatedAt": z.string().optional(),
  "cardId": z.string(),
  "status": z.union([z.literal("ACTIVE"), z.literal("PAID_OFF"), z.literal("CANCELLED"), z.literal("ADJUSTED")]),
  "concept": z.string(),
  "categoryId": z.string(),
  "personId": z.union([z.null(), z.string()]),
  "receivableAccountId": z.union([z.null(), z.string()]),
  "reconciliationStatus": z.string(),
  "reconciledAt": z.union([z.null(), z.string()]),
  "purchaseDate": z.string(),
  "totalAmount": z.union([z.string(), z.number()]),
  "months": z.number(),
  "manualMonthlyPayment": z.union([z.null(), z.union([z.string(), z.number()])]),
  "statementReconciliations": z.json().nullish(),
  "initialPaymentsMade": z.number()
}).passthrough();

const capturesReconciliationPilotEvidenceByRecordItemSchema = z.object({
  "type": z.string(),
  "id": z.string(),
  "count": z.number()
}).passthrough();

const capturesReconciliationPilotSchema = z.object({
  "automaticFormats": z.array(z.string()),
  "records": z.number(),
  "confirmedRecords": z.number(),
  "recordsWithEvidence": z.number(),
  "recordsWithoutEvidence": z.number(),
  "confirmedWithoutEvidence": z.number(),
  "linkedEvents": z.number(),
  "additionalEvidence": z.number(),
  "pendingMovements": z.number(),
  "unresolvedCoincidences": z.number(),
  "correctedProposals": z.number(),
  "deletedExpenseLinks": z.number(),
  "missingRecordsAdded": z.number(),
  "unassignedSourceEvents": z.number(),
  "undatedCardMovements": z.number(),
  "evidenceByRecord": z.array(capturesReconciliationPilotEvidenceByRecordItemSchema)
}).passthrough();

const capturesReconciliationSchema = z.object({
  "period": capturesReconciliationPeriodSchema,
  "statement": z.union([z.null(), capturesReconciliationStatementSchema]),
  "records": z.array(z.union([capturesReconciliationRecordsItemSchema, capturesReconciliationRecordsItemSchema2])),
  "pilot": capturesReconciliationPilotSchema,
  "total": z.string(),
  "confirmed": z.string(),
  "difference": z.union([z.null(), z.string()])
}).passthrough();

export const uiResponseSchemas = {
"cards": cardsSchema,
"card-cycles": z.union([cardCyclesSchema, cardCyclesSchema2]),
"expenses": expensesSchema,
"gastos/bootstrap": gastosBootstrapSchema,
"incomes": incomesSchema,
"subscriptions": subscriptionsSchema,
"subscription-charges": z.union([subscriptionChargesSchema, subscriptionChargesSchema2, subscriptionChargesSchema3, subscriptionChargesSchema4]),
"installment-purchases": installmentPurchasesSchema,
"receivables": receivablesSchema,
"payables": payablesSchema,
"dashboard": dashboardSchema,
"settings": settingsSchema,
"captures/devices": z.union([capturesDevicesSchema, capturesDevicesSchema2, capturesDevicesSchema3, capturesDevicesSchema4, capturesDevicesSchema5, capturesDevicesSchema6]),
"captures/configuration": capturesConfigurationSchema,
"captures/movements": z.union([capturesMovementsSchema, capturesMovementsSchema2]),
"captures/reconciliation": capturesReconciliationSchema,
"calendar/google": z.object({ configured: z.boolean(), status: z.enum(['CONNECTED','DISCONNECTED','RECONNECT_REQUIRED','DISCONNECTING']), email: z.string().nullable(), preferences: z.object({ types: z.array(z.enum(['cuts','cardPayments','subscriptions','receivables','payables'])), showAmounts: z.boolean(), reminders: z.boolean() }), lastSyncedAt: z.string().nullable(), pending: z.boolean(), syncing: z.boolean(), error: z.string().nullable(), calendarUrl: z.string().nullable() })
};
export type UiResource = keyof typeof uiResponseSchemas;
export type UiResponse<K extends UiResource> = z.output<(typeof uiResponseSchemas)[K]>;

export const subscriptionChargeResultSchema = z.object({ charges: z.array(subscriptionChargesChargesItemSchema).default([]), alreadyConfirmed: z.boolean().optional(), error: z.string().optional() }).passthrough();

export const captureDeviceResultSchema = capturesDevicesSchema3;
