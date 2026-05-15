import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

function getDaysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function createChargeDate(year, monthIndex, day) {
  const safeDay = Math.min(day, getDaysInMonth(year, monthIndex));
  return new Date(Date.UTC(year, monthIndex, safeDay, 12, 0, 0));
}

function getMonthlyPaymentUsed(purchase) {
  const totalAmount = Number(purchase.totalAmount || 0);
  const months = Number(purchase.months || 0);
  const manual = purchase.manualMonthlyPayment
    ? Number(purchase.manualMonthlyPayment)
    : null;

  if (!months) return 0;

  return manual && manual > 0 ? manual : totalAmount / months;
}

function getPurchaseCycleNumber(purchase, targetCycle, cardCycles) {
  const cyclesForCard = cardCycles
    .filter((cycle) => cycle.cardId === purchase.cardId)
    .sort((a, b) => new Date(a.cutDate) - new Date(b.cutDate));

  const firstCycleIndex = cyclesForCard.findIndex((cycle) =>
    isDateInsideRange(purchase.purchaseDate, cycle.startDate, cycle.cutDate),
  );

  const targetCycleIndex = cyclesForCard.findIndex(
    (cycle) => cycle.id === targetCycle.id,
  );

  if (firstCycleIndex === -1 || targetCycleIndex === -1) return null;
  if (targetCycleIndex < firstCycleIndex) return null;

  return targetCycleIndex - firstCycleIndex + 1;
}

function shouldIncludePurchaseInCycle(purchase, targetCycle, cardCycles) {
  if (purchase.status !== "ACTIVE") return false;

  if (purchase.cardId !== targetCycle.cardId) return false;

  const months = Number(purchase.months || 0);
  const paymentsAlreadyMade = Number(purchase.initialPaymentsMade || 0);
  const remainingMonths = months - paymentsAlreadyMade;

  if (remainingMonths <= 0) return false;

  const purchaseDate = new Date(purchase.purchaseDate).getTime();
  const cycleCutDate = new Date(targetCycle.cutDate).getTime();

  if (purchaseDate > cycleCutDate) return false;

  return true;
}

function getSubscriptionChargeDatesInsideCycle(subscription, cycle) {
  const start = new Date(cycle.startDate);
  const end = new Date(cycle.cutDate);

  const candidates = [
    createChargeDate(
      start.getUTCFullYear(),
      start.getUTCMonth(),
      subscription.chargeDay,
    ),
    createChargeDate(
      end.getUTCFullYear(),
      end.getUTCMonth(),
      subscription.chargeDay,
    ),
  ];

  const uniqueDates = new Map();

  for (const date of candidates) {
    const key = date.toISOString();

    if (isDateInsideRange(date, cycle.startDate, cycle.cutDate)) {
      uniqueDates.set(key, date);
    }
  }

  return Array.from(uniqueDates.values());
}

function calculateCycleAmount({
  cycle,
  expenses,
  subscriptions,
  purchases,
  cardCycles,
}) {
  const expensesAmount = expenses
    .filter((expense) => expense.cardId === cycle.cardId)
    .filter((expense) =>
      isDateInsideRange(expense.date, cycle.startDate, cycle.cutDate),
    )
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

  const subscriptionsAmount = subscriptions
    .filter((subscription) => subscription.paymentMethod === "CARD")
    .filter((subscription) => subscription.cardId === cycle.cardId)
    .reduce((sum, subscription) => {
      const charges = getSubscriptionChargeDatesInsideCycle(
        subscription,
        cycle,
      );
      return sum + charges.length * Number(subscription.amount || 0);
    }, 0);

  const purchasesAmount = purchases
    .filter((purchase) => purchase.cardId === cycle.cardId)
    .filter((purchase) =>
      shouldIncludePurchaseInCycle(purchase, cycle, cardCycles),
    )
    .reduce((sum, purchase) => sum + getMonthlyPaymentUsed(purchase), 0);

  const calculatedAmount =
    expensesAmount + subscriptionsAmount + purchasesAmount;
  const statementAmount = cycle.statementAmount
    ? Number(cycle.statementAmount)
    : null;
  const difference =
    statementAmount !== null ? statementAmount - calculatedAmount : null;

  return {
    expensesAmount,
    subscriptionsAmount,
    purchasesAmount,
    calculatedAmount,
    statementAmount,
    difference,
  };
}

function getDisplayStatus(cycle) {
  const today = new Date();
  const cutDate = new Date(cycle.cutDate);
  const dueDate = new Date(cycle.dueDate);

  if (cycle.paidAt || cycle.paidAmount) return "PAID";
  if (today > dueDate) return "OVERDUE";
  if (today >= cutDate && cycle.statementAmount) return "PAYMENT_PENDING";
  if (today >= cutDate) return "CUT";

  return "OPEN";
}

function getReceivableAmounts(receivable) {
  const paidAmount = receivable.incomes.reduce((sum, income) => {
    return sum + Number(income.amount || 0);
  }, 0);

  const pendingBalance = Number(receivable.originalAmount || 0) - paidAmount;

  return {
    paidAmount,
    pendingBalance,
  };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "Falta userId." }, { status: 400 });
    }

    const now = new Date();
    const monthStart = getMonthStart(now);
    const monthEnd = getMonthEnd(now);

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
        orderBy: { name: "asc" },
      }),
      prisma.cardCycle.findMany({
        where: { userId },
        include: { card: true },
        orderBy: [{ year: "asc" }, { month: "asc" }],
      }),
      prisma.dailyExpense.findMany({
        where: { userId },
        include: { category: true, card: true },
      }),
      prisma.subscription.findMany({
        where: { userId },
        include: { category: true, card: true },
      }),
      prisma.installmentPurchase.findMany({
        where: { userId },
        include: { category: true, card: true },
      }),
      prisma.income.findMany({
        where: {
          userId,
          date: {
            gte: monthStart,
            lte: monthEnd,
          },
        },
        include: { incomeType: true },
      }),
      prisma.category.findMany({
        where: { userId },
        orderBy: { name: "asc" },
      }),
      prisma.receivableAccount.findMany({
        where: { userId },
        include: {
          person: true,
          incomes: true,
        },
        orderBy: [{ status: "asc" }, { originDate: "desc" }],
      }),
    ]);

    const cyclesWithAmounts = cardCycles.map((cycle) => {
      const amounts = calculateCycleAmount({
        cycle,
        expenses,
        subscriptions,
        purchases,
        cardCycles,
      });

      return {
        ...cycle,
        displayStatus: getDisplayStatus(cycle),
        ...amounts,
      };
    });

    const payments = cards.map((card) => {
      const cyclesForCard = cyclesWithAmounts
        .filter((cycle) => cycle.cardId === card.id)
        .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

      const currentIndex = cyclesForCard.findIndex(
        (cycle) => new Date(cycle.dueDate) >= now,
      );

      const safeCurrentIndex =
        currentIndex >= 0
          ? currentIndex
          : Math.max(cyclesForCard.length - 1, 0);

      const previousPayment =
        safeCurrentIndex > 0 ? cyclesForCard[safeCurrentIndex - 1] : null;

      return {
        card,
        previousPayment,
        currentPayment: cyclesForCard[safeCurrentIndex] || null,
        nextPayment: cyclesForCard[safeCurrentIndex + 1] || null,
      };
    });

    const monthlyExpenses = expenses.filter((expense) =>
      isDateInsideRange(expense.date, monthStart, monthEnd),
    );

    const dailyExpensesTotal = monthlyExpenses.reduce((sum, expense) => {
      return sum + Number(expense.amount || 0);
    }, 0);

    const subscriptionsTotal = subscriptions.reduce((sum, subscription) => {
      return sum + Number(subscription.amount || 0);
    }, 0);

    const installmentPurchasesTotal = purchases
      .filter((purchase) => purchase.status === "ACTIVE")
      .reduce((sum, purchase) => {
        return sum + getMonthlyPaymentUsed(purchase);
      }, 0);

    const incomeTotal = incomes.reduce((sum, income) => {
      return sum + Number(income.amount || 0);
    }, 0);

    const monthlyExpenseTotal =
      dailyExpensesTotal + subscriptionsTotal + installmentPurchasesTotal;

    const monthlyDifference = incomeTotal - monthlyExpenseTotal;

    const categoryBreakdown = categories
      .map((category) => {
        const categoryDailyExpenses = monthlyExpenses
          .filter((expense) => expense.categoryId === category.id)
          .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

        const categorySubscriptions = subscriptions
          .filter((subscription) => subscription.categoryId === category.id)
          .reduce(
            (sum, subscription) => sum + Number(subscription.amount || 0),
            0,
          );

        const categoryPurchases = purchases
          .filter((purchase) => purchase.status === "ACTIVE")
          .filter((purchase) => purchase.categoryId === category.id)
          .reduce((sum, purchase) => sum + getMonthlyPaymentUsed(purchase), 0);

        const total =
          categoryDailyExpenses + categorySubscriptions + categoryPurchases;

        const percentage =
          monthlyExpenseTotal > 0 ? (total / monthlyExpenseTotal) * 100 : 0;

        return {
          id: category.id,
          name: category.name,
          total,
          percentage,
        };
      })
      .filter((category) => category.total > 0)
      .sort((a, b) => b.total - a.total);

    const activeReceivables = receivables
      .map((receivable) => {
        const amounts = getReceivableAmounts(receivable);

        return {
          ...receivable,
          ...amounts,
        };
      })
      .filter((receivable) => receivable.status === "ACTIVE");

    return NextResponse.json({
      payments,
      monthlySummary: {
        incomeTotal,
        dailyExpensesTotal,
        subscriptionsTotal,
        installmentPurchasesTotal,
        monthlyExpenseTotal,
        monthlyDifference,
      },
      categoryBreakdown,
      activeReceivables,
    });
  } catch (error) {
    console.error("Error loading dashboard:", error);

    return NextResponse.json(
      { error: "No se pudo cargar el dashboard." },
      { status: 500 },
    );
  }
}
