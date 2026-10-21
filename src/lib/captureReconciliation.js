import { z } from "zod";
import { Prisma } from "@prisma/client";
import { ApiAccessError, requireOwnedReferences } from "@/lib/apiAuth";
import { lockDebtAccounts } from "@/lib/debtAccountService";
import { createExpenseInTransaction } from "@/lib/expenseService";
import { captureDate, correctionSchema } from "@/lib/captureReview";
import { shouldIncludePurchaseInCycle, getMonthlyPaymentUsed } from "@/lib/calculations/cardCycles";
import { capturePilotSummary } from "@/lib/capturePilot";

const periodSchema = z.object({ cardId: z.string().min(1), startDate: captureDate, endDate: captureDate }).refine(p => p.startDate <= p.endDate
  && new Date(p.endDate) - new Date(p.startDate) <= 62 * 86400000);
function periodInput(input) {
  const parsed = periodSchema.safeParse(input);
  if (!parsed.success) throw new ApiAccessError("Selecciona tarjeta y un período válido de hasta 63 días.", 400);
  return parsed.data;
}
const identity = (userId, period) => ({ userId, ...period });
function fingerprint(row, type, amount) {
  return JSON.stringify([type, row.id, row.cardId, String(type === "EXPENSE" ? row.amount : row.totalAmount),
    new Date(row.date || row.purchaseDate).toISOString().slice(0, 10), type === "INSTALLMENT" ? row.months : null, String(amount)]);
}

async function periodRows(tx, userId, period) {
  const card = await tx.card.findFirst({ where: { id: period.cardId, userId } });
  if (!card) throw new ApiAccessError("Tarjeta no encontrada.", 404);
  const expenses = await tx.dailyExpense.findMany({ where: { userId, cardId: card.id, paymentMethod: "CARD",
    date: { gte: new Date(`${period.startDate}T00:00:00Z`), lte: new Date(`${period.endDate}T23:59:59.999Z`) } }, orderBy: [{ date: "asc" }, { id: "asc" }] });
  const purchases = await tx.installmentPurchase.findMany({ where: { userId, cardId: card.id } });
  const end = new Date(`${period.endDate}T12:00:00Z`);
  const cycle = { card, cardId: card.id, year: end.getUTCFullYear(), month: end.getUTCMonth() + 1, cutDate: end };
  return [
    ...expenses.map(row => ({ ...row, type: "EXPENSE", chargeAmount: String(row.amount), fingerprint: fingerprint(row, "EXPENSE", row.amount) })),
    ...purchases.filter(row => shouldIncludePurchaseInCycle(row, cycle)).map(row => {
      const amount = getMonthlyPaymentUsed(row, cycle);
      return { ...row, type: "INSTALLMENT", chargeAmount: String(amount), date: end, fingerprint: fingerprint(row, "INSTALLMENT", amount) };
    }),
  ];
}

export async function captureStatement(db, userId, input) {
  const period = periodInput(input);
  return db.$transaction(async tx => {
    await lockDebtAccounts(tx, userId);
    const rows = await periodRows(tx, userId, period);
    const statement = await tx.captureStatement.findUnique({ where: { userId_cardId_startDate_endDate: identity(userId, period) } });
    let total = new Prisma.Decimal(0), confirmed = new Prisma.Decimal(0);
    const records = rows.map(row => {
      const match = statement?.matches?.[`${row.type}:${row.id}`];
      const matched = match?.fingerprint === row.fingerprint && Boolean(row.reconciledAt);
      total = total.plus(row.chargeAmount);
      if (matched) confirmed = confirmed.plus(row.chargeAmount);
      return { ...row, matched, changed: Boolean(match && !matched) };
    });
    const pilot = await capturePilotSummary(tx, userId, period, records, statement);
    return { period, statement, records, pilot, total: total.toFixed(2), confirmed: confirmed.toFixed(2),
      difference: statement?.chargesTotal != null ? new Prisma.Decimal(statement.chargesTotal).minus(total).toFixed(2) : null };
  });
}

export async function reconcileCaptureStatement(db, userId, input) {
  const period = periodInput(input);
  if (!["save", "confirm", "unconfirm", "missing"].includes(input.action)) throw new ApiAccessError("Acción no válida.", 400);
  return db.$transaction(async tx => {
    await lockDebtAccounts(tx, userId);
    await requireOwnedReferences(tx, userId, period, ["cardId"]);
    const key = identity(userId, period);
    const prior = await tx.captureStatement.findUnique({ where: { userId_cardId_startDate_endDate: key } });
    if (input.action === "save" && input.expectedMetadata === undefined && input.expectedUpdatedAt !== (prior?.updatedAt.toISOString() ?? null)) throw new ApiAccessError("El cotejo cambió en otra pantalla. Actualiza antes de guardar.", 409);
    if (input.action === "save" && input.expectedMetadata !== undefined && input.expectedMetadata !== JSON.stringify([prior?.chargesTotal == null ? null : String(prior.chargesTotal), prior?.notes || ""])) throw new ApiAccessError("La explicación o el total cambiaron en otra pantalla. Vuelve a consultar el período.", 409);
    let statement = await tx.captureStatement.upsert({ where: { userId_cardId_startDate_endDate: key }, create: key, update: {} });
    if (input.action === "save") {
      if (!(input.chargesTotal === null || z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/).safeParse(input.chargesTotal).success)
        || typeof input.notes !== "string" || input.notes.length > 4000) throw new ApiAccessError("Revisa el total de cargos y la explicación de diferencias.", 400);
      return tx.captureStatement.update({ where: { id: statement.id }, data: { chargesTotal: input.chargesTotal, notes: input.notes } });
    }
    if (input.action === "missing") {
      const parsed = correctionSchema.safeParse(input.expense);
      if (!parsed.success || !z.uuid().safeParse(input.operationId).success) throw new ApiAccessError("Revisa los datos del cargo faltante.", 400);
      const data = parsed.data;
      if (data.cardId !== period.cardId || data.date < period.startDate || data.date > period.endDate) throw new ApiAccessError("El cargo debe pertenecer a la tarjeta y período seleccionados.", 400);
      const request = JSON.stringify(data);
      const previous = statement.operations[input.operationId];
      if (previous) {
        if (previous.request !== request) throw new ApiAccessError("Este intento ya registró datos diferentes.", 409);
        return { expenseId: previous.expenseId, repeated: true };
      }
      // La multiplicidad es explícita, incluso ante otra captura con igual importe.
      if (input.confirmDistinct !== true) throw new ApiAccessError("Confirma que revisaste los movimientos existentes.", 409);
      const { expense } = await createExpenseInTransaction(tx, userId, { ...data, concept: data.merchant,
        paymentMethod: "CARD", confirmDistinctCapture: true }, { id: true }, "PENDING");
      statement = await tx.captureStatement.update({ where: { id: statement.id }, data: {
        operations: { ...statement.operations, [input.operationId]: { request, expenseId: expense.id } },
      } });
      return { expenseId: expense.id, statementId: statement.id };
    }
    if (!["EXPENSE", "INSTALLMENT"].includes(input.type) || typeof input.recordId !== "string") throw new ApiAccessError("Movimiento no válido.", 400);
    const rows = await periodRows(tx, userId, period);
    const row = rows.find(row => row.id === input.recordId && row.type === input.type);
    if (!row) throw new ApiAccessError("Movimiento no encontrado en este período.", 404);
    if (row.fingerprint !== input.fingerprint) throw new ApiAccessError("El movimiento cambió. Actualiza y coteja sus datos actuales.", 409);
    const matches = { ...statement.matches };
    const matchKey = `${row.type}:${row.id}`;
    if (input.action === "confirm") matches[matchKey] = { fingerprint: row.fingerprint, confirmedAt: new Date().toISOString() };
    else delete matches[matchKey];
    await tx[row.type === "EXPENSE" ? "dailyExpense" : "installmentPurchase"].update({ where: { id: row.id, userId }, data: {
      reconciledAt: input.action === "confirm" ? new Date() : null,
      reconciliationStatus: input.action === "confirm" ? "CONFIRMED" : "PENDING",
    } });
    return tx.captureStatement.update({ where: { id: statement.id }, data: { matches } });
  }, { isolationLevel: "ReadCommitted" });
}
