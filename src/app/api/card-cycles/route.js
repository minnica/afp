import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
  cardCycles,
}) {
  const includedExpenses = expenses
    .filter((expense) => expense.cardId === cycle.cardId)
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

  const includedSubscriptions = subscriptions
    .filter((subscription) => subscription.paymentMethod === "CARD")
    .filter((subscription) => subscription.cardId === cycle.cardId)
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

  const includedPurchases = purchases
    .filter((purchase) => purchase.cardId === cycle.cardId)
    .filter((purchase) =>
      shouldIncludePurchaseInCycle(purchase, cycle, cardCycles),
    )
    .map((purchase) => {
      const cycleNumber = getPurchaseCycleNumber(purchase, cycle, cardCycles);
      const paymentsAlreadyMade = Number(purchase.initialPaymentsMade || 0);
      const months = Number(purchase.months || 0);

      const currentMonth = Math.min(
        months,
        Math.max(cycleNumber || 1, paymentsAlreadyMade + 1),
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
    includedExpenses,
    includedSubscriptions,
    includedPurchases,
  };
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

  return [-1, 0, 1].map((offset) => {
    const date = new Date(
      Date.UTC(now.getFullYear(), now.getMonth() + offset, 1, 12, 0, 0),
    );

    return {
      month: date.getUTCMonth() + 1,
      year: date.getUTCFullYear(),
      monthIndex: date.getUTCMonth(),
    };
  });
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "Falta userId." }, { status: 400 });
    }

    const [cycles, expenses, subscriptions, purchases] = await Promise.all([
      prisma.cardCycle.findMany({
        where: { userId },
        include: {
          card: true,
        },
        orderBy: [{ year: "asc" }, { month: "asc" }, { card: { name: "asc" } }],
      }),
      prisma.dailyExpense.findMany({
        where: { userId },
        include: {
          category: true,
        },
      }),
      prisma.subscription.findMany({
        where: { userId },
        include: {
          category: true,
        },
      }),
      prisma.installmentPurchase.findMany({
        where: { userId },
        include: {
          category: true,
        },
      }),
    ]);

    const cyclesWithAmounts = cycles.map((cycle) => {
      const amounts = calculateCycleAmount({
        cycle,
        expenses,
        subscriptions,
        purchases,
        cardCycles: cycles,
      });

      return {
        ...cycle,
        ...amounts,
      };
    });

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
        include: {
          card: true,
        },
        orderBy: [{ year: "asc" }, { month: "asc" }, { card: { name: "asc" } }],
      }),
      prisma.dailyExpense.findMany({
        where: { userId },
        include: {
          category: true,
        },
      }),
      prisma.subscription.findMany({
        where: { userId },
        include: {
          category: true,
        },
      }),
      prisma.installmentPurchase.findMany({
        where: { userId },
        include: {
          category: true,
        },
      }),
    ]);

    const cyclesWithAmounts = cycles.map((cycle) => {
      const amounts = calculateCycleAmount({
        cycle,
        expenses,
        subscriptions,
        purchases,
        cardCycles: cycles,
      });

      return {
        ...cycle,
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
        include: {
          card: true,
        },
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
        include: {
          card: true,
        },
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
        include: {
          card: true,
        },
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
        include: {
          card: true,
        },
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
