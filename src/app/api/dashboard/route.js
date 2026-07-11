import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const dashboardCardSelect = {
  id: true,
  name: true,
  usualCutDay: true,
  usualDueDay: true,
};

const dashboardCycleSelect = {
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
  card: {
    select: dashboardCardSelect,
  },
};

const dashboardExpenseSelect = {
  id: true,
  date: true,
  amount: true,
  cardId: true,
  categoryId: true,
};

const dashboardSubscriptionSelect = {
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
  dailyExpenses: {
    select: {
      id: true,
      date: true,
    },
  },
};

const dashboardPurchaseSelect = {
  id: true,
  cardId: true,
  categoryId: true,
  purchaseDate: true,
  totalAmount: true,
  months: true,
  manualMonthlyPayment: true,
  initialPaymentsMade: true,
  status: true,
};

const CARD_USAGE_MINIMUMS = [
  { key: "HSBC", label: "HSBC", minimumAmount: 300 },
  { key: "BANAMEX", label: "BANAMEX", minimumAmount: 300 },
  { key: "SANTANDER", label: "SANTANDER", minimumAmount: 200 },
];

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

function normalizeCardName(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function getCardUsageRule(card) {
  const normalizedName = normalizeCardName(card.name);

  return (
    CARD_USAGE_MINIMUMS.find((rule) => normalizedName.includes(rule.key)) ||
    null
  );
}

// Primer ciclo donde cae la compra: si el día de compra es posterior al corte
// usual de la tarjeta, el primer pago corresponde al ciclo del mes siguiente.
function getPurchaseFirstCycleIndex(purchase, card) {
  const purchaseDate = new Date(purchase.purchaseDate);
  const cutDay = Number(card?.usualCutDay) || purchaseDate.getUTCDate();

  let year = purchaseDate.getUTCFullYear();
  let monthIndex = purchaseDate.getUTCMonth();

  const cutDateSameMonth = createChargeDate(year, monthIndex, cutDay);

  if (purchaseDate.getTime() > cutDateSameMonth.getTime()) {
    monthIndex += 1;
    if (monthIndex > 11) {
      monthIndex = 0;
      year += 1;
    }
  }

  return year * 12 + monthIndex;
}

function getPurchaseCycleNumber(purchase, targetCycle) {
  const firstCycleIndex = getPurchaseFirstCycleIndex(purchase, targetCycle.card);
  const targetCycleIndex = targetCycle.year * 12 + (targetCycle.month - 1);

  return targetCycleIndex - firstCycleIndex + 1;
}

function shouldIncludePurchaseInCycle(purchase, targetCycle) {
  if (purchase.cardId !== targetCycle.cardId) return false;

  const purchaseDate = new Date(purchase.purchaseDate).getTime();
  const cycleCutDate = new Date(targetCycle.cutDate).getTime();

  if (purchaseDate > cycleCutDate) return false;

  if (purchase.status === "PAID_OFF") {
    // Mostrar en ciclos ya cortados dentro del rango de meses de la compra
    // para preservar el desglose histórico del último pago.
    if (cycleCutDate >= Date.now()) return false;
    const purchaseDateObj = new Date(purchase.purchaseDate);
    const purchaseMonthIdx =
      purchaseDateObj.getUTCFullYear() * 12 + purchaseDateObj.getUTCMonth();
    const cycleMonthIdx = targetCycle.year * 12 + (targetCycle.month - 1);
    return cycleMonthIdx <= purchaseMonthIdx + Number(purchase.months || 0);
  }

  if (purchase.status !== "ACTIVE") return false;

  const months = Number(purchase.months || 0);
  const cycleNumber = getPurchaseCycleNumber(purchase, targetCycle);

  return cycleNumber >= 1 && cycleNumber <= months;
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
  expensesByCardId,
  subscriptionsByCardId,
  purchasesByCardId,
}) {
  const cardExpenses = expensesByCardId
    ? expensesByCardId.get(cycle.cardId) || []
    : expenses;
  const cardSubscriptions =
    subscriptionsByCardId
      ? subscriptionsByCardId.get(cycle.cardId) || []
      : subscriptions;
  const cardPurchases = purchasesByCardId
    ? purchasesByCardId.get(cycle.cardId) || []
    : purchases;

  const expensesAmount = cardExpenses
    .filter((expense) =>
      isDateInsideRange(expense.date, cycle.startDate, cycle.cutDate),
    )
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

  const subscriptionsAmount = cardSubscriptions
    .filter((subscription) => subscription.paymentMethod === "CARD")
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

  const purchasesAmount = cardPurchases
    .filter((purchase) =>
      shouldIncludePurchaseInCycle(purchase, cycle),
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

function findCycleForCardByMonth(cyclesWithAmounts, cardId, year, month) {
  return (
    cyclesWithAmounts
      .filter((cycle) => cycle.cardId === cardId)
      .find((cycle) => cycle.year === year && cycle.month === month) || null
  );
}

function calculateSubscriptionAmountInCycle(subscription, cycle) {
  if (subscription.paymentMethod !== "CARD") return 0;
  if (!shouldIncludeSubscriptionInCycle(subscription, cycle)) return 0;

  const validCharges = getSubscriptionChargeDatesInsideCycle(
    subscription,
    cycle,
  ).filter((chargeDate) => {
    if (subscription.isActive) return true;
    if (!subscription.deactivatedAt) return false;
    return new Date(chargeDate) <= new Date(subscription.deactivatedAt);
  });

  return validCharges.length * Number(subscription.amount || 0);
}

function buildCardUsageWaivers({
  cards,
  cyclesWithAmounts,
  expenses,
  subscriptions,
  purchases,
  year,
  month,
}) {
  return cards.flatMap((card) => {
    const rule = getCardUsageRule(card);

    if (!rule) return [];

    const selectedCycle = findCycleForCardByMonth(
      cyclesWithAmounts,
      card.id,
      year,
      month,
    );

    if (!selectedCycle) {
      return {
        card,
        applies: true,
        bank: rule.label,
        minimumAmount: rule.minimumAmount,
        eligibleSpend: 0,
        remainingAmount: rule.minimumAmount,
        progress: 0,
        isExempt: false,
        selectedCycle: null,
        breakdown: {
          dailyExpensesAmount: 0,
          subscriptionsAmount: 0,
          installmentPurchasesAmount: 0,
        },
      };
    }

    const dailyExpensesAmount = expenses
      .filter((expense) => expense.cardId === card.id)
      .filter((expense) =>
        isDateInsideRange(
          expense.date,
          selectedCycle.startDate,
          selectedCycle.cutDate,
        ),
      )
      .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

    const subscriptionsAmount = subscriptions
      .filter((subscription) => subscription.cardId === card.id)
      .reduce((sum, subscription) => {
        return sum + calculateSubscriptionAmountInCycle(subscription, selectedCycle);
      }, 0);

    const installmentPurchasesAmount = purchases
      .filter((purchase) => purchase.cardId === card.id)
      .filter((purchase) => purchase.status === "ACTIVE")
      .filter((purchase) =>
        isDateInsideRange(
          purchase.purchaseDate,
          selectedCycle.startDate,
          selectedCycle.cutDate,
        ),
      )
      .reduce((sum, purchase) => sum + Number(purchase.totalAmount || 0), 0);

    const eligibleSpend =
      dailyExpensesAmount + subscriptionsAmount + installmentPurchasesAmount;
    const minimumAmount = rule?.minimumAmount || null;
    const remainingAmount = minimumAmount
      ? Math.max(minimumAmount - eligibleSpend, 0)
      : null;
    const progress = minimumAmount
      ? Math.min((eligibleSpend / minimumAmount) * 100, 100)
      : 0;

    return {
      card,
      applies: true,
      bank: rule.label,
      minimumAmount,
      eligibleSpend,
      remainingAmount,
      progress,
      isExempt: Boolean(minimumAmount && eligibleSpend >= minimumAmount),
      selectedCycle: {
        id: selectedCycle.id,
        startDate: selectedCycle.startDate,
        cutDate: selectedCycle.cutDate,
        dueDate: selectedCycle.dueDate,
        month: selectedCycle.month,
        year: selectedCycle.year,
        displayStatus: selectedCycle.displayStatus,
      },
      breakdown: {
        dailyExpensesAmount,
        subscriptionsAmount,
        installmentPurchasesAmount,
      },
    };
  });
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

function shouldIncludePurchaseInMonth(purchase, targetYear, targetMonth) {
  if (purchase.status !== "ACTIVE") return false;

  const purchaseDate = new Date(purchase.purchaseDate);
  const purchaseMonthIndex =
    purchaseDate.getUTCFullYear() * 12 + purchaseDate.getUTCMonth();

  const targetMonthIndex = targetYear * 12 + (targetMonth - 1);

  const months = Number(purchase.months || 0);
  const initialPaymentsMade = Number(purchase.initialPaymentsMade || 0);
  const remainingMonths = months - initialPaymentsMade;

  if (remainingMonths <= 0) return false;

  return (
    targetMonthIndex >= purchaseMonthIndex &&
    targetMonthIndex < purchaseMonthIndex + remainingMonths
  );
}

function buildCategoryBreakdown({ categories, expenses, subscriptions, purchases, year, month }) {
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
    (sum, p) => sum + getMonthlyPaymentUsed(p),
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
        .reduce((sum, p) => sum + getMonthlyPaymentUsed(p), 0);

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

function buildWeeklyComparison({ expenses, subscriptions = [], purchases = [], currentYear, currentMonth, categoryId = null }) {
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

  const prevSubsTotal = filteredSubscriptions
    .filter((s) => isSubscriptionChargeableInMonth(s, prevYear, prevMonth))
    .reduce((sum, s) => sum + Number(s.amount || 0), 0);

  const currSubsTotal = filteredSubscriptions
    .filter((s) => isSubscriptionChargeableInMonth(s, currentYear, currentMonth))
    .reduce((sum, s) => sum + Number(s.amount || 0), 0);

  const prevPurchasesTotal = filteredPurchases
    .filter((p) => shouldIncludePurchaseInMonth(p, prevYear, prevMonth))
    .reduce((sum, p) => sum + getMonthlyPaymentUsed(p), 0);

  const currPurchasesTotal = filteredPurchases
    .filter((p) => shouldIncludePurchaseInMonth(p, currentYear, currentMonth))
    .reduce((sum, p) => sum + getMonthlyPaymentUsed(p), 0);

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

    const prevSubsWeekTotal = filteredSubscriptions
      .filter((s) => isSubscriptionChargeableInMonth(s, prevYear, prevMonth))
      .filter((s) => {
        const day = Math.min(Number(s.chargeDay), prevMonthDays);
        return day >= startDay && day <= prevEnd;
      })
      .reduce((sum, s) => sum + Number(s.amount || 0), 0);

    const currSubsWeekTotal = filteredSubscriptions
      .filter((s) => isSubscriptionChargeableInMonth(s, currentYear, currentMonth))
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
            .reduce((sum, p) => sum + getMonthlyPaymentUsed(p), 0)
        : 0;

    const currPurchasesWeekTotal =
      week === 1
        ? filteredPurchases
            .filter((p) => shouldIncludePurchaseInMonth(p, currentYear, currentMonth))
            .reduce((sum, p) => sum + getMonthlyPaymentUsed(p), 0)
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
        ? Number(prevCycle.statementAmount || prevCycle.calculatedAmount || 0)
        : 0;
      const currAmount = currCycle
        ? Number(currCycle.statementAmount || currCycle.calculatedAmount || 0)
        : 0;

      return {
        cardId: card.id,
        cardName: card.name,
        prevAmount,
        currAmount,
        prevIsStatement: prevCycle ? !!prevCycle.statementAmount : false,
        currIsStatement: currCycle ? !!currCycle.statementAmount : false,
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
    if (cycle.displayStatus === "PAID") continue;
    if (cycle.displayStatus === "PAYMENT_PENDING") continue;
    if (cycle.displayStatus === "OVERDUE") continue;

    const card = cardMap.get(cycle.cardId);
    if (!card) continue;

    const diffDaysToCut = getDaysDifference(cycle.cutDate, now);

    if (cycle.displayStatus === "CUT") {
      const daysSinceCut = getDaysDifference(now, cycle.cutDate);
      const cutAgoLabel =
        daysSinceCut === 0
          ? "Cortada hoy"
          : daysSinceCut === 1
            ? "Cortada hace 1 día"
            : `Cortada hace ${daysSinceCut} días`;

      notices.push({
        id: `cut-cycle-${cycle.id}`,
        type: "CUT_CYCLE",
        group: "cut",
        title: `Tarjeta cortada: ${card.name}`,
        description: `${cutAgoLabel}. Actualiza la fecha y el monto del estado de cuenta para que el aviso desaparezca.`,
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
        description: `La tarjeta se corta ${cutLabel}. Recuerda actualizar la fecha y el monto del estado de cuenta una vez cortado.`,
        date: cycle.cutDate,
        amount: Number(cycle.calculatedAmount || 0),
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

    const monthlyExpenses = getExpensesForMonth(currentYear, currentMonth);

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
      year: prevDate.getUTCFullYear(),
      month: prevDate.getUTCMonth() + 1,
    });

    const categoryBreakdownCurrent = buildCategoryBreakdown({
      categories,
      expenses: getExpensesForMonth(currentYear, currentMonth),
      subscriptions,
      purchases,
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
      year: nextDate.getUTCFullYear(),
      month: nextDate.getUTCMonth() + 1,
    });

    const categoryBreakdownByMonth = {};
    for (let m = 0; m < 12; m++) {
      categoryBreakdownByMonth[m] = buildCategoryBreakdown({
        categories,
        expenses: getExpensesForMonth(currentYear, m + 1),
        subscriptions,
        purchases,
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
        cards,
        cyclesWithAmounts,
        expenses,
        subscriptions,
        purchases,
        year: currentYear,
        month: m + 1,
      });
    }
    const cardUsageWaivers = cardUsageWaiversByMonth[currentMonth - 1] || [];

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
      categories: categories.map((c) => ({ id: c.id, name: c.name })),
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
