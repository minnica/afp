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
};

function parseDateInput(dateValue) {
  if (!dateValue) return null;
  return new Date(`${dateValue}T12:00:00.000Z`);
}

export async function GET(request) {
  try {
    const user = await requireApiUser(request);
    const userId = user.id;

    const incomes = await prisma.income.findMany({
      where: { userId },
      select: incomeSelect,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 100,
    });

    const total = incomes.reduce((sum, income) => {
      return sum + Number(income.amount || 0);
    }, 0);

    return NextResponse.json({ incomes, total });
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

export async function POST(request) {
  try {
    const user = await requireApiUser(request);
    const userId = user.id;
    const body = await request.json();
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

export async function DELETE(request) {
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

export async function PATCH(request) {
  try {
    const user = await requireApiUser(request);
    const userId = user.id;
    const body = await request.json();
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
          receivableAccountId: nextReceivableAccountId,
          notes: notes?.trim() || null,
        },
        select: incomeSelect,
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
