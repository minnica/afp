import { NextResponse } from "next/server";
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

async function updateReceivableStatusIfNeeded(receivableAccountId) {
  if (!receivableAccountId) return;

  const [receivable, paid] = await Promise.all([
    prisma.receivableAccount.findUnique({
      where: { id: receivableAccountId },
      select: {
        originalAmount: true,
        status: true,
      },
    }),
    prisma.income.aggregate({
      where: { receivableAccountId },
      _sum: {
        amount: true,
      },
    }),
  ]);

  if (!receivable) return;

  const paidAmount = Number(paid._sum.amount || 0);
  const pendingBalance = Number(receivable.originalAmount || 0) - paidAmount;

  if (pendingBalance <= 0 && receivable.status !== "PAID_OFF") {
    await prisma.receivableAccount.update({
      where: { id: receivableAccountId },
      data: {
        status: "PAID_OFF",
      },
    });
  }

  if (pendingBalance > 0 && receivable.status === "PAID_OFF") {
    await prisma.receivableAccount.update({
      where: { id: receivableAccountId },
      data: {
        status: "ACTIVE",
      },
    });
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "Falta userId." }, { status: 400 });
    }

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
    console.error("Error loading incomes:", error);

    return NextResponse.json(
      { error: "No se pudieron cargar los ingresos." },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();

    const {
      userId,
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

    const income = await prisma.income.create({
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
      await updateReceivableStatusIfNeeded(receivableAccountId);
    }

    return NextResponse.json({ income });
  } catch (error) {
    console.error("Error creating income:", error);

    return NextResponse.json(
      { error: "No se pudo crear el ingreso." },
      { status: 500 },
    );
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Falta id." }, { status: 400 });
    }

    const income = await prisma.income.findUnique({
      where: { id },
    });

    if (!income) {
      return NextResponse.json(
        { error: "Ingreso no encontrado." },
        { status: 404 },
      );
    }

    const receivableAccountId = income.receivableAccountId;

    await prisma.income.delete({
      where: { id },
    });

    if (receivableAccountId) {
      await updateReceivableStatusIfNeeded(receivableAccountId);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting income:", error);

    return NextResponse.json(
      { error: "No se pudo eliminar el ingreso." },
      { status: 500 },
    );
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();

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

    const existingIncome = await prisma.income.findUnique({
      where: { id },
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

    const income = await prisma.income.update({
      where: { id },
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

    if (previousReceivableAccountId) {
      await updateReceivableStatusIfNeeded(previousReceivableAccountId);
    }

    if (
      nextReceivableAccountId &&
      nextReceivableAccountId !== previousReceivableAccountId
    ) {
      await updateReceivableStatusIfNeeded(nextReceivableAccountId);
    }

    if (
      nextReceivableAccountId &&
      nextReceivableAccountId === previousReceivableAccountId
    ) {
      await updateReceivableStatusIfNeeded(nextReceivableAccountId);
    }

    return NextResponse.json({ income });
  } catch (error) {
    console.error("Error updating income:", error);

    return NextResponse.json(
      { error: "No se pudo actualizar el ingreso." },
      { status: 500 },
    );
  }
}
