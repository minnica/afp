import { isRecord } from './financialJson';
import type { Prisma } from '@prisma/client';
import { readFinancialInput, expenseCommandSchema } from './financialContracts';
import { requireOwnedReferences, ApiAccessError } from "@/lib/apiAuth";
import { lockDebtAccounts, refreshDebtAccount } from "@/lib/debtAccountService";
import { applySubscriptionCharge } from "@/lib/subscriptionChargeService";
import { getCashContributionError } from "@/lib/sharedExpenses";

// El llamador conserva la transacción: API manual, recibo offline y captura nativa.
// El estado de conciliación es un argumento interno, nunca un campo confiado del cuerpo.
export async function createExpenseInTransaction<S extends Prisma.DailyExpenseSelect>(tx: Prisma.TransactionClient, userId: string, rawBody: unknown, expenseSelect: S, reconciliationStatus: "CONFIRMED" | "PENDING" = "CONFIRMED") {
  await lockDebtAccounts(tx, userId);
  const body = readFinancialInput(rawBody);
  await requireOwnedReferences(tx, userId, body, ["debitAccountId", "cardId", "categoryId", "personId", "receivableAccountId", "payableAccountId", "subscriptionId"]);

  const {
    date,
    paymentMethod,
    cardId,
    debitAccountId,
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

  if (!["CASH", "CARD", "DEBIT"].includes(paymentMethod)) {
    throw new ApiAccessError("Método de pago no válido.", 400);
  }

  if (paymentMethod === "CARD" && !cardId) {
    throw new ApiAccessError("Debes seleccionar una tarjeta.", 400);
  }

  if (paymentMethod === "DEBIT" && !debitAccountId) throw new ApiAccessError("Selecciona la cuenta de débito.", 400);
  if (paymentMethod === "DEBIT" && (subscriptionId || receivableAccountId || createReceivable)) throw new ApiAccessError("Revisa por separado los vínculos de este gasto con débito.", 400);
  if (paymentMethod === "DEBIT" && payableAccountId) {
    const payable = await tx.payableAccount.findFirst({ where: { id: payableAccountId, userId } });
    if (payable?.accountType !== 'SIMPLE') throw new ApiAccessError("Los préstamos necesitan revisar capital e intereses por separado.", 409);
  }
  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new ApiAccessError("El monto debe ser mayor a 0.", 400);
  }

  const storedAmount = typeof amount === "string" && /^\d+(?:\.\d{1,2})?$/.test(amount) ? amount : numericAmount;

  const contributionError = getCashContributionError(body);
  if (contributionError) throw new ApiAccessError(contributionError, 400);
  const cashContributionAmount = Number(body.cashContributionAmount ?? 0);

  const parsedDate = new Date(`${date}T12:00:00.000Z`);

  if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
    throw new ApiAccessError("Fecha no válida.", 400);
  }

  const command = expenseCommandSchema.parse({ date, concept, amount: storedAmount, categoryId, paymentMethod,
    cardId: paymentMethod === 'CARD' ? cardId : null,
    debitAccountId: paymentMethod === 'DEBIT' ? debitAccountId : null,
  });

  if (reconciliationStatus === "CONFIRMED" && paymentMethod === "CARD" && !subscriptionId && body.confirmDistinctCapture !== true) {
    const captured = await tx.dailyExpense.findFirst({ where: { userId, cardId, amount: storedAmount,
      reconciliationStatus: "PENDING", date: { gte: new Date(parsedDate.getTime() - 3 * 86400000), lte: new Date(parsedDate.getTime() + 3 * 86400000) } } });
    if (captured) throw new ApiAccessError("Ya hay una captura por conciliar con esta tarjeta e importe. Revisa el gasto existente antes de registrar otra compra.", 409);
  }

  let finalReceivableAccountId = receivableAccountId || null;

  if (subscriptionId) {
    const result = await applySubscriptionCharge(tx, userId, {
      subscriptionId, month: date.slice(0, 7), date, amount: storedAmount, action: "confirm",
      today: new Date().toISOString().slice(0, 10), createReceivable,
      expenseData: { reconciliationStatus, concept: concept.trim(), paymentMethod: command.paymentMethod, cardId: cardId || null, categoryId, cashContributionAmount,
        notes: notes?.trim() || null, personId: personId || null,
        receivableAccountId: finalReceivableAccountId, payableAccountId: payableAccountId || null },
    });
    if (!result.expenseId) throw new ApiAccessError("No se pudo confirmar el cobro.", 409);
    const expense = await tx.dailyExpense.findUnique({ where: { id: result.expenseId, userId }, select: expenseSelect });
    const expenseValue: unknown = expense;
    if (result.alreadyConfirmed && cashContributionAmount !== Number((isRecord(expenseValue) ? expenseValue.cashContributionAmount : undefined) ?? 0)) {
      throw new ApiAccessError("Este cobro ya existe con otra aportación. Edita el gasto registrado para actualizarla.", 409);
    }
    if (payableAccountId) await refreshDebtAccount(tx, userId, "payable", payableAccountId);
    return { expense, alreadyConfirmed: result.alreadyConfirmed };
  }

  if (personId && createReceivable) {
    const receivable = await tx.receivableAccount.create({
      data: {
        userId,
        personId,
        concept: concept.trim(),
        originalAmount: storedAmount,
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
      paymentMethod: command.paymentMethod,
      cardId: paymentMethod === "CARD" ? cardId : null,
      debitAccountId: paymentMethod === "DEBIT" ? debitAccountId : null,
      concept: concept.trim(),
      amount: storedAmount,
      cashContributionAmount,
      categoryId,
      notes: notes?.trim() || null,
      personId: personId || null,
      receivableAccountId: finalReceivableAccountId,
      payableAccountId: payableAccountId || null,
      subscriptionId: subscriptionId || null,
      reconciliationStatus,
    },
    select: expenseSelect,
  });

  if (payableAccountId) {
    await refreshDebtAccount(tx, userId, "payable", payableAccountId);
  }

  return { expense };
}
