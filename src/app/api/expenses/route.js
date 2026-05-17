import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function updatePayableStatusIfNeeded(payableAccountId) {
  if (!payableAccountId) return;

  const payable = await prisma.payableAccount.findUnique({
    where: { id: payableAccountId },
    include: {
      dailyExpenses: true,
    },
  });

  if (!payable) return;

  const paidAmount = payable.dailyExpenses.reduce((sum, expense) => {
    return sum + Number(expense.amount || 0);
  }, 0);

  const pendingBalance = Number(payable.originalAmount || 0) - paidAmount;

  const nextStatus = pendingBalance <= 0 ? "PAID_OFF" : "ACTIVE";

  if (payable.status !== nextStatus) {
    await prisma.payableAccount.update({
      where: { id: payableAccountId },
      data: {
        status: nextStatus,
      },
    });
  }
}

function parseDateInput(dateValue) {
  if (!dateValue) return null;
  return new Date(`${dateValue}T12:00:00.000Z`);
}

function parseStartDate(dateValue) {
  if (!dateValue) return null;
  return new Date(`${dateValue}T00:00:00.000Z`);
}

function parseEndDate(dateValue) {
  if (!dateValue) return null;
  return new Date(`${dateValue}T23:59:59.999Z`);
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const userId = searchParams.get("userId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const categoryId = searchParams.get("categoryId");
    const paymentMethod = searchParams.get("paymentMethod");
    const cardId = searchParams.get("cardId");
    const concept = searchParams.get("concept");

    if (!userId) {
      return NextResponse.json({ error: "Falta userId." }, { status: 400 });
    }

    const where = { userId };

    if (startDate || endDate) {
      where.date = {};

      if (startDate) {
        where.date.gte = parseStartDate(startDate);
      }

      if (endDate) {
        where.date.lte = parseEndDate(endDate);
      }
    }

    if (categoryId && categoryId !== "ALL") {
      where.categoryId = categoryId;
    }

    if (paymentMethod && paymentMethod !== "ALL") {
      where.paymentMethod = paymentMethod;
    }

    if (cardId && cardId !== "ALL") {
      where.cardId = cardId;
    }

    if (concept?.trim()) {
      where.concept = {
        contains: concept.trim(),
        mode: "insensitive",
      };
    }

    const expenses = await prisma.dailyExpense.findMany({
      where,
      include: {
        card: true,
        category: true,
        person: true,
        receivableAccount: true,
        payableAccount: true,
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 100,
    });

    const total = expenses.reduce((sum, expense) => {
      return sum + Number(expense.amount || 0);
    }, 0);

    return NextResponse.json({ expenses, total });
  } catch (error) {
    console.error("Error loading expenses:", error);

    return NextResponse.json(
      { error: "No se pudieron cargar los gastos." },
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
      paymentMethod,
      cardId,
      concept,
      amount,
      categoryId,
      notes,
      personId,
      receivableAccountId,
      payableAccountId,
      createReceivable,
    } = body;

    if (
      !userId ||
      !date ||
      !paymentMethod ||
      !concept ||
      !amount ||
      !categoryId
    ) {
      return NextResponse.json(
        { error: "Faltan datos obligatorios." },
        { status: 400 },
      );
    }

    if (!["CASH", "CARD"].includes(paymentMethod)) {
      return NextResponse.json(
        { error: "Método de pago no válido." },
        { status: 400 },
      );
    }

    if (paymentMethod === "CARD" && !cardId) {
      return NextResponse.json(
        { error: "Debes seleccionar una tarjeta." },
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

    let finalReceivableAccountId = receivableAccountId || null;

    if (personId && createReceivable) {
      const receivable = await prisma.receivableAccount.create({
        data: {
          userId,
          personId,
          concept: concept.trim(),
          originalAmount: numericAmount,
          originDate: parsedDate,
          status: "ACTIVE",
          originType: "DAILY_EXPENSE",
        },
      });

      finalReceivableAccountId = receivable.id;
    }

    const expense = await prisma.dailyExpense.create({
      data: {
        userId,
        date: parsedDate,
        paymentMethod,
        cardId: paymentMethod === "CARD" ? cardId : null,
        concept: concept.trim(),
        amount: numericAmount,
        categoryId,
        notes: notes?.trim() || null,
        personId: personId || null,
        receivableAccountId: finalReceivableAccountId,
        payableAccountId: payableAccountId || null,
      },
      include: {
        card: true,
        category: true,
        person: true,
        receivableAccount: true,
        payableAccount: true,
      },
    });

    if (payableAccountId) {
      await updatePayableStatusIfNeeded(payableAccountId);
    }

    return NextResponse.json({ expense });
  } catch (error) {
    console.error("Error creating expense:", error);

    return NextResponse.json(
      { error: "No se pudo crear el gasto." },
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

    const existingExpense = await prisma.dailyExpense.findUnique({
      where: { id },
    });

    if (!existingExpense) {
      return NextResponse.json(
        { error: "Gasto no encontrado." },
        { status: 404 },
      );
    }

    const previousPayableAccountId = existingExpense.payableAccountId;

    await prisma.dailyExpense.delete({
      where: { id },
    });

    if (previousPayableAccountId) {
      await updatePayableStatusIfNeeded(previousPayableAccountId);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting expense:", error);

    return NextResponse.json(
      { error: "No se pudo eliminar el gasto." },
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
      paymentMethod,
      cardId,
      concept,
      amount,
      categoryId,
      notes,
    } = body;

    if (!id) {
      return NextResponse.json({ error: "Falta id." }, { status: 400 });
    }

    if (!date || !paymentMethod || !concept || !amount || !categoryId) {
      return NextResponse.json(
        { error: "Faltan datos obligatorios." },
        { status: 400 },
      );
    }

    if (!["CASH", "CARD"].includes(paymentMethod)) {
      return NextResponse.json(
        { error: "Método de pago no válido." },
        { status: 400 },
      );
    }

    if (paymentMethod === "CARD" && !cardId) {
      return NextResponse.json(
        { error: "Debes seleccionar una tarjeta." },
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

    const expense = await prisma.dailyExpense.update({
      where: { id },
      data: {
        date: parsedDate,
        paymentMethod,
        cardId: paymentMethod === "CARD" ? cardId : null,
        concept: concept.trim(),
        amount: numericAmount,
        categoryId,
        notes: notes?.trim() || null,
      },
      include: {
        card: true,
        category: true,
        person: true,
        receivableAccount: true,
        payableAccount: true,
      },
    });

    return NextResponse.json({ expense });
  } catch (error) {
    console.error("Error updating expense:", error);

    return NextResponse.json(
      { error: "No se pudo actualizar el gasto." },
      { status: 500 },
    );
  }
}
