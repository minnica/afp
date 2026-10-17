import { apiResponse as NextResponse, requireApiUser, apiAccessErrorResponse, requireOwnedReferences } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { cycleCreditSelect } from "@/lib/calculations/cardCredits";
import { calculateCycleAmount } from "@/lib/calculations/cardCycles";
import { getCyclePeriodWarnings } from "@/lib/calculations/cycleDataQuality";

const cycleSelect = {
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
    select: {
      id: true,
      name: true,
      usualCutDay: true,
      usualDueDay: true,
    },
  },
};

const cycleExpenseSelect = {
  subscriptionCharge: { select: { month: true } },
  subscriptionId: true,
  paymentMethod: true,
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
  charges: { select: { month: true, status: true, expenseId: true } },
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

function getDisplayStatus(cycle) {
  const today = new Date();
  const cutDate = new Date(cycle.cutDate);
  const dueDate = new Date(cycle.dueDate);

  if (cycle.paidAt || cycle.paidAmount) return "PAID";
  if (today > dueDate) return "OVERDUE";
  if (today >= cutDate && cycle.statementAmount !== null && cycle.statementAmount !== undefined) return "PAYMENT_PENDING";
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
    const user = await requireApiUser(request);
    const userId = user.id;
    const { searchParams } = new URL(request.url);
    const cycleId = searchParams.get("cycleId");
    const includeBreakdown =
      Boolean(cycleId) || searchParams.get("includeBreakdown") === "true";


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

    const expensesByCardId = groupBy(expenses, (expense) => expense.cardId);
    const subscriptionsByCardId = groupBy(
      subscriptions.filter((subscription) => subscription.cardId),
      (subscription) => subscription.cardId,
    );
    const purchasesByCardId = groupBy(purchases, (purchase) => purchase.cardId);

    const targetCycles = cycleId ? cycles.filter((cycle) => cycle.id === cycleId) : cycles;
    const cyclesWithAmounts = targetCycles.map((cycle) => {
      const amounts = calculateCycleAmount({
        cycle,
        expenses,
        subscriptions,
        purchases,
        expensesByCardId,
        subscriptionsByCardId,
        purchasesByCardId,
        includeBreakdown,
      });

      return {
        ...cycle,
        displayStatus: getDisplayStatus(cycle),
        dataWarnings: getCyclePeriodWarnings(cycle, cycles),
        ...amounts,
      };
    });

    if (cycleId) {
      return NextResponse.json({ cycle: cyclesWithAmounts[0] || null });
    }

    return NextResponse.json({ cycles: cyclesWithAmounts });
  } catch (error) {
    const accessResponse = apiAccessErrorResponse(error);
    if (accessResponse) return accessResponse;
    console.error("Error loading card cycles:", error);

    return NextResponse.json(
      { error: "No se pudieron cargar los ciclos." },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const user = await requireApiUser(request);
    const userId = user.id;
    const body = await request.json();
    await requireOwnedReferences(prisma, userId, body, []);

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
            userId,
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
        includeBreakdown: false,
      });

      return {
        ...cycle,
        displayStatus: getDisplayStatus(cycle),
        dataWarnings: getCyclePeriodWarnings(cycle, cycles),
        ...amounts,
      };
    });

    return NextResponse.json({
      ok: true,
      cycles: cyclesWithAmounts,
    });
  } catch (error) {
    const accessResponse = apiAccessErrorResponse(error);
    if (accessResponse) return accessResponse;
    console.error("Error generating card cycles:", error);

    return NextResponse.json(
      { error: "No se pudieron generar los ciclos." },
      { status: 500 },
    );
  }
}

export async function PATCH(request) {
  try {
    const user = await requireApiUser(request);
    const userId = user.id;
    const body = await request.json();
    await requireOwnedReferences(prisma, userId, body, []);

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
        where: { id, userId },
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
        where: { id, userId },
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
        where: { id, userId },
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
        where: { id, userId },
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
        where: { id, userId },
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
    const accessResponse = apiAccessErrorResponse(error);
    if (accessResponse) return accessResponse;
    console.error("Error updating card cycle:", error);

    return NextResponse.json(
      { error: "No se pudo actualizar el ciclo." },
      { status: 500 },
    );
  }
}
