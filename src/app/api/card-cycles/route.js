import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const cycleSelect = {
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
    select: {
      id: true,
      name: true,
      usualCutDay: true,
      usualDueDay: true,
    },
  },
};

const cycleExpenseSelect = {
  id: true,
  cardId: true,
  concept: true,
  amount: true,
  date: true,
  category: {
    select: {
      name: true,
    },
  },
};

const cycleSubscriptionSelect = {
  id: true,
  paymentMethod: true,
  cardId: true,
  name: true,
  amount: true,
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
};

const cyclePurchaseSelect = {
  id: true,
  cardId: true,
  concept: true,
  totalAmount: true,
  purchaseDate: true,
  months: true,
  manualMonthlyPayment: true,
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

function isDateInsideRange(date, startDate, endDate) {
  const value = new Date(date).getTime();

  return (
    value >= new Date(startDate).getTime() &&
    value <= new Date(endDate).getTime()
  );
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

// Primer ciclo donde cae la compra: si el día de compra es posterior al corte
// usual de la tarjeta, el primer pago corresponde al ciclo del mes siguiente.
// earliestCardCycleIndex: si la compra cayó en el ciclo virtual inmediatamente
// anterior al primer ciclo generado (ciclo que no existe en BD), se reasigna al
// primer ciclo real para que el conteo de mensualidades sea correcto.
function getPurchaseFirstCycleIndex(purchase, card, earliestCardCycleIndex) {
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

  const computed = year * 12 + monthIndex;

  // Si la compra es ACTIVE y cayó exactamente en el ciclo virtual que precede al
  // primer ciclo generado (ese ciclo no existe en BD), usar el primer ciclo real.
  // Para PAID_OFF se respeta el ciclo original para mantener historial correcto.
  if (
    purchase.status === "ACTIVE" &&
    earliestCardCycleIndex !== undefined &&
    computed === earliestCardCycleIndex - 1
  ) {
    return earliestCardCycleIndex;
  }

  return computed;
}

function getPurchaseCycleNumber(purchase, targetCycle, earliestCardCycleIndex) {
  const firstCycleIndex = getPurchaseFirstCycleIndex(purchase, targetCycle.card, earliestCardCycleIndex);
  const targetCycleIndex = targetCycle.year * 12 + (targetCycle.month - 1);

  return targetCycleIndex - firstCycleIndex + 1;
}

function shouldIncludePurchaseInCycle(purchase, targetCycle, earliestCardCycleIndex) {
  if (purchase.cardId !== targetCycle.cardId) return false;

  const purchaseDate = new Date(purchase.purchaseDate).getTime();
  const cycleCutDate = new Date(targetCycle.cutDate).getTime();

  if (purchaseDate > cycleCutDate) return false;

  if (purchase.status === "PAID_OFF") {
    // Mostrar solo en ciclos pasados dentro del rango real de la compra.
    if (cycleCutDate >= Date.now()) return false;
    const cycleNumber = getPurchaseCycleNumber(purchase, targetCycle, earliestCardCycleIndex);
    return cycleNumber >= 1 && cycleNumber <= Number(purchase.months || 0);
  }

  if (purchase.status !== "ACTIVE") return false;

  const months = Number(purchase.months || 0);
  const cycleNumber = getPurchaseCycleNumber(purchase, targetCycle, earliestCardCycleIndex);

  return cycleNumber >= 1 && cycleNumber <= months;
}

// Índice mínimo de ciclo generado por tarjeta: sirve para detectar compras que
// cayeron en un ciclo virtual (no generado) inmediatamente anterior.
function buildCardEarliestCycleIndexMap(cycles) {
  const map = {};
  for (const cycle of cycles) {
    const idx = cycle.year * 12 + (cycle.month - 1);
    if (!(cycle.cardId in map) || idx < map[cycle.cardId]) {
      map[cycle.cardId] = idx;
    }
  }
  return map;
}

function getDaysInMonthForCharge(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function createChargeDate(year, monthIndex, day) {
  const safeDay = Math.min(day, getDaysInMonthForCharge(year, monthIndex));

  return new Date(Date.UTC(year, monthIndex, safeDay, 12, 0, 0));
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

function calculateCycleAmount({
  cycle,
  expenses,
  subscriptions,
  purchases,
  expensesByCardId,
  subscriptionsByCardId,
  purchasesByCardId,
  cardEarliestCycleIndexMap,
  includeBreakdown = true,
}) {
  const earliestCardCycleIndex = cardEarliestCycleIndexMap?.[cycle.cardId];
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

  const includedExpenses = cardExpenses
    .filter((expense) =>
      isDateInsideRange(expense.date, cycle.startDate, cycle.cutDate),
    )
    .map((expense) => ({
      id: expense.id,
      concept: expense.concept,
      amount: Number(expense.amount || 0),
      date: expense.date,
      categoryName: expense.category?.name || null,
    }));

  const expensesAmount = includedExpenses.reduce((sum, expense) => {
    return sum + expense.amount;
  }, 0);

  const includedSubscriptions = cardSubscriptions
    .filter((subscription) => subscription.paymentMethod === "CARD")
    .filter((subscription) => shouldIncludeSubscriptionInCycle(subscription, cycle))
    .flatMap((subscription) => {
      const charges = getSubscriptionChargeDatesInsideCycle(subscription, cycle);

      const validCharges = charges.filter((chargeDate) => {
        if (subscription.isActive) return true;
        if (!subscription.deactivatedAt) return false;
        return new Date(chargeDate) <= new Date(subscription.deactivatedAt);
      });

      return validCharges.map((chargeDate) => ({
        id: `${subscription.id}-${chargeDate.toISOString()}`,
        subscriptionId: subscription.id,
        name: subscription.name,
        amount: Number(subscription.amount || 0),
        chargeDate,
        categoryName: subscription.category?.name || null,
      }));
    });

  const subscriptionsAmount = includedSubscriptions.reduce(
    (sum, subscription) => {
      return sum + subscription.amount;
    },
    0,
  );

  const includedPurchases = cardPurchases
    .filter((purchase) =>
      shouldIncludePurchaseInCycle(purchase, cycle, earliestCardCycleIndex),
    )
    .map((purchase) => {
      const currentMonth = Math.min(
        getPurchaseCycleNumber(purchase, cycle, earliestCardCycleIndex),
        Number(purchase.months || 0),
      );

      return {
        id: purchase.id,
        concept: purchase.concept,
        amount: getMonthlyPaymentUsed(purchase),
        totalAmount: Number(purchase.totalAmount || 0),
        purchaseDate: purchase.purchaseDate,
        months: purchase.months,
        currentMonth,
        initialPaymentsMade: purchase.initialPaymentsMade,
        categoryName: purchase.category?.name || null,
      };
    });

  const purchasesAmount = includedPurchases.reduce((sum, purchase) => {
    return sum + purchase.amount;
  }, 0);

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
    ...(includeBreakdown
      ? {
          includedExpenses,
          includedSubscriptions,
          includedPurchases,
        }
      : {}),
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

function getDaysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function createDate(year, monthIndex, day) {
  const safeDay = Math.min(day, getDaysInMonth(year, monthIndex));

  // Usamos mediodía UTC para reducir problemas de zona horaria.
  return new Date(Date.UTC(year, monthIndex, safeDay, 12, 0, 0));
}

function getCycleDates(year, monthIndex, cutDay, dueDay) {
  const cutDate = createDate(year, monthIndex, cutDay);

  const previousMonthDate = new Date(
    Date.UTC(year, monthIndex - 1, 1, 12, 0, 0),
  );
  const previousCutDate = createDate(
    previousMonthDate.getUTCFullYear(),
    previousMonthDate.getUTCMonth(),
    cutDay,
  );

  const startDate = new Date(previousCutDate);
  startDate.setUTCDate(startDate.getUTCDate() + 1);

  let dueDate = createDate(year, monthIndex, dueDay);

  // Si el día límite cae antes o igual que el corte, entonces corresponde al siguiente mes.
  if (dueDate <= cutDate) {
    const nextMonthDate = new Date(Date.UTC(year, monthIndex + 1, 1, 12, 0, 0));
    dueDate = createDate(
      nextMonthDate.getUTCFullYear(),
      nextMonthDate.getUTCMonth(),
      dueDay,
    );
  }

  return {
    startDate,
    cutDate,
    dueDate,
  };
}

function getTargetMonths() {
  const now = new Date();
  const year = now.getFullYear();

  return Array.from({ length: 12 }, (_, monthIndex) => ({
    month: monthIndex + 1,
    year,
    monthIndex,
  }));
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const cycleId = searchParams.get("cycleId");
    const includeBreakdown =
      Boolean(cycleId) || searchParams.get("includeBreakdown") === "true";

    if (!userId) {
      return NextResponse.json({ error: "Falta userId." }, { status: 400 });
    }

    const [cycles, expenses, subscriptions, purchases] = await Promise.all([
      prisma.cardCycle.findMany({
        where: cycleId ? { userId, id: cycleId } : { userId },
        select: cycleSelect,
        orderBy: [{ year: "asc" }, { month: "asc" }, { card: { name: "asc" } }],
      }),
      prisma.dailyExpense.findMany({
        where: { userId },
        select: cycleExpenseSelect,
      }),
      prisma.subscription.findMany({
        where: { userId },
        select: cycleSubscriptionSelect,
      }),
      prisma.installmentPurchase.findMany({
        where: { userId },
        select: cyclePurchaseSelect,
      }),
    ]);

    const cardEarliestCycleIndexMap = buildCardEarliestCycleIndexMap(cycles);
    const expensesByCardId = groupBy(expenses, (expense) => expense.cardId);
    const subscriptionsByCardId = groupBy(
      subscriptions.filter((subscription) => subscription.cardId),
      (subscription) => subscription.cardId,
    );
    const purchasesByCardId = groupBy(purchases, (purchase) => purchase.cardId);

    const cyclesWithAmounts = cycles.map((cycle) => {
      const amounts = calculateCycleAmount({
        cycle,
        expenses,
        subscriptions,
        purchases,
        expensesByCardId,
        subscriptionsByCardId,
        purchasesByCardId,
        cardEarliestCycleIndexMap,
        includeBreakdown,
      });

      return {
        ...cycle,
        displayStatus: getDisplayStatus(cycle),
        ...amounts,
      };
    });

    if (cycleId) {
      return NextResponse.json({ cycle: cyclesWithAmounts[0] || null });
    }

    return NextResponse.json({ cycles: cyclesWithAmounts });
  } catch (error) {
    console.error("Error loading card cycles:", error);

    return NextResponse.json(
      { error: "No se pudieron cargar los ciclos." },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: "Falta userId." }, { status: 400 });
    }

    const cards = await prisma.card.findMany({
      where: { userId },
    });

    const targetMonths = getTargetMonths();

    for (const card of cards) {
      for (const target of targetMonths) {
        const { startDate, cutDate, dueDate } = getCycleDates(
          target.year,
          target.monthIndex,
          card.usualCutDay,
          card.usualDueDay,
        );

        await prisma.cardCycle.upsert({
          where: {
            cardId_month_year: {
              cardId: card.id,
              month: target.month,
              year: target.year,
            },
          },
          update: {},
          create: {
            userId,
            cardId: card.id,
            month: target.month,
            year: target.year,
            startDate,
            cutDate,
            dueDate,
          },
        });
      }
    }

    const [cycles, expenses, subscriptions, purchases] = await Promise.all([
      prisma.cardCycle.findMany({
        where: { userId },
        select: cycleSelect,
        orderBy: [{ year: "asc" }, { month: "asc" }, { card: { name: "asc" } }],
      }),
      prisma.dailyExpense.findMany({
        where: { userId },
        select: cycleExpenseSelect,
      }),
      prisma.subscription.findMany({
        where: { userId },
        select: cycleSubscriptionSelect,
      }),
      prisma.installmentPurchase.findMany({
        where: { userId },
        select: cyclePurchaseSelect,
      }),
    ]);

    const cardEarliestCycleIndexMap = buildCardEarliestCycleIndexMap(cycles);
    const expensesByCardId = groupBy(expenses, (expense) => expense.cardId);
    const subscriptionsByCardId = groupBy(
      subscriptions.filter((subscription) => subscription.cardId),
      (subscription) => subscription.cardId,
    );
    const purchasesByCardId = groupBy(purchases, (purchase) => purchase.cardId);

    const cyclesWithAmounts = cycles.map((cycle) => {
      const amounts = calculateCycleAmount({
        cycle,
        expenses,
        subscriptions,
        purchases,
        expensesByCardId,
        subscriptionsByCardId,
        purchasesByCardId,
        cardEarliestCycleIndexMap,
        includeBreakdown: false,
      });

      return {
        ...cycle,
        displayStatus: getDisplayStatus(cycle),
        ...amounts,
      };
    });

    return NextResponse.json({
      ok: true,
      cycles: cyclesWithAmounts,
    });
  } catch (error) {
    console.error("Error generating card cycles:", error);

    return NextResponse.json(
      { error: "No se pudieron generar los ciclos." },
      { status: 500 },
    );
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();

    const { id, statementAmount, paidAt, paidAmount, action } = body;

    if (!id || !action) {
      return NextResponse.json(
        { error: "Faltan id o action." },
        { status: 400 },
      );
    }

    if (action === "UPDATE_DATES") {
      const { startDate, cutDate, dueDate } = body;

      if (!startDate || !cutDate || !dueDate) {
        return NextResponse.json(
          { error: "Faltan fechas del ciclo." },
          { status: 400 },
        );
      }

      const parsedStartDate = new Date(`${startDate}T12:00:00.000Z`);
      const parsedCutDate = new Date(`${cutDate}T12:00:00.000Z`);
      const parsedDueDate = new Date(`${dueDate}T12:00:00.000Z`);

      if (
        Number.isNaN(parsedStartDate.getTime()) ||
        Number.isNaN(parsedCutDate.getTime()) ||
        Number.isNaN(parsedDueDate.getTime())
      ) {
        return NextResponse.json(
          { error: "Alguna fecha no es válida." },
          { status: 400 },
        );
      }

      if (parsedStartDate >= parsedCutDate) {
        return NextResponse.json(
          { error: "La fecha de inicio debe ser menor a la fecha de corte." },
          { status: 400 },
        );
      }

      if (parsedCutDate >= parsedDueDate) {
        return NextResponse.json(
          { error: "La fecha límite debe ser posterior al corte." },
          { status: 400 },
        );
      }

      const cycle = await prisma.cardCycle.update({
        where: { id },
        data: {
          startDate: parsedStartDate,
          cutDate: parsedCutDate,
          dueDate: parsedDueDate,
        },
        select: cycleSelect,
      });

      return NextResponse.json({ cycle });
    }

    if (action === "UPDATE_STATEMENT") {
      if (!statementAmount) {
        return NextResponse.json(
          { error: "Falta monto estado de cuenta." },
          { status: 400 },
        );
      }

      const numericStatementAmount = Number(statementAmount);

      if (
        !Number.isFinite(numericStatementAmount) ||
        numericStatementAmount < 0
      ) {
        return NextResponse.json(
          { error: "El monto estado de cuenta no es válido." },
          { status: 400 },
        );
      }

      const cycle = await prisma.cardCycle.update({
        where: { id },
        data: {
          statementAmount: numericStatementAmount,
          status: "PAYMENT_PENDING",
        },
        select: cycleSelect,
      });

      return NextResponse.json({ cycle });
    }

    if (action === "MARK_AS_PAID") {
      if (!paidAt || !paidAmount) {
        return NextResponse.json(
          { error: "Faltan fecha de pago o monto pagado." },
          { status: 400 },
        );
      }

      const numericPaidAmount = Number(paidAmount);

      if (!Number.isFinite(numericPaidAmount) || numericPaidAmount <= 0) {
        return NextResponse.json(
          { error: "El monto pagado debe ser mayor a 0." },
          { status: 400 },
        );
      }

      const paidDate = new Date(`${paidAt}T12:00:00.000Z`);

      if (Number.isNaN(paidDate.getTime())) {
        return NextResponse.json(
          { error: "Fecha de pago no válida." },
          { status: 400 },
        );
      }

      const cycle = await prisma.cardCycle.update({
        where: { id },
        data: {
          paidAt: paidDate,
          paidAmount: numericPaidAmount,
          status: "PAID",
        },
        select: cycleSelect,
      });

      return NextResponse.json({ cycle });
    }

    if (action === "UNMARK_AS_PAID") {
      const currentCycle = await prisma.cardCycle.findUnique({
        where: { id },
      });

      if (!currentCycle) {
        return NextResponse.json(
          { error: "Ciclo no encontrado." },
          { status: 404 },
        );
      }

      const nextStatus = currentCycle.statementAmount
        ? "PAYMENT_PENDING"
        : "OPEN";

      const cycle = await prisma.cardCycle.update({
        where: { id },
        data: {
          paidAt: null,
          paidAmount: null,
          status: nextStatus,
        },
        select: cycleSelect,
      });

      return NextResponse.json({ cycle });
    }

    return NextResponse.json(
      { error: "Acción no permitida." },
      { status: 400 },
    );
  } catch (error) {
    console.error("Error updating card cycle:", error);

    return NextResponse.json(
      { error: "No se pudo actualizar el ciclo." },
      { status: 500 },
    );
  }
}
