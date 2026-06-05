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

function shouldIncludeSubscriptionInCycle(subscription, cycle) {
  const frequencyMonths = Number(subscription.frequencyMonths || 1);
  const startMonth = Number(subscription.startMonth || cycle.month);
  const startYear = Number(subscription.startYear || cycle.year);

  const cycleIndex = cycle.year * 12 + (cycle.month - 1);
  const startIndex = startYear * 12 + (startMonth - 1);

  if (cycleIndex < startIndex) return false;

  const diffMonths = cycleIndex - startIndex;

  return diffMonths % frequencyMonths === 0;
}

function shouldIncludeSubscriptionInMonth(subscription, year, month) {
  const frequencyMonths = Number(subscription.frequencyMonths || 1);
  const startMonth = Number(subscription.startMonth || month);
  const startYear = Number(subscription.startYear || year);

  const targetIndex = year * 12 + (month - 1);
  const startIndex = startYear * 12 + (startMonth - 1);

  if (targetIndex < startIndex) return false;

  const diffMonths = targetIndex - startIndex;

  return diffMonths % frequencyMonths === 0;
}

function isSubscriptionChargeableInMonth(subscription, year, month) {
  if (!shouldIncludeSubscriptionInMonth(subscription, year, month)) return false;
  if (subscription.isActive) return true;
  if (!subscription.deactivatedAt) return false;
  const chargeDate = buildDateFromDay(year, month, Number(subscription.chargeDay));
  return chargeDate <= new Date(subscription.deactivatedAt);
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
    .filter((subscription) =>
      shouldIncludeSubscriptionInCycle(subscription, cycle),
    )
    .reduce((sum, subscription) => {
      const charges = getSubscriptionChargeDatesInsideCycle(subscription, cycle);
      const validCharges = charges.filter((chargeDate) => {
        if (subscription.isActive) return true;
        if (!subscription.deactivatedAt) return false;
        return new Date(chargeDate) <= new Date(subscription.deactivatedAt);
      });
      return sum + validCharges.length * Number(subscription.amount || 0);
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

function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getDaysDifference(targetDate, baseDate) {
  const target = startOfLocalDay(new Date(targetDate));
  const base = startOfLocalDay(new Date(baseDate));

  return Math.round((target.getTime() - base.getTime()) / 86400000);
}

function getNoticeTiming(diffDays) {
  if (diffDays < 0) {
    return {
      group: "overdue",
      label:
        Math.abs(diffDays) === 1
          ? "Vencido desde hace 1 día"
          : `Vencido desde hace ${Math.abs(diffDays)} días`,
    };
  }

  if (diffDays === 0) {
    return {
      group: "today",
      label: "Vence hoy",
    };
  }

  if (diffDays === 1) {
    return {
      group: "upcoming",
      label: "Vence mañana",
    };
  }

  return {
    group: "upcoming",
    label: `Vence en ${diffDays} días`,
  };
}

function buildDateFromDay(year, month, day) {
  const maxDay = new Date(year, month, 0).getDate();
  const safeDay = Math.min(day, maxDay);

  return new Date(year, month - 1, safeDay, 12, 0, 0);
}

function buildCardPaymentNotices(payments, now) {
  const notices = [];

  for (const item of payments) {
    const card = item.card;
    const cycle = item.currentPayment;

    if (!cycle) continue;
    if (cycle.status === "PAID" || cycle.displayStatus === "PAID") continue;

    const diffDays = getDaysDifference(cycle.dueDate, now);

    if (diffDays > 2) continue;

    const timing = getNoticeTiming(diffDays);

    notices.push({
      id: `card-${cycle.id}`,
      type: "CARD_PAYMENT",
      group: timing.group,
      title:
        timing.group === "overdue"
          ? `Pago vencido de ${card.name}`
          : `Pago de tarjeta: ${card.name}`,
      description: `${timing.label}. ${
        cycle.statementAmount
          ? `Estado de cuenta: ${formatMoneyForNotice(cycle.statementAmount)}.`
          : `Pago calculado: ${formatMoneyForNotice(cycle.calculatedAmount)}.`
      } No está marcado como pagado.`,
      date: cycle.dueDate,
      amount: Number(cycle.statementAmount || cycle.calculatedAmount || 0),
    });
  }

  return notices;
}

function formatMoneyForNotice(value) {
  const numberValue = Number(value || 0);

  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(numberValue);
}

function buildCashSubscriptionNotices(subscriptions, now) {
  const notices = [];

  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  for (const subscription of subscriptions) {
    if (subscription.paymentMethod !== "CASH") continue;
    if (!subscription.isActive) continue;

    if (
      !shouldIncludeSubscriptionInMonth(subscription, currentYear, currentMonth)
    ) {
      continue;
    }

    const dueDate = buildDateFromDay(
      currentYear,
      currentMonth,
      Number(subscription.chargeDay),
    );

    const diffDays = getDaysDifference(dueDate, now);

    if (diffDays > 2) continue;

    const alreadyPaid = hasExpenseForSubscriptionFromDate(
      subscription,
      dueDate,
      now,
    );

    if (alreadyPaid) continue;

    const timing = getNoticeTiming(diffDays);

    notices.push({
      id: `subscription-${subscription.id}-${currentYear}-${currentMonth}`,
      type: "CASH_SUBSCRIPTION",
      group: timing.group,
      title:
        timing.group === "overdue"
          ? `Suscripción pendiente: ${subscription.name}`
          : `Suscripción en efectivo: ${subscription.name}`,
      description: `${timing.label}. Pago estimado: ${formatMoneyForNotice(
        subscription.amount,
      )}. No hay gasto registrado vinculado a esta suscripción.`,
      date: dueDate,
      amount: Number(subscription.amount || 0),
    });
  }

  return notices;
}

function toUtcDateStr(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function hasIncomeForReceivableFromDate(receivable, chargeDate, now) {
  const startStr = toUtcDateStr(chargeDate);
  const endStr = toUtcDateStr(now);

  return (receivable.incomes || []).some((income) => {
    const incomeStr = toUtcDateStr(income.date);
    return incomeStr >= startStr && incomeStr <= endStr;
  });
}

function hasExpenseForSubscriptionFromDate(subscription, chargeDate, now) {
  // Start from the 1st of the charge month to catch payments made before the charge day.
  const n = new Date(now);
  const monthStartStr = `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const endStr = toUtcDateStr(now);

  return (subscription.dailyExpenses || []).some((expense) => {
    const expenseStr = toUtcDateStr(expense.date);
    return expenseStr >= monthStartStr && expenseStr <= endStr;
  });
}

function buildReceivableNotices(receivables, now) {
  const notices = [];

  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  for (const receivable of receivables) {
    if (receivable.status !== "ACTIVE") continue;

    const expectedChargeDays = receivable.expectedChargeDays || [];

    if (expectedChargeDays.length === 0) continue;

    const originDate = receivable.originDate
      ? startOfLocalDay(new Date(receivable.originDate))
      : null;

    for (const day of expectedChargeDays) {
      const chargeDate = buildDateFromDay(
        currentYear,
        currentMonth,
        Number(day),
      );

      // No generar aviso para fechas anteriores al inicio de la cuenta
      if (originDate && chargeDate < originDate) continue;

      const diffDays = getDaysDifference(chargeDate, now);

      if (diffDays > 2) continue;

      const alreadyPaid = hasIncomeForReceivableFromDate(
        receivable,
        chargeDate,
        now,
      );

      if (alreadyPaid) continue;

      const timing = getNoticeTiming(diffDays);

      notices.push({
        id: `receivable-${receivable.id}-${currentYear}-${currentMonth}-${day}`,
        type: "RECEIVABLE",
        group: timing.group,
        title:
          timing.group === "overdue"
            ? `Cobro pendiente: ${receivable.person?.name || "Persona"}`
            : `Cobro programado: ${receivable.person?.name || "Persona"}`,
        description: `${timing.label}. ${
          receivable.expectedMonthlyPayment
            ? `Pago esperado: ${formatMoneyForNotice(
                receivable.expectedMonthlyPayment,
              )}.`
            : `Cuenta: ${receivable.concept}.`
        } No hay ingreso registrado para este cobro.`,
        date: chargeDate,
        amount: Number(receivable.expectedMonthlyPayment || 0),
      });
    }
  }

  return notices;
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
        include: {
          category: true,
          card: true,
          dailyExpenses: true,
        },
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

    // Batch activo: mes más antiguo (por cutDate) que tenga al menos un ciclo sin pagar.
    // Todos los ciclos sin pagar de ese mes se muestran en "Este pago".
    // Solo se avanza al mes actual cuando todos los ciclos del batch anterior están pagados.
    let activeBatchYear = null;
    let activeBatchMonth = null;

    for (const cycle of cyclesWithAmounts) {
      const cutDate = new Date(cycle.cutDate);
      if (cutDate > now) continue;
      if (cycle.displayStatus === "PAID") continue;

      if (
        activeBatchYear === null ||
        cutDate.getUTCFullYear() < activeBatchYear ||
        (cutDate.getUTCFullYear() === activeBatchYear &&
          cutDate.getUTCMonth() < activeBatchMonth)
      ) {
        activeBatchYear = cutDate.getUTCFullYear();
        activeBatchMonth = cutDate.getUTCMonth();
      }
    }

    const hasBatch = activeBatchYear !== null;

    const payments = cards.map((card) => {
      const cyclesForCard = cyclesWithAmounts
        .filter((cycle) => cycle.cardId === card.id)
        .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

      let currentPayment = null;
      let anchorIndex = -1;

      if (hasBatch) {
        // Buscar ciclo de esta tarjeta en el batch activo (pagado o no)
        const batchIndex = cyclesForCard.findIndex((cycle) => {
          const cutDate = new Date(cycle.cutDate);
          return (
            cutDate.getUTCFullYear() === activeBatchYear &&
            cutDate.getUTCMonth() === activeBatchMonth &&
            cutDate <= now
          );
        });

        if (batchIndex !== -1) {
          currentPayment = cyclesForCard[batchIndex];
          anchorIndex = batchIndex;
        }
      }

      // Si no hay ciclo del batch activo para esta tarjeta, calcular ancla para
      // previousPayment / nextPayment usando el ciclo más reciente cortado.
      if (anchorIndex === -1) {
        for (let i = cyclesForCard.length - 1; i >= 0; i--) {
          if (new Date(cyclesForCard[i].cutDate) <= now) {
            anchorIndex = i;
            break;
          }
        }
        if (anchorIndex === -1) anchorIndex = 0;

        // Solo asignar currentPayment si no hay batch activo (todo pagado o sin cortes)
        if (!hasBatch) {
          currentPayment = cyclesForCard[anchorIndex] || null;
        }
      }

      return {
        card,
        previousPayment: anchorIndex > 0 ? cyclesForCard[anchorIndex - 1] : null,
        currentPayment,
        nextPayment: cyclesForCard[anchorIndex + 1] || null,
      };
    });

    const monthlyExpenses = expenses.filter((expense) =>
      isDateInsideRange(expense.date, monthStart, monthEnd),
    );

    const dailyExpensesTotal = monthlyExpenses.reduce((sum, expense) => {
      return sum + Number(expense.amount || 0);
    }, 0);

    const subscriptionsTotal = subscriptions
      .filter((subscription) =>
        isSubscriptionChargeableInMonth(subscription, currentYear, currentMonth),
      )
      .reduce((sum, subscription) => {
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
          .filter((subscription) =>
            isSubscriptionChargeableInMonth(subscription, currentYear, currentMonth),
          )
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

    const cardPaymentNotices = buildCardPaymentNotices(payments, now);
    const cashSubscriptionNotices = buildCashSubscriptionNotices(
      subscriptions,
      now,
    );
    const receivableNotices = buildReceivableNotices(activeReceivables, now);

    const importantNotices = [
      ...cardPaymentNotices,
      ...cashSubscriptionNotices,
      ...receivableNotices,
    ].sort((a, b) => {
      const priority = {
        overdue: 0,
        today: 1,
        upcoming: 2,
      };

      const priorityDiff = priority[a.group] - priority[b.group];

      if (priorityDiff !== 0) return priorityDiff;

      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });

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
      importantNotices,
    });
  } catch (error) {
    console.error("Error loading dashboard:", error);

    return NextResponse.json(
      { error: "No se pudo cargar el dashboard." },
      { status: 500 },
    );
  }
}
