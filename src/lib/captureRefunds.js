import { Prisma } from "@prisma/client";
import { ApiAccessError } from "@/lib/apiAuth";
import { captureParsers, interpretCapture, normalizeMerchant } from "@/lib/captureParsers";
import { matchesCapturePolicy } from "@/lib/captureFormatPolicy";
import { refundCaptureKind } from "@/lib/captureRefundParsers";
import { resolveCaptureIdentity } from "@/lib/captureIdentity";

const money = value => new Prisma.Decimal(value || 0);
const serial = value => JSON.parse(JSON.stringify(value));
const sourceKeys = {
  "mercadopago.refund.es.v1": ["mercadopago.card-purchase.es.v1"],
  "banamex.purchase-cancellation.es.v1": ["banamex.card-charge.es.v1", "banamex.joy-card-charge.es.v1", "wallet.banamex-purchase.es.v1"],
};

export async function completeRefundIdentity(tx, event, decoded) {
  if (!refundCaptureKind(decoded) || decoded.reason !== "REFUND_REVIEW") return decoded;
  let cardId = decoded.proposal.cardId, accepted = false;
  if (decoded.parserKey === "mercadopago.refund.es.v1") {
    const parser = captureParsers.find(row => row.key === "mercadopago.card-purchase.es.v1");
    const policies = await tx.captureAutomation.findMany({ where: { userId: event.userId, parserKey: parser.key, completionPolicy: parser.completionPolicy } });
    if (policies.length === 1 && matchesCapturePolicy(policies[0], parser)
      && new Date(policies[0].policyAcceptedAt) <= new Date(event.receivedAt)) {
      cardId = policies[0].cardId;
      accepted = Boolean(await tx.captureCardAlias.findFirst({ where: { userId: event.userId, cardId,
        sourcePackage: event.sourcePackage, verifiedAt: { not: null } } }));
    }
  } else if (cardId) {
    const policy = await tx.captureBankFallback.findUnique({ where: { userId_cardId: { userId: event.userId, cardId } } });
    accepted = policy?.bankSourcePackage === event.sourcePackage && policy.currency === "MXN" && policy.purchasesOnly
      && Boolean(policy.acceptedAt) && new Date(policy.acceptedAt) <= new Date(event.receivedAt);
  }
  if (!accepted || !cardId || !await tx.card.findFirst({ where: { userId: event.userId, id: cardId } })) {
    return { ...decoded, reason: "REFUND_POLICY_REQUIRED" };
  }
  return { ...decoded, proposal: { ...decoded.proposal, cardId, currency: "MXN", currencySource: "OWNER_FORMAT_POLICY",
    missingFields: [], ...(decoded.parserKey === "mercadopago.refund.es.v1" ? { cardSource: "OWNER_FORMAT_POLICY" } : {}) } };
}

function refundReady(movement) {
  const p = movement.proposal;
  return refundCaptureKind(movement) && ["REFUND_REVIEW", "REFUND_NO_MATCH", "REFUND_POSSIBLE_DUPLICATE"].includes(movement.reason)
    && !movement.correction && p.cardId && p.currency === "MXN" && p.amount && p.date && p.merchant;
}

function protectedExpense(expense) {
  return expense.paymentMethod !== "CARD" || expense.subscriptionId || expense.personId || expense.receivableAccountId
    || expense.payableAccountId || money(expense.cashContributionAmount).gt(0) || expense.loanPrincipalAmount != null
    || expense.loanInterestAmount != null || expense.loanBalanceAfterPayment != null;
}

export async function refundCandidates(tx, userId, movement) {
  if (!refundReady(movement)) return [];
  const p = movement.proposal, end = new Date(`${p.date}T23:59:59.999Z`);
  const start = new Date(new Date(`${p.date}T00:00:00Z`).getTime() - 30 * 86400000);
  const purchases = await tx.captureMovement.findMany({ where: { userId, cardId: p.cardId,
    parserKey: { in: sourceKeys[movement.parserKey] || [] }, status: { in: ["REGISTERED", "LINKED"] }, expenseId: { not: null },
    operationDate: { gte: start, lte: end } }, include: { expense: true,
    events: { select: { postedAt: true, sourcePackage: true } } } });
  const ownEvents = await tx.captureEvent.findMany({ where: { userId, movementId: movement.id }, select: { postedAt: true } });
  const refundAt = ownEvents[0]?.postedAt || new Date(movement.createdAt);
  const byExpense = new Map();
  for (const purchase of purchases) {
    const expense = purchase.expense, original = purchase.proposal;
    if (!expense || expense.userId !== userId || expense.cardId !== p.cardId || protectedExpense(expense)
      || normalizeMerchant(original.merchant) !== normalizeMerchant(p.merchant)
      || !original.amount || !money(expense.refundOriginalAmount ?? expense.amount).eq(original.amount)
      || purchase.events.every(event => event.postedAt > refundAt)
      || money(expense.amount).lt(p.amount)) continue;
    byExpense.set(expense.id, { id: expense.id, concept: expense.concept, cardId: expense.cardId,
      amount: String(expense.amount), originalAmount: String(expense.refundOriginalAmount ?? expense.amount),
      date: expense.date, updatedAt: expense.updatedAt });
  }
  return [...byExpense.values()];
}

export async function refundDetail(tx, userId, movement) {
  const candidates = await refundCandidates(tx, userId, movement);
  const refund = await tx.expenseRefund.findUnique({ where: { movementId: movement.id } });
  const nearby = movement.proposal.cardId && movement.proposal.amount
    ? await tx.expenseRefund.findMany({ where: { userId, amount: movement.proposal.amount,
      movementId: { not: movement.id } }, include: { movement: { select: { proposal: true } } } }) : [];
  const possibleDuplicates = nearby.filter(row => row.movement.proposal.cardId === movement.proposal.cardId
    && normalizeMerchant(row.movement.proposal.merchant) === normalizeMerchant(movement.proposal.merchant))
    .map(row => ({ id: row.id, amount: String(row.amount), date: row.date, reversedAt: row.reversedAt }));
  return { candidates, refund, possibleDuplicates };
}

async function consistentExpense(tx, userId, expense) {
  const refunds = await tx.expenseRefund.findMany({ where: { userId, expenseId: expense.id, reversedAt: null } });
  const total = refunds.reduce((sum, row) => sum.add(row.amount), money(0));
  if (!money(expense.refundOriginalAmount ?? expense.amount).sub(total).eq(expense.amount)) {
    throw new ApiAccessError("El importe del gasto cambió fuera de la revisión de devoluciones. Revisa su historial.", 409);
  }
  return total;
}

export async function resolveCaptureRefund(tx, movement, input) {
  if (!refundCaptureKind(movement)) throw new ApiAccessError("Este aviso no es una devolución reconocida.", 409);
  const { userId } = movement;
  const existing = await tx.expenseRefund.findUnique({ where: { movementId: movement.id } });
  if (input.action === "applyRefund") {
    // Respuesta perdida, doble clic y reintento tras deshacer mantienen la resolución.
    if (existing) return movement;
    if (movement.status !== "REVIEW" || !refundReady(movement)) throw new ApiAccessError("Revisa el formato, tarjeta y moneda de la devolución.", 409);
    const events = await tx.captureEvent.findMany({ where: { userId, movementId: movement.id } });
    if (events.length !== 1) throw new ApiAccessError("Revisa las evidencias antes de confirmar esta devolución.", 409);
    const decoded = interpretCapture(events[0]), parser = captureParsers.find(row => row.key === decoded.parserKey);
    const current = await completeRefundIdentity(tx, events[0], await resolveCaptureIdentity(tx, events[0], decoded, parser));
    if (current.reason !== "REFUND_REVIEW" || ["cardId", "amount", "merchant", "date", "currency"].some(key => current.proposal[key] !== movement.proposal[key])) {
      throw new ApiAccessError("La regla o identificación cambió. Vuelve a analizar el aviso antes de confirmarlo.", 409);
    }
    const { candidates, possibleDuplicates } = await refundDetail(tx, userId, movement);
    if (possibleDuplicates.length && input.distinctRefund !== true) throw new ApiAccessError("Ya revisaste una devolución de este importe y comercio. Confirma que es otra devolución antes de continuar.", 409);
    const candidate = candidates.find(row => row.id === input.expenseId);
    if (!candidate) throw new ApiAccessError("El gasto ya no es compatible con esta devolución. Actualiza la revisión.", 409);
    if (input.expectedExpenseUpdatedAt !== candidate.updatedAt.toISOString()) throw new ApiAccessError("El gasto cambió en otra pantalla. Actualiza antes de confirmar.", 409);
    const expense = await tx.dailyExpense.findFirst({ where: { userId, id: candidate.id } });
    await consistentExpense(tx, userId, expense);
    const amount = money(movement.proposal.amount), gross = money(expense.refundOriginalAmount ?? expense.amount);
    const net = money(expense.amount).sub(amount);
    if (net.lt(0)) throw new ApiAccessError("La devolución supera el gasto pendiente de reembolso.", 409);
    await tx.expenseRefund.create({ data: { userId, expenseId: expense.id, originalExpenseId: expense.id, movementId: movement.id,
      amount, date: new Date(`${movement.proposal.date}T12:00:00Z`), expenseSnapshot: serial(expense) } });
    await tx.dailyExpense.update({ where: { id: expense.id, userId }, data: { amount: net, refundOriginalAmount: gross,
      reconciliationStatus: "PENDING", reconciledAt: null } });
    return tx.captureMovement.update({ where: { id: movement.id }, data: { status: "LINKED", reason: "REFUND_APPLIED",
      expenseId: expense.id, originalExpenseId: expense.id, resolvedAt: new Date() } });
  }
  if (!existing || existing.userId !== userId) throw new ApiAccessError("No hay una devolución aplicada para deshacer.", 409);
  if (existing.reversedAt) return movement;
  const expense = existing.expenseId && await tx.dailyExpense.findFirst({ where: { id: existing.expenseId, userId } });
  if (!expense) throw new ApiAccessError("El gasto fue eliminado. Se conserva la devolución; no se recreará el gasto.", 409);
  const total = await consistentExpense(tx, userId, expense);
  if (protectedExpense(expense) || expense.cardId !== movement.proposal.cardId) throw new ApiAccessError("El gasto tiene vínculos o tarjeta distintos; revísalo antes de deshacer la devolución.", 409);
  await tx.expenseRefund.update({ where: { id: existing.id }, data: { reversedAt: new Date() } });
  await tx.dailyExpense.update({ where: { id: expense.id, userId }, data: { amount: money(expense.amount).add(existing.amount),
    ...(total.eq(existing.amount) ? { refundOriginalAmount: null } : {}), reconciliationStatus: "PENDING", reconciledAt: null } });
  return tx.captureMovement.update({ where: { id: movement.id }, data: { status: "DISCARDED", reason: "REFUND_REVERSED", resolvedAt: new Date() } });
}

// Los campos descriptivos se pueden editar. El neto y las relaciones financieras
// se modifican únicamente desde el historial para no aplicar dos veces un abono.
export function assertRefundExpenseEdit(existing, body) {
  if (existing.refundOriginalAmount == null) return;
  if (!money(body.amount).eq(existing.amount) || body.paymentMethod !== existing.paymentMethod || body.cardId !== existing.cardId
    || Boolean(body.subscriptionId) || money(body.cashContributionAmount ?? 0).gt(0)
    || body.personId || body.receivableAccountId || body.payableAccountId) {
    throw new ApiAccessError("Este gasto tiene devoluciones. Conserva el monto neto y la tarjeta; deshaz la devolución desde Capturas para cambiarlos.", 409);
  }
}
