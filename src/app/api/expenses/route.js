import { apiResponse as NextResponse, requireApiUser, apiAccessErrorResponse, requireOwnedReferences, ApiAccessError } from "@/lib/apiAuth";
import { lockDebtAccounts, runDebtAccountOperation, refreshDebtAccount } from "@/lib/debtAccountService";
import { prisma } from "@/lib/prisma";
import { applySubscriptionCharge, SubscriptionChargeError } from "@/lib/subscriptionChargeService";

import { runExpenseOperation } from "@/lib/expenseOperations";

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
    const user = await requireApiUser(request);
    const userId = user.id;
    const { searchParams } = new URL(request.url);

    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const categoryId = searchParams.get("categoryId");
    const paymentMethod = searchParams.get("paymentMethod");
    const cardId = searchParams.get("cardId");
    const concept = searchParams.get("concept");
    const amount = searchParams.get("amount");


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
    const accessResponse = apiAccessErrorResponse(error);
    if (accessResponse) return accessResponse;
    console.error("Error loading expenses:", error);

    return NextResponse.json(
      { error: "No se pudieron cargar los gastos." },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const user = await requireApiUser(request);
    const userId = user.id;
    const body = await request.json();
    const result = await runExpenseOperation(prisma, userId, body, async tx => {
      await lockDebtAccounts(tx, userId);
      await requireOwnedReferences(tx, userId, body, ["cardId", "categoryId", "personId", "receivableAccountId", "payableAccountId", "subscriptionId"]);

      const {
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
        throw new ApiAccessError("Faltan datos obligatorios.", 400);
      }

      if (!["CASH", "CARD"].includes(paymentMethod)) {
        throw new ApiAccessError("Método de pago no válido.", 400);
      }

      if (paymentMethod === "CARD" && !cardId) {
        throw new ApiAccessError("Debes seleccionar una tarjeta.", 400);
      }

      const numericAmount = Number(amount);

      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        throw new ApiAccessError("El monto debe ser mayor a 0.", 400);
      }

      const parsedDate = parseDateInput(date);

      if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
        throw new ApiAccessError("Fecha no válida.", 400);
      }

      let finalReceivableAccountId = receivableAccountId || null;

      if (subscriptionId) {
        const result = await applySubscriptionCharge(tx, userId, {
          subscriptionId, month: date.slice(0, 7), date, amount: numericAmount, action: "confirm",
          today: new Date().toISOString().slice(0, 10), createReceivable,
          expenseData: { concept: concept.trim(), paymentMethod, cardId: cardId || null, categoryId,
            notes: notes?.trim() || null, personId: personId || null,
            receivableAccountId: finalReceivableAccountId, payableAccountId: payableAccountId || null },
        });
        const expense = await tx.dailyExpense.findUnique({ where: { id: result.expenseId, userId }, select: expenseSelect });
        if (payableAccountId) await refreshDebtAccount(tx, userId, "payable", payableAccountId);
        return { expense, alreadyConfirmed: result.alreadyConfirmed };
      }

      if (personId && createReceivable) {
        const receivable = await tx.receivableAccount.create({
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

      const expense = await tx.dailyExpense.create({
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
        await refreshDebtAccount(tx, userId, "payable", payableAccountId);
      }

      return { expense };
    });
    return NextResponse.json(result);
  } catch (error) {
    const accessResponse = apiAccessErrorResponse(error);
    if (accessResponse) return accessResponse;
    if (error instanceof SubscriptionChargeError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Error creating expense:", error);

    return NextResponse.json(
      { error: "No se pudo crear el gasto." },
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

      const existingExpense = await tx.dailyExpense.findUnique({
        where: { id, userId },
      });

      if (!existingExpense) {
        return NextResponse.json(
          { error: "Gasto no encontrado." },
          { status: 404 },
        );
      }

      const previousPayableAccountId = existingExpense.payableAccountId;

      await tx.dailyExpense.delete({
        where: { id, userId },
      });

      if (previousPayableAccountId) {
        await refreshDebtAccount(tx, userId, "payable", previousPayableAccountId);
      }

      return NextResponse.json({ ok: true });
    });
  } catch (error) {
    const accessResponse = apiAccessErrorResponse(error);
    if (accessResponse) return accessResponse;
    console.error("Error deleting expense:", error);

    return NextResponse.json(
      { error: "No se pudo eliminar el gasto." },
      { status: 500 },
    );
  }
}

export async function PATCH(request) {
  try {
    const user = await requireApiUser(request);
    const userId = user.id;
    const body = await request.json();
    await requireOwnedReferences(prisma, userId, body, ["cardId", "categoryId", "personId", "receivableAccountId", "payableAccountId", "subscriptionId"]);

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

    const expense = await runDebtAccountOperation(prisma, userId, async tx => {
      const existing = await tx.dailyExpense.findUnique({ where: { id, userId } });
      if (!existing) throw new SubscriptionChargeError("Gasto no encontrado.", 404);
      for (const linkedId of [...new Set([existing.subscriptionId, subscriptionId].filter(Boolean))].sort()) {
        const rows = await tx.$queryRaw`SELECT "id" FROM "subscriptions" WHERE "id" = ${linkedId} AND "userId" = ${existing.userId} FOR UPDATE`;
        if (!rows.length) throw new SubscriptionChargeError("La suscripción no está disponible.", 404);
      }
      const linkedCharge = await tx.subscriptionCharge.findUnique({ where: { expenseId: id, userId } });
      if (linkedCharge && subscriptionId !== linkedCharge.subscriptionId) {
        throw new SubscriptionChargeError("Este gasto confirma una suscripción. Conserva su vínculo al editarlo.");
      }
      if (subscriptionId) {
        const month = linkedCharge?.month || date.slice(0, 7);
        const decision = await tx.subscriptionCharge.findUnique({ where: { subscriptionId_month: { subscriptionId, month }, userId } });
        if (decision?.status === "SKIPPED") throw new SubscriptionChargeError("Restaura el cobro omitido antes de vincularlo.", 409);
        const candidates = await tx.dailyExpense.findMany({ where: { subscriptionId, userId, id: { not: id } },
          select: { date: true, subscriptionCharge: { select: { month: true } } } });
        if (candidates.some(item => (item.subscriptionCharge?.month || item.date.toISOString().slice(0, 7)) === month)) {
          throw new SubscriptionChargeError("Ya existe un gasto para esta suscripción y mes.", 409);
        }
      }
      const updated = await tx.dailyExpense.update({
        where: { id, userId },
        data: {
          date: parsedDate, paymentMethod, cardId: paymentMethod === "CARD" ? cardId : null,
          concept: concept.trim(), amount: numericAmount, categoryId, notes: notes?.trim() || null,
          subscriptionId: subscriptionId || null,
        },
        select: expenseSelect,
      });
      await refreshDebtAccount(tx, userId, "payable", existing.payableAccountId);
      return updated;
    });

    return NextResponse.json({ expense });
  } catch (error) {
    const accessResponse = apiAccessErrorResponse(error);
    if (accessResponse) return accessResponse;
    if (error instanceof SubscriptionChargeError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Error updating expense:", error);

    return NextResponse.json(
      { error: "No se pudo actualizar el gasto." },
      { status: 500 },
    );
  }
}
