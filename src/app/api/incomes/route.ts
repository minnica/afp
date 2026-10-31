import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { validDay } from "@/lib/money/dates";
import { readFinancialInput } from "@/lib/financialContracts";
import { apiResponse as NextResponse, requireApiUser, apiAccessErrorResponse, requireOwnedReferences } from "@/lib/apiAuth";
import { runDebtAccountOperation, refreshDebtAccount } from "@/lib/debtAccountService";
import { prisma } from "@/lib/prisma";

const incomeSelect = {
  id: true,
  userId: true,
  date: true,
  incomeTypeId: true,
  source: true,
  concept: true,
  amount: true,
  isEstimated: true,
  receivableAccountId: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  incomeType: {
    select: {
      id: true,
      name: true,
    },
  },
  receivableAccount: {
    select: {
      id: true,
      concept: true,
      person: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
} satisfies Prisma.IncomeSelect;

function parseDateInput(dateValue: string | null | undefined) {
  if (!dateValue) return null;
  return new Date(`${dateValue}T12:00:00.000Z`);
}

const queryInteger = (maximum: number) => z.string().regex(/^[1-9]\d*$/, "Indica un entero mayor a cero.")
  .transform(Number).pipe(z.number().int("Indica un entero válido.").max(maximum, `Usa un valor de hasta ${maximum}.`));
const queryDay = z.string().refine(value => value === "" || validDay(value), "Indica una fecha válida.").default("");
const historyQuery = z.object({
  page: queryInteger(2147483647).default(1),
  pageSize: queryInteger(100).default(100),
  q: z.string().trim().max(200, "Usa hasta 200 caracteres en la búsqueda.").default(""),
  incomeTypeId: z.string().trim().max(100, "Tipo de ingreso no válido.").default(""),
  startDate: queryDay,
  endDate: queryDay,
  sortBy: z.enum(["date", "incomeType", "concept", "receivableAccount", "amount"], { error: "Orden no válido." }).default("date"),
  sortDirection: z.enum(["asc", "desc"], { error: "Dirección de orden no válida." }).default("desc"),
}).refine(value => !value.startDate || !value.endDate || value.startDate <= value.endDate,
  { message: "La fecha final debe ser igual o posterior a la inicial." });

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    const userId = user.id;

    const parsed = historyQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "Filtros no válidos." }, { status: 400 });
    }
    const { page: requestedPage, pageSize, q, incomeTypeId, startDate, endDate, sortBy, sortDirection } = parsed.data;
    const where: Prisma.IncomeWhereInput = {
      userId,
      ...(incomeTypeId ? { incomeTypeId } : {}),
      ...(startDate || endDate ? { date: {
        ...(startDate ? { gte: new Date(`${startDate}T00:00:00.000Z`) } : {}),
        ...(endDate ? { lte: new Date(`${endDate}T23:59:59.999Z`) } : {}),
      } } : {}),
      ...(q ? { OR: [
        { concept: { contains: q, mode: "insensitive" } },
        { source: { contains: q, mode: "insensitive" } },
        { notes: { contains: q, mode: "insensitive" } },
        { incomeType: { name: { contains: q, mode: "insensitive" } } },
        { receivableAccount: { concept: { contains: q, mode: "insensitive" } } },
        { receivableAccount: { person: { name: { contains: q, mode: "insensitive" } } } },
      ] } : {}),
    };
    const sortOrders: Record<typeof sortBy, Prisma.IncomeOrderByWithRelationInput[]> = {
      date: [{ date: sortDirection }],
      incomeType: [{ incomeType: { name: sortDirection } }],
      concept: [{ concept: sortDirection }],
      receivableAccount: [{ receivableAccount: { person: { name: sortDirection } } }, { receivableAccount: { concept: sortDirection } }],
      amount: [{ amount: sortDirection }],
    };
    // One snapshot keeps the page, count and SQL Decimal sum consistent during writes.
    const result = await prisma.$transaction(async tx => {
      const summary = await tx.income.aggregate({ where, _count: { _all: true }, _sum: { amount: true } });
      const totalCount = summary._count._all;
      const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
      const page = Math.min(requestedPage, pageCount);
      const incomes = await tx.income.findMany({
        where,
        select: incomeSelect,
        orderBy: [...sortOrders[sortBy], ...(sortBy === "date" ? [] : [{ date: "desc" as const }]), { createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      });
      return { incomes, total: Number(summary._sum.amount || 0), totalCount, page, pageSize, pageCount };
    }, { isolationLevel: "RepeatableRead" });

    return NextResponse.json(result);
  } catch (error) {
    const accessResponse = apiAccessErrorResponse(error);
    if (accessResponse) return accessResponse;
    console.error("Error loading incomes:", error);

    return NextResponse.json(
      { error: "No se pudieron cargar los ingresos." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request);
    const userId = user.id;
    const body = readFinancialInput(await request.json());
    return await runDebtAccountOperation(prisma, userId, async tx => {
      await requireOwnedReferences(tx, userId, body, ["incomeTypeId", "receivableAccountId"]);

      const {
        date,
        incomeTypeId,
        source,
        concept,
        amount,
        receivableAccountId,
        notes,
      } = body;

      if (!userId || !date || !incomeTypeId || !source || !concept || !amount) {
        return NextResponse.json(
          { error: "Faltan datos obligatorios." },
          { status: 400 },
        );
      }

      const numericAmount = Number(amount);

      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        return NextResponse.json(
          { error: "El monto debe ser mayor a 0." },
          { status: 400 },
        );
      }

      const parsedDate = parseDateInput(date);

      if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
        return NextResponse.json({ error: "Fecha no válida." }, { status: 400 });
      }

      const income = await tx.income.create({
        data: {
          userId,
          date: parsedDate,
          incomeTypeId,
          source: source.trim(),
          concept: concept.trim(),
          amount: numericAmount,
          receivableAccountId: receivableAccountId || null,
          notes: notes?.trim() || null,
        },
        select: incomeSelect,
      });

      if (receivableAccountId) {
        await refreshDebtAccount(tx, userId, "receivable", receivableAccountId);
      }

      return NextResponse.json({ income });
    });
  } catch (error) {
    const accessResponse = apiAccessErrorResponse(error);
    if (accessResponse) return accessResponse;
    console.error("Error creating income:", error);

    return NextResponse.json(
      { error: "No se pudo crear el ingreso." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireApiUser(request);
    const userId = user.id;
    return await runDebtAccountOperation(prisma, userId, async tx => {
      const { searchParams } = new URL(request.url);
      const id = searchParams.get("id");

      if (!id) {
        return NextResponse.json({ error: "Falta id." }, { status: 400 });
      }

      const income = await tx.income.findUnique({
        where: { id, userId },
        include: { _count: { select: { cardCycleCredits: true } } },
      });

      if (!income) {
        return NextResponse.json(
          { error: "Ingreso no encontrado." },
          { status: 404 },
        );
      }

      const receivableAccountId = income.receivableAccountId;

      if (income._count.cardCycleCredits > 0) {
        return NextResponse.json(
          { error: "Este ingreso tiene bonificaciones aplicadas a una tarjeta. Revisa esas aplicaciones antes de eliminarlo." },
          { status: 409 },
        );
      }

      await tx.income.delete({
        where: { id, userId },
      });

      if (receivableAccountId) {
        await refreshDebtAccount(tx, userId, "receivable", receivableAccountId);
      }

      return NextResponse.json({ ok: true });
    });
  } catch (error) {
    const accessResponse = apiAccessErrorResponse(error);
    if (accessResponse) return accessResponse;
    console.error("Error deleting income:", error);

    return NextResponse.json(
      { error: "No se pudo eliminar el ingreso." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireApiUser(request);
    const userId = user.id;
    const body = readFinancialInput(await request.json());
    return await runDebtAccountOperation(prisma, userId, async tx => {
      await requireOwnedReferences(tx, userId, body, ["incomeTypeId", "receivableAccountId"]);

      const {
        id,
        date,
        incomeTypeId,
        source,
        concept,
        amount,
        receivableAccountId,
        notes,
      } = body;

      if (!id) {
        return NextResponse.json({ error: "Falta id." }, { status: 400 });
      }

      if (!date || !incomeTypeId || !source || !concept || !amount) {
        return NextResponse.json(
          { error: "Faltan datos obligatorios." },
          { status: 400 },
        );
      }

      const existingIncome = await tx.income.findUnique({
        where: { id, userId },
      });

      if (!existingIncome) {
        return NextResponse.json(
          { error: "Ingreso no encontrado." },
          { status: 404 },
        );
      }

      const previousReceivableAccountId = existingIncome.receivableAccountId;

      const numericAmount = Number(amount);

      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        return NextResponse.json(
          { error: "El monto debe ser mayor a 0." },
          { status: 400 },
        );
      }

      const parsedDate = parseDateInput(date);

      if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
        return NextResponse.json({ error: "Fecha no válida." }, { status: 400 });
      }

      const nextReceivableAccountId = receivableAccountId || null;

      const appliedCredits = await tx.cardCycleCredit.aggregate({
        where: { incomeId: id, userId },
        _sum: { amount: true },
      });
      if (numericAmount < Number(appliedCredits._sum.amount || 0)) {
        return NextResponse.json(
          { error: "El importe no puede ser menor que las bonificaciones ya aplicadas a tarjetas." },
          { status: 409 },
        );
      }

      const income = await tx.income.update({
        where: { id, userId },
        data: {
          date: parsedDate,
          incomeTypeId,
          source: source.trim(),
          concept: concept.trim(),
          amount: numericAmount,
          isEstimated: false,
          receivableAccountId: nextReceivableAccountId,
          notes: notes?.trim() || null,
        },
        select: incomeSelect,
      });

      if (existingIncome.isEstimated) await tx.captureMovement.updateMany({
        where: { userId, moneyPosting: { is: { kind: 'INCOME', incomeId: id } } }, data: { reason: 'INCOME_REGISTERED' },
      });

      for (const accountId of new Set([previousReceivableAccountId, nextReceivableAccountId].filter(Boolean))) {
        await refreshDebtAccount(tx, userId, "receivable", accountId);
      }

      return NextResponse.json({ income });
    });
  } catch (error) {
    const accessResponse = apiAccessErrorResponse(error);
    if (accessResponse) return accessResponse;
    console.error("Error updating income:", error);

    return NextResponse.json(
      { error: "No se pudo actualizar el ingreso." },
      { status: 500 },
    );
  }
}
