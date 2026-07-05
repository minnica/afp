import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const expenseSelect = {
  id: true,
  userId: true,
  date: true,
  paymentMethod: true,
  cardId: true,
  concept: true,
  amount: true,
  categoryId: true,
  notes: true,
  personId: true,
  receivableAccountId: true,
  payableAccountId: true,
  subscriptionId: true,
  createdAt: true,
  updatedAt: true,
  card: {
    select: {
      id: true,
      name: true,
    },
  },
  category: {
    select: {
      id: true,
      name: true,
    },
  },
  person: {
    select: {
      id: true,
      name: true,
    },
  },
  receivableAccount: {
    select: {
      id: true,
      concept: true,
    },
  },
  payableAccount: {
    select: {
      id: true,
      concept: true,
    },
  },
  subscription: {
    select: {
      id: true,
      name: true,
    },
  },
};

async function updatePayableStatusIfNeeded(payableAccountId) {
  if (!payableAccountId) return;

  const [payable, paid] = await Promise.all([
    prisma.payableAccount.findUnique({
      where: { id: payableAccountId },
      select: {
        originalAmount: true,
        status: true,
      },
    }),
    prisma.dailyExpense.aggregate({
      where: { payableAccountId },
      _sum: {
        amount: true,
      },
    }),
  ]);

  if (!payable) return;

  const paidAmount = Number(paid._sum.amount || 0);
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

function getAvailableMonths(expenseDates) {
  const months = new Set();

  expenseDates.forEach((expense) => {
    const date = new Date(expense.date);

    if (Number.isNaN(date.getTime())) return;

    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    months.add(`${year}-${month}`);
  });

  return Array.from(months).sort().reverse();
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
    const amount = searchParams.get("amount");

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

    if (amount?.trim()) {
      const numericAmount = Number(amount);

      if (Number.isFinite(numericAmount) && numericAmount >= 0) {
        where.amount = numericAmount;
      }
    }

    const [expenses, expenseDates] = await Promise.all([
      prisma.dailyExpense.findMany({
        where,
        select: expenseSelect,
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      }),
      prisma.dailyExpense.findMany({
        where: { userId },
        select: {
          date: true,
        },
        orderBy: [{ date: "desc" }],
      }),
    ]);

    const total = expenses.reduce((sum, expense) => {
      return sum + Number(expense.amount || 0);
    }, 0);

    return NextResponse.json({
      expenses,
      total,
      availableMonths: getAvailableMonths(expenseDates),
    });
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
      subscriptionId,
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
        subscriptionId: subscriptionId || null,
      },
      select: expenseSelect,
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
      subscriptionId,
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
        subscriptionId: subscriptionId || null,
      },
      select: expenseSelect,
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
