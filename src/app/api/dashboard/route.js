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
  subscriptionCharge: { select: { month: true } },
  notes: true,
  paymentMethod: true,
  subscriptionId: true,
  id: true,
  concept: true,
  date: true,
  amount: true,
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
  if (isSubscriptionChargeResolved(subscription, `${year}-${String(month).padStart(2, "0")}`)) return false;
  if (!shouldIncludeSubscriptionInMonth(subscription, year, month)) return false;
  if (subscription.isActive) return true;
  if (!subscription.deactivatedAt) return false;
  const chargeDate = buildDateFromDay(year, month, Number(subscription.chargeDay));
  return chargeDate.toISOString().slice(0, 10) <= new Date(subscription.deactivatedAt).toISOString().slice(0, 10);
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
          ? "Vencido: desde hace 1 día"
          : `Vencido: desde hace ${Math.abs(diffDays)} días`,
    };
  }

  if (diffDays === 0) {
    return {
      group: "today",
      label: "Vence: hoy",
    };
  }

  if (diffDays === 1) {
    return {
      group: "upcoming",
      label: "Vence: mañana",
    };
  }

  return {
    group: "upcoming",
    label: `Vence: en ${diffDays} días`,
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
    const payment = getCyclePaymentState(cycle, now);
    if (payment.isSettled) continue;

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
      description: `${timing.label}\n${
        cycle.statementAmount !== null && cycle.statementAmount !== undefined
          ? `Saldo pendiente: ${formatMoneyForNotice(payment.pendingAmount)}`
          : `Pago calculado: ${formatMoneyForNotice(cycle.calculatedAmount)} · Estado de cuenta por confirmar`
      }`,
      date: cycle.dueDate,
      amount: payment.pendingAmount ?? Number(cycle.calculatedAmount ?? 0),
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
    if (isSubscriptionChargeResolved(subscription, `${currentYear}-${String(currentMonth).padStart(2, "0")}`)) continue;

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
      description: `${timing.label}\nPago estimado: ${formatMoneyForNotice(
        subscription.amount,
      )}`,
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
    if (expense.subscriptionCharge) return expense.subscriptionCharge.month === monthStartStr.slice(0, 7);
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
        description: `${timing.label}\n${
          receivable.expectedMonthlyPayment
            ? `Pago esperado: ${formatMoneyForNotice(
                receivable.expectedMonthlyPayment,
              )}`
            : `Cuenta: ${receivable.concept}`
        }`,
        date: chargeDate,
        amount: Number(receivable.expectedMonthlyPayment || 0),
      });
    }
  }

  return notices;
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

  const dailyExpensesTotal = monthlyExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const monthlyExpenseTotal = dailyExpensesTotal + subscriptionsTotal + installmentPurchasesTotal;

  return categories
    .map((category) => {
      const catDaily = monthlyExpenses
        .filter((e) => e.categoryId === category.id)
        .reduce((sum, e) => sum + Number(e.amount || 0), 0);

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
    filteredExpenses
      .filter((e) => isDateInsideRange(e.date, prevMonthStart, prevMonthEnd))
      .reduce((sum, e) => sum + Number(e.amount || 0), 0) +
    prevSubsTotal +
    prevPurchasesTotal;

  const currMonthTotal =
    filteredExpenses
      .filter((e) => isDateInsideRange(e.date, currMonthStart, currMonthEnd))
      .reduce((sum, e) => sum + Number(e.amount || 0), 0) +
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
        ? filteredExpenses
            .filter((e) =>
              isDateInsideRange(
                e.date,
                new Date(Date.UTC(prevYear, prevMonth - 1, startDay, 0, 0, 0)),
                new Date(Date.UTC(prevYear, prevMonth - 1, prevEnd, 23, 59, 59)),
              ),
            )
            .reduce((sum, e) => sum + Number(e.amount || 0), 0)
        : 0;

    const currDailyTotal =
      startDay <= currMonthDays
        ? filteredExpenses
            .filter((e) =>
              isDateInsideRange(
                e.date,
                new Date(Date.UTC(currentYear, currentMonth - 1, startDay, 0, 0, 0)),
                new Date(Date.UTC(currentYear, currentMonth - 1, currEnd, 23, 59, 59)),
              ),
            )
            .reduce((sum, e) => sum + Number(e.amount || 0), 0)
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

      const prevAmount = prevCycle
        ? Number(prevCycle.statementAmount ?? prevCycle.calculatedAmount ?? 0)
        : 0;
      const currAmount = currCycle
        ? Number(currCycle.statementAmount ?? currCycle.calculatedAmount ?? 0)
        : 0;

      return {
        cardId: card.id,
        cardName: card.name,
        prevAmount,
        currAmount,
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

function buildCutCycleNotices(cyclesWithAmounts, cards, now) {
  const notices = [];
  const cardMap = new Map(cards.map((c) => [c.id, c]));

  for (const cycle of cyclesWithAmounts) {
    if (cycle.isSettled) continue;
    if (cycle.displayStatus === "PAYMENT_PENDING" || cycle.paymentStatus === "PARTIALLY_PAID") continue;
    if (cycle.displayStatus === "OVERDUE") continue;

    const card = cardMap.get(cycle.cardId);
    if (!card) continue;

    const diffDaysToCut = getDaysDifference(cycle.cutDate, now);

    if (cycle.displayStatus === "CUT") {
      const daysSinceCut = getDaysDifference(now, cycle.cutDate);
      const cutAgoLabel =
        daysSinceCut === 0
          ? "hoy"
          : daysSinceCut === 1
            ? "hace 1 día"
            : `hace ${daysSinceCut} días`;

      notices.push({
        id: `cut-cycle-${cycle.id}`,
        type: "CUT_CYCLE",
        group: "cut",
        title: `Tarjeta cortada: ${card.name}`,
        description: `Corte: ${cutAgoLabel}`,
        date: cycle.cutDate,
        amount: Number(cycle.calculatedAmount || 0),
      });
    } else if (
      cycle.displayStatus === "OPEN" &&
      diffDaysToCut > 0 &&
      diffDaysToCut <= 2
    ) {
      const cutLabel =
        diffDaysToCut === 1 ? "mañana" : `en ${diffDaysToCut} días`;
      notices.push({
        id: `cut-cycle-upcoming-${cycle.id}`,
        type: "CUT_CYCLE_UPCOMING",
        group: "cut",
        title: `Corte ${cutLabel}: ${card.name}`,
        description: `Corte: ${cutLabel}`,
        date: cycle.cutDate,
        amount: Number(cycle.calculatedAmount || 0),
      });
    }
  }

  return notices;
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
        ...getCyclePaymentState(cycle),
        dataWarnings: getCyclePeriodWarnings(cycle, cardCycles),
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
      if (cycle.isSettled) continue;

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

    const monthlyExpenses = getExpensesForMonth(currentYear, currentMonth);

    const dailyExpensesTotal = monthlyExpenses.reduce((sum, expense) => {
      return sum + Number(expense.amount || 0);
    }, 0);

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

    const cardPaymentNotices = buildCardPaymentNotices(payments, now);
    const cashSubscriptionNotices = buildCashSubscriptionNotices(
      subscriptions,
      now,
    );
    const receivableNotices = buildReceivableNotices(activeReceivables, now);
    const cutCycleNotices = buildCutCycleNotices(cyclesWithAmounts, cards, now);
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

    const importantNotices = [
      ...cardPaymentNotices,
      ...cashSubscriptionNotices,
      ...receivableNotices,
      ...cutCycleNotices,
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
