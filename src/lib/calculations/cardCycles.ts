import type { FinancialCycle, FinancialExpense, FinancialSubscription, FinancialPurchase, DateValue, MoneyValue } from './types';
import { getCycleCreditAmounts } from "./cardCredits";
import { getSubscriptionStatementAmount } from "./subscriptionStatements";
import { isSubscriptionChargeResolved } from "../subscriptionCharges";
import {
  getInstallmentStatementForCycle,
  getStatementCycleNumber,
} from "./installmentStatements";

// Los campos de fecha representan días, independientemente de la hora guardada.
function cycleDay(value: DateValue | null | undefined) {
  if (value === null || value === undefined) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

function cycleInRange(value: DateValue, start: DateValue, end: DateValue) {
  const day = cycleDay(value);
  return day !== null && day >= cycleDay(start)! && day <= cycleDay(end)!;
}

function cycleMoney(value: MoneyValue) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function cycleSum(items: { amount: number }[]) {
  return items.reduce((sum, item) => sum + Math.round(item.amount * 100), 0) / 100;
}

function cycleChargeDate(year: number, monthIndex: number, day: number) {
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, monthIndex, Math.min(Number(day), lastDay), 12));
}

export function getMonthlyPaymentUsed(purchase: FinancialPurchase, cycle?: Pick<FinancialCycle, "year" | "month">) {
  const statement = cycle && getInstallmentStatementForCycle(purchase, cycle);
  if (statement) return cycleMoney(Number(statement.amount));
  const months = Number(purchase.months || 0);
  if (!months) return 0;
  const manual = Number(purchase.manualMonthlyPayment || 0);
  return cycleMoney(manual > 0 ? manual : Number(purchase.totalAmount || 0) / months);
}

export function getPurchaseCycleNumber(purchase: FinancialPurchase, targetCycle: Pick<FinancialCycle, "year" | "month" | "card" | "cutDate" | "cardId">) {
  const verifiedNumber = getStatementCycleNumber(purchase, targetCycle);
  if (verifiedNumber !== null) return verifiedNumber;
  const date = new Date(purchase.purchaseDate);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const cutDay = Number(targetCycle.card?.usualCutDay) || date.getUTCDate();
  const afterCut = cycleDay(date)! > cycleDay(cycleChargeDate(year, month, cutDay))!;
  const firstIndex = year * 12 + month + Number(afterCut);
  return targetCycle.year * 12 + targetCycle.month - 1 - firstIndex + 1;
}

export function shouldIncludePurchaseInCycle(purchase: FinancialPurchase, targetCycle: Pick<FinancialCycle, "year" | "month" | "card" | "cutDate" | "cardId">) {
  if (purchase.cardId !== targetCycle.cardId) return false;
  if (!["ACTIVE", "PAID_OFF"].includes(purchase.status)) return false;
  const purchaseDay = cycleDay(purchase.purchaseDate);
  const cutDay = cycleDay(targetCycle.cutDate);
  if (!purchaseDay || !cutDay || purchaseDay > cutDay) return false;
  if (purchase.status === "PAID_OFF" && cutDay >= cycleDay(new Date())!) return false;
  const number = getPurchaseCycleNumber(purchase, targetCycle);
  return number >= 1 && number <= Number(purchase.months || 0);
}

export function getSubscriptionChargeDatesInsideCycle(subscription: FinancialSubscription, cycle: FinancialCycle) {
  const start = new Date(cycle.startDate);
  const end = new Date(cycle.cutDate);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return [];
  const firstIndex = start.getUTCFullYear() * 12 + start.getUTCMonth();
  const lastIndex = end.getUTCFullYear() * 12 + end.getUTCMonth();
  const subscriptionStart = Number(subscription.startYear || cycle.year) * 12
    + Number(subscription.startMonth || cycle.month) - 1;
  const frequency = Number(subscription.frequencyMonths || 1);
  if (!Number.isInteger(frequency) || frequency < 1) return [];
  const charges = [];
  for (let index = firstIndex; index <= lastIndex; index += 1) {
    if (index < subscriptionStart || (index - subscriptionStart) % frequency !== 0) continue;
    const date = cycleChargeDate(Math.floor(index / 12), index % 12, subscription.chargeDay);
    if (isSubscriptionChargeResolved(subscription, cycleDay(date)!.slice(0, 7))) continue;
    if (!cycleInRange(date, cycle.startDate, cycle.cutDate)) continue;
    if (!subscription.isActive && (!cycleDay(subscription.deactivatedAt)
      || cycleDay(date)! > cycleDay(subscription.deactivatedAt)!)) continue;
    charges.push(date);
  }
  return charges;
}

export function calculateCycleAmount({
  cycle,
  expenses = [],
  subscriptions = [],
  purchases = [],
  expensesByCardId,
  subscriptionsByCardId,
  purchasesByCardId,
  includeBreakdown = true,
}: { cycle: FinancialCycle; expenses?: FinancialExpense[]; subscriptions?: FinancialSubscription[]; purchases?: FinancialPurchase[]; expensesByCardId?: Map<string | null, FinancialExpense[]>; subscriptionsByCardId?: Map<string | null, FinancialSubscription[]>; purchasesByCardId?: Map<string, FinancialPurchase[]>; includeBreakdown?: boolean }) {
  const cardExpenses = (expensesByCardId?.get(cycle.cardId) || expenses)
    .filter((expense) => expense.cardId === cycle.cardId
      && (!expense.paymentMethod || expense.paymentMethod === "CARD"));
  const cardSubscriptions = (subscriptionsByCardId?.get(cycle.cardId) || subscriptions)
    .filter((subscription) => subscription.cardId === cycle.cardId && subscription.paymentMethod === "CARD");
  const cardPurchases = (purchasesByCardId?.get(cycle.cardId) || purchases)
    .filter((purchase) => purchase.cardId === cycle.cardId);

  const includedExpenses = cardExpenses
    .filter((expense) => cycleInRange(expense.date, cycle.startDate, cycle.cutDate))
    .map((expense) => ({
      id: expense.id,
      concept: expense.concept,
      amount: cycleMoney(expense.amount),
      cashContributionAmount: cycleMoney(expense.cashContributionAmount),
      date: expense.date,
      categoryName: expense.category?.name || null,
      reconciliationStatus: expense.reconciliationStatus, reconciledAt: expense.reconciledAt, captureMovements: expense.captureMovements,
    }));

  // Un cargo registrado sustituye la previsión de su mes incluso cuando la
  // fecha efectiva de contabilización lo sitúa al otro lado del corte.
  const recordedSubscriptionMonths = new Set(cardExpenses
    .filter((expense) => expense.subscriptionId && cycleDay(expense.date))
    .map((expense) => `${expense.subscriptionId}:${expense.subscriptionCharge?.month || cycleDay(expense.date)!.slice(0, 7)}`));
  const includedSubscriptions = cardSubscriptions.flatMap((subscription) =>
    getSubscriptionChargeDatesInsideCycle(subscription, cycle)
      .filter((date) => !recordedSubscriptionMonths.has(`${subscription.id}:${cycleDay(date)!.slice(0, 7)}`))
      .map((chargeDate) => ({
        id: `${subscription.id}-${chargeDate.toISOString()}`,
        subscriptionId: subscription.id,
        name: subscription.name,
        amount: cycleMoney(getSubscriptionStatementAmount(subscription, cycle, chargeDate)),
        chargeDate,
        categoryName: subscription.category?.name || null,
      })),
  );

  const includedPurchases = cardPurchases
    .filter((purchase) => shouldIncludePurchaseInCycle(purchase, cycle))
    .map((purchase) => ({
      id: purchase.id,
      concept: purchase.concept,
      amount: getMonthlyPaymentUsed(purchase, cycle),
      totalAmount: Number(purchase.totalAmount || 0),
      purchaseDate: purchase.purchaseDate,
      months: purchase.months,
      currentMonth: getPurchaseCycleNumber(purchase, cycle),
      initialPaymentsMade: purchase.initialPaymentsMade,
      categoryName: purchase.category?.name || null,
      reconciliationStatus: purchase.reconciliationStatus, reconciledAt: purchase.reconciledAt, captureMovements: purchase.captureMovements,
    }));

  const expensesAmount = cycleSum(includedExpenses);
  const cashContributionsAmount = cycleSum(includedExpenses.map(expense => ({ amount: expense.cashContributionAmount })));
  const subscriptionsAmount = cycleSum(includedSubscriptions);
  const purchasesAmount = cycleSum(includedPurchases);
  const { grossCalculatedAmount, creditsAmount, calculatedAmount, includedCredits } =
    getCycleCreditAmounts(cycle, cycleSum([
      { amount: expensesAmount }, { amount: subscriptionsAmount }, { amount: purchasesAmount },
    ]));
  const statementAmount = cycle.statementAmount !== null && cycle.statementAmount !== undefined
    ? Number(cycle.statementAmount) : null;
  return {
    expensesAmount,
    cashContributionsAmount,
    subscriptionsAmount,
    purchasesAmount,
    grossCalculatedAmount,
    creditsAmount,
    credits: undefined,
    calculatedAmount,
    statementAmount,
    difference: statementAmount === null ? null
      : (Math.round(statementAmount * 100) - Math.round(calculatedAmount * 100)) / 100,
    ...(includeBreakdown ? { includedExpenses, includedSubscriptions, includedPurchases, includedCredits } : {}),
  };
}
