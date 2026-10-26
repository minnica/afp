import { buildDateFromDay, shouldIncludeSubscriptionInMonth, buildDashboardPayments, buildImportantNotices } from "@/lib/importantNotices";
import { getDebtAccountState } from "@/lib/calculations/debtAccounts";
import { sumPersonalExpenses, expenseCents } from "@/lib/sharedExpenses";
import { getCyclePaymentState } from "@/lib/calculations/cardCyclePayments";
import { apiResponse as NextResponse, requireApiUser, apiAccessErrorResponse } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { buildCardUsageWaivers, buildCurrentCardUsageWaivers, buildCardUsageWaiverHistory } from "@/lib/calculations/cardUsageWaivers";
import { cycleCreditSelect } from "@/lib/calculations/cardCredits";
import { getSubscriptionStatementAmount } from "@/lib/calculations/subscriptionStatements";
import { isSubscriptionChargeResolved } from "@/lib/subscriptionCharges";
import { getCyclePeriodWarnings } from "@/lib/calculations/cycleDataQuality";
import {
  calculateCycleAmount,
  getMonthlyPaymentUsed,
  shouldIncludePurchaseInCycle,
} from "@/lib/calculations/cardCycles";

const dashboardCardSelect = {
  usagePolicy: true,
  id: true,
  name: true,
  usualCutDay: true,
  usualDueDay: true,
};

const dashboardCycleSelect = {
  usageReconciliation: true,
  id: true,
  userId: true,
  cardId: true,
  month: true,
  year: true,
  startDate: true,
  cutDate: true,
  dueDate: true,
  statementAmount: true,
  status: true,
  paidAt: true,
  paidAmount: true,
  postCutCreditAmount: true,
  postCutCreditDate: true,
  postCutCreditNotes: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  credits: {
    select: cycleCreditSelect,
    orderBy: { createdAt: "asc" },
  },
  card: {
    select: dashboardCardSelect,
  },
};

const dashboardExpenseSelect = {
  reconciliationStatus: true,
  subscriptionCharge: { select: { month: true } },
  notes: true,
  paymentMethod: true,
  subscriptionId: true,
  id: true,
  concept: true,
  date: true,
  amount: true,
  cashContributionAmount: true,
  cardId: true,
  categoryId: true,
  category: {
    select: {
      name: true,
    },
  },
};

const dashboardSubscriptionSelect = {
  charges: { select: { month: true, status: true, expenseId: true } },
  id: true,
  name: true,
  amount: true,
  paymentMethod: true,
  cardId: true,
  categoryId: true,
  chargeDay: true,
  frequencyMonths: true,
  startMonth: true,
  startYear: true,
  isActive: true,
  deactivatedAt: true,
  category: {
    select: {
      name: true,
    },
  },
  dailyExpenses: {
    select: {
      id: true,
      date: true,
      subscriptionCharge: { select: { month: true } },
    },
  },
};

const dashboardPurchaseSelect = {
  reconciliationStatus: true,
  card: { select: { usualCutDay: true } },
  id: true,
  cardId: true,
  categoryId: true,
  concept: true,
  purchaseDate: true,
  totalAmount: true,
  months: true,
  manualMonthlyPayment: true,
  statementReconciliations: true,
  initialPaymentsMade: true,
  status: true,
  category: {
    select: {
      name: true,
    },
  },
};

function groupBy(items, getKey) {
  const map = new Map();

  for (const item of items) {
    const key = getKey(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }

  return map;
}

function getExpenseMonthKey(expense) {
  const date = new Date(expense.date);
  return `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}`;
}

function getMonthKey(year, month) {
  return `${year}-${month}`;
}

function getMonthStart(date) {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), 1, 0, 0, 0));
}

function getMonthEnd(date) {
  return new Date(
    Date.UTC(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59),
  );
}

function isDateInsideRange(date, startDate, endDate) {
  const value = new Date(date).getTime();
  return (
    value >= new Date(startDate).getTime() &&
    value <= new Date(endDate).getTime()
  );
}

function isSubscriptionChargeableInMonth(subscription, year, month) {
  if (isSubscriptionChargeResolved(subscription, `${year}-${String(month).padStart(2, "0")}`)) return false;
  if (!shouldIncludeSubscriptionInMonth(subscription, year, month)) return false;
  if (subscription.isActive) return true;
  if (!subscription.deactivatedAt) return false;
  const chargeDate = buildDateFromDay(year, month, Number(subscription.chargeDay));
  return chargeDate.toISOString().slice(0, 10) <= new Date(subscription.deactivatedAt).toISOString().slice(0, 10);
}

function getReceivableAmounts(receivable) {
  return getDebtAccountState(receivable, receivable.incomes);
}

function shouldIncludePurchaseInMonth(purchase, targetYear, targetMonth) {
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const cutDay = Math.min(Number(purchase.card?.usualCutDay || lastDay), lastDay);
  return shouldIncludePurchaseInCycle(purchase, {
    cardId: purchase.cardId,
    card: purchase.card,
    year: targetYear,
    month: targetMonth,
    cutDate: new Date(Date.UTC(targetYear, targetMonth - 1, cutDay, 12)),
  });
}

// El gasto real reemplaza la previsión aunque haya cambiado de método o categoría.
function getMonthlySubscriptions(subscriptions, expenses, cycles, year, month) {
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  const recordedIds = new Set(expenses
    .filter((expense) => expense.subscriptionId && (expense.subscriptionCharge
      ? expense.subscriptionCharge.month === monthKey : new Date(expense.date).toISOString().startsWith(monthKey)))
    .map((expense) => expense.subscriptionId));
  return subscriptions
    .filter((subscription) => isSubscriptionChargeableInMonth(subscription, year, month) && !recordedIds.has(subscription.id))
    .map((subscription) => {
      const date = buildDateFromDay(year, month, Number(subscription.chargeDay));
      const day = date.toISOString().slice(0, 10);
      const cycle = cycles.find((item) => item.cardId === subscription.cardId
        && day >= new Date(item.startDate).toISOString().slice(0, 10)
        && day <= new Date(item.cutDate).toISOString().slice(0, 10));
      const amount = cycle ? getSubscriptionStatementAmount(subscription, cycle, date) : Number(subscription.amount);
      return { ...subscription, amount };
    });
}

function buildCategoryBreakdown({ categories, expenses, subscriptions, purchases, cycles = [], year, month }) {
  subscriptions = getMonthlySubscriptions(subscriptions, expenses, cycles, year, month);
  const monthStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59));

  const monthlyExpenses = expenses.filter((expense) =>
    isDateInsideRange(expense.date, monthStart, monthEnd),
  );

  const activePurchasesForMonth = purchases.filter((p) =>
    shouldIncludePurchaseInMonth(p, year, month),
  );

  const subscriptionsTotal = subscriptions
    .filter((s) => isSubscriptionChargeableInMonth(s, year, month))
    .reduce((sum, s) => sum + Number(s.amount || 0), 0);

  const installmentPurchasesTotal = activePurchasesForMonth.reduce(
    (sum, p) => sum + getMonthlyPaymentUsed(p, { year, month }),
    0,
  );

  const dailyExpensesTotal = sumPersonalExpenses(monthlyExpenses);
  const monthlyExpenseTotal = dailyExpensesTotal + subscriptionsTotal + installmentPurchasesTotal;

  return categories
    .map((category) => {
      const catDaily = sumPersonalExpenses(monthlyExpenses.filter((e) => e.categoryId === category.id));

      const catSubs = subscriptions
        .filter((s) => s.categoryId === category.id)
        .filter((s) => isSubscriptionChargeableInMonth(s, year, month))
        .reduce((sum, s) => sum + Number(s.amount || 0), 0);

      const catPurchases = activePurchasesForMonth
        .filter((p) => p.categoryId === category.id)
        .reduce((sum, p) => sum + getMonthlyPaymentUsed(p, { year, month }), 0);

      const total = catDaily + catSubs + catPurchases;
      const percentage = monthlyExpenseTotal > 0 ? (total / monthlyExpenseTotal) * 100 : 0;

      return { id: category.id, name: category.name, total, percentage };
    })
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);
}

const MONTH_NAMES_FULL_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function buildWeeklyComparison({ expenses, subscriptions = [], purchases = [], cycles = [], currentYear, currentMonth, categoryId = null }) {
  const filteredExpenses = categoryId
    ? expenses.filter((e) => e.categoryId === categoryId)
    : expenses;

  const filteredSubscriptions = categoryId
    ? subscriptions.filter((s) => s.categoryId === categoryId)
    : subscriptions;

  const filteredPurchases = categoryId
    ? purchases.filter((p) => p.categoryId === categoryId)
    : purchases;

  const prevDate = new Date(Date.UTC(currentYear, currentMonth - 2, 1));
  const prevYear = prevDate.getUTCFullYear();
  const prevMonth = prevDate.getUTCMonth() + 1;

  const prevMonthDays = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate();
  const currMonthDays = new Date(Date.UTC(currentYear, currentMonth, 0)).getUTCDate();
  const maxDays = Math.max(prevMonthDays, currMonthDays);

  const prevMonthStart = new Date(Date.UTC(prevYear, prevMonth - 1, 1, 0, 0, 0));
  const prevMonthEnd = new Date(Date.UTC(prevYear, prevMonth - 1, prevMonthDays, 23, 59, 59));
  const currMonthStart = new Date(Date.UTC(currentYear, currentMonth - 1, 1, 0, 0, 0));
  const currMonthEnd = new Date(Date.UTC(currentYear, currentMonth - 1, currMonthDays, 23, 59, 59));

  const prevSubscriptions = getMonthlySubscriptions(filteredSubscriptions, expenses, cycles, prevYear, prevMonth);
  const currSubscriptions = getMonthlySubscriptions(filteredSubscriptions, expenses, cycles, currentYear, currentMonth);
  const prevSubsTotal = prevSubscriptions.reduce((sum, s) => sum + Number(s.amount || 0), 0);
  const currSubsTotal = currSubscriptions.reduce((sum, s) => sum + Number(s.amount || 0), 0);

  const prevPurchasesTotal = filteredPurchases
    .filter((p) => shouldIncludePurchaseInMonth(p, prevYear, prevMonth))
    .reduce((sum, p) => sum + getMonthlyPaymentUsed(p, { year: prevYear, month: prevMonth }), 0);

  const currPurchasesTotal = filteredPurchases
    .filter((p) => shouldIncludePurchaseInMonth(p, currentYear, currentMonth))
    .reduce((sum, p) => sum + getMonthlyPaymentUsed(p, { year: currentYear, month: currentMonth }), 0);

  const prevMonthTotal =
    sumPersonalExpenses(filteredExpenses.filter((e) => isDateInsideRange(e.date, prevMonthStart, prevMonthEnd))) +
    prevSubsTotal +
    prevPurchasesTotal;

  const currMonthTotal =
    sumPersonalExpenses(filteredExpenses.filter((e) => isDateInsideRange(e.date, currMonthStart, currMonthEnd))) +
    currSubsTotal +
    currPurchasesTotal;

  const weekRanges = [
    { week: 1, startDay: 1, endDay: 7 },
    { week: 2, startDay: 8, endDay: 14 },
    { week: 3, startDay: 15, endDay: 21 },
    { week: 4, startDay: 22, endDay: 28 },
    { week: 5, startDay: 29, endDay: maxDays },
  ].filter((w) => w.startDay <= maxDays);

  const weeks = weekRanges.map(({ week, startDay, endDay }) => {
    const prevEnd = Math.min(endDay, prevMonthDays);
    const currEnd = Math.min(endDay, currMonthDays);

    const prevDailyTotal =
      startDay <= prevMonthDays
        ? sumPersonalExpenses(filteredExpenses
            .filter((e) =>
              isDateInsideRange(
                e.date,
                new Date(Date.UTC(prevYear, prevMonth - 1, startDay, 0, 0, 0)),
                new Date(Date.UTC(prevYear, prevMonth - 1, prevEnd, 23, 59, 59)),
              ),
            ))
        : 0;

    const currDailyTotal =
      startDay <= currMonthDays
        ? sumPersonalExpenses(filteredExpenses
            .filter((e) =>
              isDateInsideRange(
                e.date,
                new Date(Date.UTC(currentYear, currentMonth - 1, startDay, 0, 0, 0)),
                new Date(Date.UTC(currentYear, currentMonth - 1, currEnd, 23, 59, 59)),
              ),
            ))
        : 0;

    const prevSubsWeekTotal = prevSubscriptions
      .filter((s) => {
        const day = Math.min(Number(s.chargeDay), prevMonthDays);
        return day >= startDay && day <= prevEnd;
      })
      .reduce((sum, s) => sum + Number(s.amount || 0), 0);

    const currSubsWeekTotal = currSubscriptions
      .filter((s) => {
        const day = Math.min(Number(s.chargeDay), currMonthDays);
        return day >= startDay && day <= currEnd;
      })
      .reduce((sum, s) => sum + Number(s.amount || 0), 0);

    // Compras a meses no tienen día específico en el mes — se asignan a semana 1
    const prevPurchasesWeekTotal =
      week === 1
        ? filteredPurchases
            .filter((p) => shouldIncludePurchaseInMonth(p, prevYear, prevMonth))
            .reduce((sum, p) => sum + getMonthlyPaymentUsed(p, { year: prevYear, month: prevMonth }), 0)
        : 0;

    const currPurchasesWeekTotal =
      week === 1
        ? filteredPurchases
            .filter((p) => shouldIncludePurchaseInMonth(p, currentYear, currentMonth))
            .reduce((sum, p) => sum + getMonthlyPaymentUsed(p, { year: currentYear, month: currentMonth }), 0)
        : 0;

    const prevTotal = prevDailyTotal + prevSubsWeekTotal + prevPurchasesWeekTotal;
    const currTotal = currDailyTotal + currSubsWeekTotal + currPurchasesWeekTotal;

    return { week, label: `Sem ${week}`, startDay, endDay: Math.max(prevEnd, currEnd), prevTotal, currTotal };
  });

  return {
    prevMonthLabel: MONTH_NAMES_FULL_ES[prevMonth - 1],
    currMonthLabel: MONTH_NAMES_FULL_ES[currentMonth - 1],
    prevMonthTotal,
    currMonthTotal,
    weeks,
  };
}

function buildCardMonthlyComparison({ cyclesWithAmounts, cards, currentYear, currentMonth }) {
  const prevDate = new Date(Date.UTC(currentYear, currentMonth - 2, 1));
  const prevYear = prevDate.getUTCFullYear();
  const prevMonth = prevDate.getUTCMonth() + 1;

  const data = cards
    .map((card) => {
      const cardCycles = cyclesWithAmounts.filter((c) => c.cardId === card.id);

      const prevCycle = cardCycles.find((c) => {
        const d = new Date(c.cutDate);
        return d.getUTCFullYear() === prevYear && d.getUTCMonth() + 1 === prevMonth;
      });

      const currCycle = cardCycles.find((c) => {
        const d = new Date(c.cutDate);
        return d.getUTCFullYear() === currentYear && d.getUTCMonth() + 1 === currentMonth;
      });

      const prevGrossAmount = prevCycle
        ? Number(prevCycle.statementAmount ?? prevCycle.calculatedAmount ?? 0)
        : 0;
      const currGrossAmount = currCycle
        ? Number(currCycle.statementAmount ?? currCycle.calculatedAmount ?? 0)
        : 0;

      const prevCashContribution = Number(prevCycle?.cashContributionsAmount || 0);
      const currCashContribution = Number(currCycle?.cashContributionsAmount || 0);
      const prevAmount = Math.max(0, expenseCents(prevGrossAmount) - expenseCents(prevCashContribution)) / 100;
      const currAmount = Math.max(0, expenseCents(currGrossAmount) - expenseCents(currCashContribution)) / 100;

      return {
        cardId: card.id,
        cardName: card.name,
        prevAmount,
        currAmount,
        prevGrossAmount,
        currGrossAmount,
        prevCashContribution,
        currCashContribution,
        prevIsStatement: prevCycle?.statementAmount !== null && prevCycle?.statementAmount !== undefined,
        currIsStatement: currCycle?.statementAmount !== null && currCycle?.statementAmount !== undefined,
      };
    })
    .filter((c) => c.prevAmount > 0 || c.currAmount > 0);

  return {
    prevMonthLabel: MONTH_NAMES_FULL_ES[prevMonth - 1],
    currMonthLabel: MONTH_NAMES_FULL_ES[currentMonth - 1],
    data,
  };
}

export async function GET(request) {
  try {
    const user = await requireApiUser(request);
    const userId = user.id;
    const { searchParams } = new URL(request.url);


    const clientDate = searchParams.get("clientDate");
    const now = clientDate ? new Date(`${clientDate}T12:00:00Z`) : new Date();
    const monthStart = getMonthStart(now);
    const monthEnd = getMonthEnd(now);
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    const [
      cards,
      cardCycles,
      expenses,
      subscriptions,
      purchases,
      incomes,
      categories,
      receivables,
    ] = await Promise.all([
      prisma.card.findMany({
        where: { userId },
        select: dashboardCardSelect,
        orderBy: { name: "asc" },
      }),
      prisma.cardCycle.findMany({
        where: { userId },
        select: dashboardCycleSelect,
        orderBy: [{ year: "asc" }, { month: "asc" }],
      }),
      prisma.dailyExpense.findMany({
        where: { userId },
        select: dashboardExpenseSelect,
      }),
      prisma.subscription.findMany({
        where: { userId },
        select: dashboardSubscriptionSelect,
      }),
      prisma.installmentPurchase.findMany({
        where: { userId },
        select: dashboardPurchaseSelect,
      }),
      prisma.income.findMany({
        where: {
          userId,
          date: {
            gte: monthStart,
            lte: monthEnd,
          },
        },
        select: {
          id: true,
          amount: true,
        },
      }),
      prisma.category.findMany({
        where: { userId },
        select: {
          id: true,
          name: true,
        },
        orderBy: { name: "asc" },
      }),
      prisma.receivableAccount.findMany({
        where: { userId },
        select: {
          id: true,
          personId: true,
          concept: true,
          originalAmount: true,
          balanceAdjustment: true,
          originDate: true,
          expectedMonthlyPayment: true,
          expectedChargeDays: true,
          status: true,
          person: {
            select: {
              id: true,
              name: true,
            },
          },
          incomes: {
            select: {
              id: true,
              date: true,
              amount: true,
            },
          },
        },
        orderBy: [{ status: "asc" }, { originDate: "desc" }],
      }),
    ]);

    const expensesByCardId = groupBy(
      expenses.filter((expense) => expense.cardId),
      (expense) => expense.cardId,
    );
    const subscriptionsByCardId = groupBy(
      subscriptions.filter((subscription) => subscription.cardId),
      (subscription) => subscription.cardId,
    );
    const purchasesByCardId = groupBy(purchases, (purchase) => purchase.cardId);
    const expensesByMonth = groupBy(expenses, getExpenseMonthKey);
    const getExpensesForMonth = (year, month) => {
      return expensesByMonth.get(getMonthKey(year, month)) || [];
    };
    const getExpensesForComparison = (year, month) => {
      const prevDateForComparison = new Date(Date.UTC(year, month - 2, 1));
      return [
        ...getExpensesForMonth(
          prevDateForComparison.getUTCFullYear(),
          prevDateForComparison.getUTCMonth() + 1,
        ),
        ...getExpensesForMonth(year, month),
      ];
    };

    const cyclesWithAmounts = cardCycles.map((cycle) => {
      const amounts = calculateCycleAmount({
        cycle,
        expenses,
        subscriptions,
        purchases,
        expensesByCardId,
        subscriptionsByCardId,
        purchasesByCardId,
        includeBreakdown: false,
      });

      return {
        ...cycle,
        ...getCyclePaymentState(cycle, now),
        dataWarnings: getCyclePeriodWarnings(cycle, cardCycles),
        ...amounts,
      };
    });

    const payments = buildDashboardPayments(cards, cyclesWithAmounts, now);

    const monthlyExpenses = getExpensesForMonth(currentYear, currentMonth);

    const dailyExpensesTotal = sumPersonalExpenses(monthlyExpenses);

    const subscriptionsTotal = getMonthlySubscriptions(subscriptions, expenses, cardCycles, currentYear, currentMonth)
      .reduce((sum, subscription) => sum + Number(subscription.amount || 0), 0);

    const installmentPurchasesTotal = purchases
      .filter((purchase) => shouldIncludePurchaseInMonth(purchase, currentYear, currentMonth))
      .reduce((sum, purchase) => sum + getMonthlyPaymentUsed(purchase, { year: currentYear, month: currentMonth }), 0);

    const incomeTotal = incomes.reduce((sum, income) => {
      return sum + Number(income.amount || 0);
    }, 0);

    const monthlyExpenseTotal =
      dailyExpensesTotal + subscriptionsTotal + installmentPurchasesTotal;

    const monthlyDifference = incomeTotal - monthlyExpenseTotal;

    const prevDate = new Date(Date.UTC(currentYear, currentMonth - 2, 1));
    const nextDate = new Date(Date.UTC(currentYear, currentMonth, 1));

    const categoryBreakdownPrev = buildCategoryBreakdown({
      categories,
      expenses: getExpensesForMonth(
        prevDate.getUTCFullYear(),
        prevDate.getUTCMonth() + 1,
      ),
      subscriptions,
      purchases,
      cycles: cardCycles,
      year: prevDate.getUTCFullYear(),
      month: prevDate.getUTCMonth() + 1,
    });

    const categoryBreakdownCurrent = buildCategoryBreakdown({
      categories,
      expenses: getExpensesForMonth(currentYear, currentMonth),
      subscriptions,
      purchases,
      cycles: cardCycles,
      year: currentYear,
      month: currentMonth,
    });

    const categoryBreakdownNext = buildCategoryBreakdown({
      categories,
      expenses: getExpensesForMonth(
        nextDate.getUTCFullYear(),
        nextDate.getUTCMonth() + 1,
      ),
      subscriptions,
      purchases,
      cycles: cardCycles,
      year: nextDate.getUTCFullYear(),
      month: nextDate.getUTCMonth() + 1,
    });

    const categoryBreakdownByMonth = {};
    // Enero se compara con diciembre anterior, no con diciembre del mismo año.
    categoryBreakdownByMonth[-1] = buildCategoryBreakdown({
      categories,
      expenses: getExpensesForMonth(currentYear - 1, 12),
      subscriptions,
      purchases,
      cycles: cardCycles,
      year: currentYear - 1,
      month: 12,
    });
    for (let m = 0; m < 12; m++) {
      categoryBreakdownByMonth[m] = buildCategoryBreakdown({
        categories,
        expenses: getExpensesForMonth(currentYear, m + 1),
        subscriptions,
        purchases,
        cycles: cardCycles,
        year: currentYear,
        month: m + 1,
      });
    }

    const weeklyComparisonByMonth = {};
    for (let m = 0; m < 12; m++) {
      weeklyComparisonByMonth[m] = buildWeeklyComparison({
        expenses: getExpensesForComparison(currentYear, m + 1),
        subscriptions,
        purchases,
        cycles: cardCycles,
        currentYear,
        currentMonth: m + 1,
      });
    }

    const weeklyComparisonByCategoryAndMonth = {};
    for (const category of categories) {
      weeklyComparisonByCategoryAndMonth[category.id] = {};
      for (let m = 0; m < 12; m++) {
        weeklyComparisonByCategoryAndMonth[category.id][m] = buildWeeklyComparison({
          expenses: getExpensesForComparison(currentYear, m + 1),
          subscriptions,
          purchases,
          cycles: cardCycles,
          currentYear,
          currentMonth: m + 1,
          categoryId: category.id,
        });
      }
    }

    const activeReceivables = receivables
      .map((receivable) => {
        const amounts = getReceivableAmounts(receivable);

        return {
          ...receivable,
          ...amounts,
        };
      })
      .filter((receivable) => receivable.status === "ACTIVE");

    const cardMonthlyComparisonByMonth = {};
    for (let m = 0; m < 12; m++) {
      cardMonthlyComparisonByMonth[m] = buildCardMonthlyComparison({
        cyclesWithAmounts,
        cards,
        currentYear,
        currentMonth: m + 1,
      });
    }

    const cardUsageWaiversByMonth = {};
    for (let m = 0; m < 12; m++) {
      cardUsageWaiversByMonth[m] = buildCardUsageWaivers({
        now,
        cards,
        cyclesWithAmounts,
        expenses,
        subscriptions,
        purchases,
        cycles: cardCycles,
        year: currentYear,
        month: m + 1,
      });
    }
    const cardUsageWaivers = cardUsageWaiversByMonth[currentMonth - 1] || [];
    const usageArgs = { now, cards, cyclesWithAmounts, expenses, subscriptions, purchases };
    const cardUsageWaiversCurrent = buildCurrentCardUsageWaivers(usageArgs);
    const cardUsageWaiverHistory = buildCardUsageWaiverHistory(usageArgs);

    const importantNotices = buildImportantNotices({ payments, subscriptions, activeReceivables, cyclesWithAmounts, cards, now });

    return NextResponse.json({
      payments,
      cycles: cyclesWithAmounts,
      monthlySummary: {
        incomeTotal,
        dailyExpensesTotal,
        subscriptionsTotal,
        installmentPurchasesTotal,
        monthlyExpenseTotal,
        monthlyDifference,
      },
      categoryBreakdownPrev,
      categoryBreakdownCurrent,
      categoryBreakdownNext,
      categoryBreakdownByMonth,
      weeklyComparisonByMonth,
      weeklyComparisonByCategoryAndMonth,
      cardMonthlyComparisonByMonth,
      cardUsageWaivers,
      cardUsageWaiversByMonth,
      cardUsageWaiversCurrent,
      cardUsageWaiverHistory,
      categories: categories.map((c) => ({ id: c.id, name: c.name })),
      activeReceivables,
      importantNotices,
    });
  } catch (error) {
    const accessResponse = apiAccessErrorResponse(error);
    if (accessResponse) return accessResponse;
    console.error("Error loading dashboard:", error);

    return NextResponse.json(
      { error: "No se pudo cargar el dashboard." },
      { status: 500 },
    );
  }
}
