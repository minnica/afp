import { expenseHistoryQuery, readExpenseHistory } from "@/lib/expenseHistory";
import type { Prisma } from "@prisma/client";
import { readFinancialInput } from "@/lib/financialContracts";
import { createExpenseInTransaction } from "@/lib/expenseService";
import { archiveCapturedExpense } from "@/lib/captureProcessing";
import { apiResponse as NextResponse, requireApiUser, apiAccessErrorResponse, requireOwnedReferences, ApiAccessError } from "@/lib/apiAuth";
import { runDebtAccountOperation, refreshDebtAccount } from "@/lib/debtAccountService";
import { prisma } from "@/lib/prisma";
import { SubscriptionChargeError } from "@/lib/subscriptionChargeService";

import { runExpenseOperation } from "@/lib/expenseOperations";
import { getCashContributionError } from "@/lib/sharedExpenses";
import { assertRefundExpenseEdit } from "@/lib/captureRefunds";

const expenseSelect = {
  reconciledAt: true,
  captureMovements: { select: { id: true, events: { select: { sourcePackage: true } } } },
  reconciliationStatus: true,
  id: true,
  userId: true,
  date: true,
  paymentMethod: true,
  cardId: true,
  debitAccountId: true,
  debitAccount: { select: { id: true, name: true } },
  concept: true,
  amount: true,
  refundOriginalAmount: true,
  cashContributionAmount: true,
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
} satisfies Prisma.DailyExpenseSelect;

function parseDateInput(dateValue: string | null | undefined) {
  if (!dateValue) return null;
  return new Date(`${dateValue}T12:00:00.000Z`);
}

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    const userId = user.id;
    const { searchParams } = new URL(request.url);

    let query;
    try { query = expenseHistoryQuery(searchParams); }
    catch { return NextResponse.json({ error: "Filtros o paginación no válidos." }, { status: 400 }); }
    return NextResponse.json(await readExpenseHistory(prisma, userId, query, expenseSelect));
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

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request);
    const userId = user.id;
    const body = readFinancialInput(await request.json());
    const result = await runExpenseOperation(prisma, userId, body, async tx => {
      return createExpenseInTransaction(tx, userId, body, expenseSelect);
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

      await archiveCapturedExpense(tx, existingExpense);

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

export async function PATCH(request: Request) {
  try {
    const user = await requireApiUser(request);
    const userId = user.id;
    const body = readFinancialInput(await request.json());
    await requireOwnedReferences(prisma, userId, body, []);

    const {
      id,
      date,
      paymentMethod,
      cardId,
      debitAccountId,
      concept,
      amount,
      categoryId,
      notes,
      subscriptionId,
    } = body;

    if (!id) {
      return NextResponse.json({ error: "Falta id." }, { status: 400 });
    }

    if (!date || !paymentMethod || !concept || amount === undefined || amount === null || amount === "" || !categoryId) {
      return NextResponse.json(
        { error: "Faltan datos obligatorios." },
        { status: 400 },
      );
    }

    if (!["CASH", "CARD", "DEBIT"].includes(paymentMethod)) {
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

    if (paymentMethod === "DEBIT" && !debitAccountId) throw new ApiAccessError("Selecciona la cuenta de débito.", 400);
    if (paymentMethod === "DEBIT" && subscriptionId) throw new ApiAccessError("Revisa la suscripción por separado.", 400);
    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount < 0) {
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
      await requireOwnedReferences(tx, userId, body, ["debitAccountId", "cardId", "categoryId", "personId", "receivableAccountId", "payableAccountId", "subscriptionId"]);
      const existing = await tx.dailyExpense.findUnique({ where: { id, userId } });
      if (!existing) throw new SubscriptionChargeError("Gasto no encontrado.", 404);
      if (numericAmount === 0 && existing.refundOriginalAmount == null) throw new ApiAccessError("El monto debe ser mayor a 0.", 400);
      assertRefundExpenseEdit(existing, body);
      if (paymentMethod === "DEBIT" && existing.receivableAccountId) throw new ApiAccessError("Revisa los vínculos de este gasto por separado.", 400);
      if (paymentMethod === "DEBIT" && existing.payableAccountId) {
        const payable = await tx.payableAccount.findFirst({ where: { id: existing.payableAccountId, userId } });
        if (payable?.accountType !== 'SIMPLE') throw new ApiAccessError("Los préstamos necesitan revisar capital e intereses por separado.", 409);
      }
      // Los clientes anteriores conservan la aportación al omitir el campo.
      const cashContributionAmount = body.cashContributionAmount === undefined
        ? String(existing.cashContributionAmount ?? 0) : body.cashContributionAmount;
      const contributionError = getCashContributionError({
        amount, cashContributionAmount,
        receivableAccountId: existing.receivableAccountId, payableAccountId: existing.payableAccountId,
      });
      if (contributionError) throw new ApiAccessError(contributionError, 400);
      for (const linkedId of [...new Set([existing.subscriptionId, subscriptionId].filter(Boolean))].sort()) {
        const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "subscriptions" WHERE "id" = ${linkedId} AND "userId" = ${existing.userId} FOR UPDATE`;
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
          date: parsedDate, paymentMethod: paymentMethod as "CASH" | "CARD" | "DEBIT", cardId: paymentMethod === "CARD" ? cardId : null, debitAccountId: paymentMethod === "DEBIT" ? debitAccountId : null,
          concept: concept.trim(), amount: numericAmount, categoryId, notes: notes?.trim() || null,
          cashContributionAmount: Number(cashContributionAmount),
          ...(existing.reconciledAt && (String(existing.amount) !== String(numericAmount) || existing.debitAccountId !== (paymentMethod === "DEBIT" ? debitAccountId : null) || existing.cardId !== (paymentMethod === "CARD" ? cardId : null)
            || existing.date.toISOString().slice(0, 10) !== date) ? { reconciledAt: null, reconciliationStatus: "PENDING" } : {}),
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
