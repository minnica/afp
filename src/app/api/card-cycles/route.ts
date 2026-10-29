import { readPage, readYear, cycleExpenseWhere, monthWindow, relevantPurchaseIds, previousCycleReferences, dashboardCycleIds, dashboardWindow, subscriptionHistoryWhere } from "@/lib/historyWindow";
import type { Prisma } from "@prisma/client";
import { readFinancialInput } from "@/lib/financialContracts";
import { getCyclePaymentState, getStoredCycleStatus, parseCycleMoney } from "@/lib/calculations/cardCyclePayments";
import { mexicoDayNumber } from '@/lib/financialDates';
import { apiResponse as NextResponse, requireApiUser, apiAccessErrorResponse, requireOwnedReferences, ApiAccessError } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { cycleCreditSelect } from "@/lib/calculations/cardCredits";
import { calculateCycleAmount } from "@/lib/calculations/cardCycles";
import { getCyclePeriodWarnings } from "@/lib/calculations/cycleDataQuality";
import { guardCapturedPaymentTotal } from "@/lib/capturePayments";

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
  datesConfirmedAt: true,
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
    select: {
      id: true,
      name: true,
      usualCutDay: true,
      usualDueDay: true,
    },
  },
} satisfies Prisma.CardCycleSelect;

const cycleExpenseSelect = {
  reconciliationStatus: true, reconciledAt: true,
  captureMovements: { select: { events: { select: { sourcePackage: true } } } },
  subscriptionCharge: { select: { month: true } },
  subscriptionId: true,
  paymentMethod: true,
  id: true,
  cardId: true,
  concept: true,
  amount: true,
  cashContributionAmount: true,
  date: true,
  category: {
    select: {
      name: true,
    },
  },
} satisfies Prisma.DailyExpenseSelect;

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
} satisfies Prisma.SubscriptionSelect;

const cyclePurchaseSelect = {
  reconciliationStatus: true, reconciledAt: true,
  captureMovements: { select: { events: { select: { sourcePackage: true } } } },
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
} satisfies Prisma.InstallmentPurchaseSelect;

function groupBy<T, K>(items: T[], getKey: (item: T) => K) {
  const map = new Map<K, T[]>();

  for (const item of items) {
    const key = getKey(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }

  return map;
}

function getDaysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function createDate(year: number, monthIndex: number, day: number) {
  const safeDay = Math.min(day, getDaysInMonth(year, monthIndex));

  // Usamos mediodía UTC para reducir problemas de zona horaria.
  return new Date(Date.UTC(year, monthIndex, safeDay, 12, 0, 0));
}

function getCycleDates(year: number, monthIndex: number, cutDay: number, dueDay: number) {
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
  const year = new Date(mexicoDayNumber()).getUTCFullYear();

  return Array.from({ length: 12 }, (_, monthIndex) => ({
    month: monthIndex + 1,
    year,
    monthIndex,
  }));
}

async function loadCycles(request: Request, generated = false, owner?: string) {
  try {
    const userId = owner ?? (await requireApiUser(request)).id;
    const url = new URL(request.url);
    if (generated) { url.search = ""; url.searchParams.set("year", String(new Date(mexicoDayNumber()).getUTCFullYear())); }
    const searchParams = url.searchParams;
    const cycleId = searchParams.get("cycleId");
    const includeBreakdown =
      Boolean(cycleId) || searchParams.get("includeBreakdown") === "true";


    let pagination;
    let year: number;
    try {
      pagination = readPage(searchParams);
      year = readYear(searchParams.get("year"), new Date(mexicoDayNumber()).getUTCFullYear());
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Filtros no válidos." }, { status: 400 });
    }
    const extra = !cycleId && !searchParams.has("year") ? await dashboardCycleIds(prisma, userId,
      dashboardWindow(new Date(mexicoDayNumber()), false), new Date(mexicoDayNumber() + 86400000)) : [];
    const where = { userId, ...(cycleId ? { id: cycleId } : searchParams.has("year") ? { year } : { OR: [{ year }, { id: { in: extra.map(item => item.id) } }] }) };
    const { cycles, totalCount, page, pageCount } = await prisma.$transaction(async tx => {
      const totalCount = await tx.cardCycle.count({ where });
      const pageCount = Math.max(1, Math.ceil(totalCount / pagination.pageSize));
      const page = Math.min(pagination.page, pageCount);
      const cycles = await tx.cardCycle.findMany({ where, select: cycleSelect,
        orderBy: [{ year: "asc" }, { month: "asc" }, { card: { name: "asc" } }, { id: "asc" }],
        take: cycleId ? 1 : pagination.pageSize, skip: cycleId ? 0 : (page - 1) * pagination.pageSize,
      });
      return { cycles, totalCount, page, pageCount };
    }, { isolationLevel: "RepeatableRead" });
    if (!cycles.length) return NextResponse.json(cycleId ? { cycle: null } : { cycles: [], totalCount, page, pageCount, pageSize: pagination.pageSize, year });
    const windows = cycles.map(cycle => monthWindow(cycle.startDate, cycle.cutDate));
    const monthRanges = windows.map(item => ({ month: { gte: item.start.toISOString().slice(0, 7), lt: item.end.toISOString().slice(0, 7) } }));
    const purchaseIds = await relevantPurchaseIds(prisma, userId, windows);
    const [expenses, subscriptions, purchases, previous] = await Promise.all([
      prisma.dailyExpense.findMany({ where: cycleExpenseWhere(userId, cycles), select: cycleExpenseSelect }),
      prisma.subscription.findMany({ where: { ...subscriptionHistoryWhere(userId, windows), cardId: { in: cycles.map(cycle => cycle.cardId) } }, select: { ...cycleSubscriptionSelect, charges: { ...cycleSubscriptionSelect.charges, where: { OR: monthRanges } } } }),
      prisma.installmentPurchase.findMany({ where: { userId, id: { in: purchaseIds.map(item => item.id) } }, select: cyclePurchaseSelect }),
      // Una consulta para los predecesores de toda la página, sin N+1.
      previousCycleReferences(prisma, userId, cycles.map(cycle => cycle.id)),
    ]);
    const context = [...cycles, ...previous.map(item => ({ ...cycles.find(cycle => cycle.cardId === item.cardId)!, ...item }))];

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
        ...getCyclePaymentState(cycle),
        dataWarnings: getCyclePeriodWarnings(cycle, context),
        ...amounts,
      };
    });

    if (cycleId) {
      return NextResponse.json({ cycle: cyclesWithAmounts[0] || null });
    }

    return NextResponse.json({ ...(generated ? { ok: true } : {}), cycles: cyclesWithAmounts, totalCount, page, pageCount, pageSize: pagination.pageSize, year });
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

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request);
    const userId = user.id;
    const body = readFinancialInput(await request.json());
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

    return loadCycles(request, true, userId);
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

// Serializa cambios de importe, pago y fechas para recalcular sobre la última fila.
type CycleUpdate = Partial<{ startDate: Date; cutDate: Date; dueDate: Date; datesConfirmedAt: Date; statementAmount: number; paidAmount: number | null; paidAt: Date | null; postCutCreditAmount: number; postCutCreditDate: Date | null; postCutCreditNotes: string | null }>;
async function updateCycle(userId: string, id: string, getData: (current: Prisma.CardCycleGetPayload<object>) => CycleUpdate) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM card_cycles WHERE id = ${id} AND "userId" = ${userId} FOR UPDATE`;
    const current = await tx.cardCycle.findUnique({ where: { id, userId } });
    if (!current) throw new ApiAccessError("Ciclo no encontrado.", 404);
    const data = getData(current);
    await guardCapturedPaymentTotal(tx, current, data);
    const next = { ...current, ...data };
    if (Number(next.postCutCreditAmount ?? 0) > 0) {
      if (next.statementAmount == null || Math.round(Number(next.postCutCreditAmount) * 100) > Math.round(Number(next.statementAmount) * 100)) {
        throw new ApiAccessError("La devolución aplicada no puede superar el estado de cuenta. Revisa primero las devoluciones de este corte.", 409);
      }
      if (new Date(next.postCutCreditDate!).toISOString().slice(0, 10) <= new Date(next.cutDate).toISOString().slice(0, 10)) {
        throw new ApiAccessError("La fecha de aplicación debe ser posterior al corte; los créditos incluidos en el estado de cuenta no se descuentan de nuevo.", 409);
      }
    }
    const now = new Date();
    const status = getStoredCycleStatus({ ...current, ...data }, now);
    const cycle = await tx.cardCycle.update({
      where: { id, userId }, data: { ...data, status }, select: cycleSelect,
    });
    return { ...cycle, ...getCyclePaymentState(cycle, now) };
  });
}

export async function PATCH(request: Request) {
  try {
    const user = await requireApiUser(request);
    const userId = user.id;
    const body = readFinancialInput(await request.json());
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

      const cycle = await updateCycle(userId, id, () => ({
        startDate: parsedStartDate, cutDate: parsedCutDate, dueDate: parsedDueDate,
        // Guardar también confirma las fechas cuando coinciden con las previstas.
        datesConfirmedAt: new Date(),
      }));

      return NextResponse.json({ cycle });
    }

    if (action === "UPDATE_STATEMENT") {
      const amount = parseCycleMoney(statementAmount);
      if (amount === null) {
        throw new ApiAccessError("El estado de cuenta debe ser un importe no negativo con hasta dos decimales.", 400);
      }
      const cycle = await updateCycle(userId, id, () => ({ statementAmount: amount }));
      return NextResponse.json({ cycle });
    }

    if (action === "MARK_AS_PAID") {
      const amount = parseCycleMoney(paidAmount);
      if (amount === null) {
        throw new ApiAccessError("El total pagado debe ser un importe no negativo con hasta dos decimales.", 400);
      }
      // Cero no crea una fecha ni un movimiento de pago ficticio.
      let paidDate: Date | null = null;
      if (amount > 0) {
        paidDate = typeof paidAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(paidAt)
          ? new Date(`${paidAt}T12:00:00.000Z`) : new Date(NaN);
        if (!Number.isFinite(paidDate.getTime()) || paidDate.toISOString().slice(0, 10) !== paidAt) {
          throw new ApiAccessError("Fecha de pago no válida.", 400);
        }
      }
      const cycle = await updateCycle(userId, id, (current) => {
        if (current.statementAmount == null) {
          throw new ApiAccessError("Captura el estado de cuenta antes de registrar el total pagado.", 409);
        }
        return { paidAt: paidDate, paidAmount: amount === 0 ? null : amount };
      });
      return NextResponse.json({ cycle });
    }

    if (action === "UPDATE_POST_CUT_CREDIT") {
      const amount = parseCycleMoney(body.postCutCreditAmount);
      if (amount === null) {
        throw new ApiAccessError("La devolución debe ser un importe no negativo con hasta dos decimales.", 400);
      }
      let date: Date | null = null;
      let notes: string | null = null;
      if (amount > 0) {
        const value = body.postCutCreditDate;
        date = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
          ? new Date(`${value}T12:00:00.000Z`) : new Date(NaN);
        if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || value > new Date().toISOString().slice(0, 10)) {
          throw new ApiAccessError("Indica una fecha de aplicación válida, que no sea futura.", 400);
        }
        if (typeof body.postCutCreditNotes !== "string" || !body.postCutCreditNotes.trim() || body.postCutCreditNotes.length > 2000) {
          throw new ApiAccessError("Indica el concepto o referencia de las devoluciones (máximo 2000 caracteres).", 400);
        }
        notes = body.postCutCreditNotes.trim();
      }
      const cycle = await updateCycle(userId, id, (current) => {
        if (amount > 0 && current.statementAmount == null) {
          throw new ApiAccessError("Captura el estado de cuenta antes de aplicar una devolución.", 409);
        }
        return { postCutCreditAmount: amount, postCutCreditDate: date, postCutCreditNotes: notes };
      });
      return NextResponse.json({ cycle });
    }

    if (action === "UNMARK_AS_PAID") {
      const cycle = await updateCycle(userId, id, () => ({ paidAt: null, paidAmount: null }));
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

export async function GET(request: Request) { return loadCycles(request); }
