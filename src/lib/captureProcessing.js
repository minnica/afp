import { ApiAccessError, requireOwnedReferences } from "@/lib/apiAuth";
import { lockDebtAccounts } from "@/lib/debtAccountService";
import { createExpenseInTransaction } from "@/lib/expenseService";
import { interpretCapture, normalizeMerchant } from "@/lib/captureParsers";
import { captureHash } from "@/lib/captureProtocol";
import { subscriptionChargeDate, getSubscriptionReceipts } from "@/lib/subscriptionCharges";
import { Prisma } from "@prisma/client";
import { effectiveCapture, correctCapture } from "@/lib/captureReview";

export async function archiveCapturedExpense(tx, expense) {
  await tx.expenseTombstone.upsert({ where: { expenseId: expense.id }, update: {}, create: {
    expenseId: expense.id, userId: expense.userId, cardId: expense.cardId, date: expense.date,
    amount: expense.amount, concept: expense.concept,
  } });
}

function dateWindow(date) {
  const value = new Date(`${date}T12:00:00.000Z`).getTime();
  return { gte: new Date(value - 3 * 86400000), lte: new Date(value + 3 * 86400000) };
}

export async function captureCandidates(tx, userId, proposal) {
  if (!proposal.cardId || !proposal.amount || !proposal.date) return [];
  const where = { userId, cardId: proposal.cardId, amount: proposal.amount, date: dateWindow(proposal.date) };
  // Una transacción usa una conexión: no iniciar consultas simultáneas sobre ella.
  const expenses = await tx.dailyExpense.findMany({ where, select: { id: true, concept: true, date: true, amount: true } });
  const installments = await tx.installmentPurchase.findMany({ where: { userId, cardId: proposal.cardId, totalAmount: proposal.amount, purchaseDate: where.date }, select: { id: true, concept: true } });
  const deleted = await tx.expenseTombstone.findMany({ where, select: { expenseId: true, concept: true, date: true, amount: true } });
  const movements = await tx.captureMovement.findMany({ where: { userId, cardId: proposal.cardId, amount: proposal.amount, operationDate: where.date },
    select: { id: true, expenseId: true, originalExpenseId: true, status: true } });
  return [
    ...expenses.map(row => ({ type: "EXPENSE", id: row.id, concept: row.concept })),
    ...installments.map(row => ({ type: "INSTALLMENT", id: row.id, concept: row.concept })),
    ...deleted.map(row => ({ type: "DELETED", id: row.expenseId, concept: row.concept })),
    ...movements.map(row => ({ type: "MOVEMENT", id: row.id, expenseId: row.expenseId, deleted: !!row.originalExpenseId && !row.expenseId })),
  ];
}

// Se ejecuta dentro de la transacción de recepción, bajo el bloqueo financiero
// compartido con las altas, ediciones y borrados manuales del mismo usuario.
export async function processCaptureEvent(tx, event) {
  await lockDebtAccounts(tx, event.userId);
  const interpretation = interpretCapture(event);
  const { parserKey = null } = interpretation;
  let { reason } = interpretation;
  let proposal = interpretation.proposal;
  let status = reason === "NON_CREDIT_ACCOUNT" ? "DISCARDED" : "REVIEW", referenceKey = null;
  if (reason === "PURCHASE") {
    const aliases = await tx.captureCardAlias.findMany({ where: {
      userId: event.userId, sourcePackage: event.sourcePackage, kind: proposal.alias.kind, value: proposal.alias.value,
    } });
    const cards = [...new Set(aliases.map(alias => alias.cardId))];
    if (cards.length !== 1) reason = cards.length ? "AMBIGUOUS_CARD" : "UNKNOWN_CARD";
    else if (!aliases.some(alias => alias.verifiedAt)) reason = "UNVERIFIED_ALIAS";
    else {
      proposal = { ...proposal, cardId: cards[0] };
      const card = await tx.card.findFirst({ where: { id: cards[0], userId: event.userId } });
      if (!card) reason = "UNKNOWN_CARD";
      else {
        const automation = await tx.captureAutomation.findUnique({ where: {
          userId_cardId_parserKey: { userId: event.userId, cardId: card.id, parserKey },
        } });
        if (!interpretation.verified || automation?.mode !== "AUTOMATIC") {
          status = "OBSERVED";
          reason = interpretation.verified ? "OBSERVATION" : "UNVERIFIED_FORMAT";
        }
      }
    }
  }
  if (reason === "PURCHASE") {
    referenceKey = proposal.reference ? captureHash(`${proposal.cardId}:${proposal.reference}`) : null;
    const referenced = referenceKey && await tx.captureMovement.findUnique({ where: { userId_referenceKey: { userId: event.userId, referenceKey } } });
    if (referenced) {
      const original = referenced.proposal;
      if (original.amount === proposal.amount && original.date === proposal.date && original.currency === proposal.currency
        && normalizeMerchant(original.merchant) === normalizeMerchant(proposal.merchant)) {
        await tx.captureEvent.update({ where: { id: event.id }, data: { movementId: referenced.id,
          interpretation: { ...interpretation, proposal, reason: "EXACT_REFERENCE" } } });
        return referenced;
      }
      reason = "REFERENCE_CONFLICT"; referenceKey = null;
    }
    const revision = await tx.captureEvent.findFirst({ where: { userId: event.userId, deviceId: event.deviceId,
      sourcePackage: event.sourcePackage, notificationKeyHash: event.notificationKeyHash, id: { not: event.id },
    } });
    if (reason === "PURCHASE" && revision) reason = "NOTIFICATION_REVISION";
    const candidates = await captureCandidates(tx, event.userId, proposal);
    if (candidates.length) {
      proposal = { ...proposal, candidates };
      if (reason === "PURCHASE") reason = "POSSIBLE_DUPLICATE";
    }
  }
  const movement = await tx.captureMovement.create({ data: {
    userId: event.userId, parserKey, status, reason, proposal, referenceKey,
    cardId: proposal.cardId || null, amount: proposal.amount || null,
    operationDate: proposal.date ? new Date(`${proposal.date}T12:00:00.000Z`) : null,
    resolvedAt: status === "DISCARDED" ? new Date() : null,
  } });
  if (reason === "PURCHASE") await registerCaptureMovement(tx, movement, false);
  await tx.captureEvent.update({ where: { id: event.id }, data: {
    movementId: movement.id, interpretation: { ...interpretation, proposal, reason },
  } });
  return movement;
}

async function captureExpenseData(tx, movement) {
  const { userId } = movement;
  const proposal = effectiveCapture(movement);
  const rule = await tx.captureMerchantRule.findUnique({ where: {
    userId_cardId_merchant: { userId, cardId: proposal.cardId, merchant: normalizeMerchant(proposal.merchant) },
  } });
  let categoryId = movement.correction?.categoryId || rule?.categoryId;
  if (!categoryId) categoryId = (await tx.category.upsert({ where: { userId_name: { userId, name: "Por clasificar" } },
    create: { userId, name: "Por clasificar" }, update: {} })).id;
  const data = { date: proposal.date, amount: proposal.amount, concept: proposal.merchant,
    paymentMethod: "CARD", cardId: proposal.cardId, categoryId, subscriptionId: rule?.subscriptionId || null };
  for (const [field, model] of [["cardId", "card"], ["categoryId", "category"], ["subscriptionId", "subscription"]]) {
    if (data[field] && !await tx[model].findFirst({ where: { id: data[field], userId } })) return { reason: "RULE_UNAVAILABLE" };
  }
  if (data.subscriptionId) {
    const [subscription] = await tx.$queryRaw`SELECT id FROM subscriptions WHERE id = ${data.subscriptionId} AND "userId" = ${userId} FOR UPDATE`;
    if (!subscription) return { reason: "SUBSCRIPTION_UNAVAILABLE" };
    const full = await tx.subscription.findUnique({ where: { id: data.subscriptionId }, include: { charges: true,
      dailyExpenses: { select: { id: true, date: true, subscriptionCharge: { select: { month: true } } } } } });
    const month = data.date.slice(0, 7);
    const cycles = await tx.cardCycle.findMany({ where: { userId, cardId: data.cardId }, select: { usageReconciliation: true, cardId: true, year: true, month: true } });
    const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Mexico_City" }).format(new Date());
    const scheduledDate = subscriptionChargeDate(full, month);
    if (full.cardId !== data.cardId || full.paymentMethod !== "CARD" || !subscriptionChargeDate(full, month)
      || scheduledDate > today
      || full.charges.some(charge => charge.month === month)
      || full.dailyExpenses.some(expense => (expense.subscriptionCharge?.month || expense.date.toISOString().slice(0, 7)) === month)
      || getSubscriptionReceipts(full, month, cycles).length) return { reason: "SUBSCRIPTION_CONFLICT" };
  }
  return { data };
}

export async function registerCaptureMovement(tx, movement, distinct) {
  const p = effectiveCapture(movement);
  if (!p.cardId || !p.amount || !p.date || p.currency !== "MXN") throw new ApiAccessError("El aviso necesita tarjeta, importe, moneda y fecha verificados.", 409);
  if (!distinct && (await captureCandidates(tx, movement.userId, p)).some(candidate => candidate.type !== "MOVEMENT" || candidate.id !== movement.id)) {
    return tx.captureMovement.update({ where: { id: movement.id }, data: { reason: "POSSIBLE_DUPLICATE" } });
  }
  const { data, reason } = await captureExpenseData(tx, movement);
  if (reason) return tx.captureMovement.update({ where: { id: movement.id }, data: { status: "REVIEW", reason } });
  const { expense } = await createExpenseInTransaction(tx, movement.userId, data, { id: true }, "PENDING");
  return tx.captureMovement.update({ where: { id: movement.id }, data: { status: "REGISTERED", reason: distinct ? "USER_DISTINCT" : "AUTOMATIC",
    expenseId: expense.id, originalExpenseId: expense.id, resolvedAt: new Date() } });
}

export async function resolveCaptureMovement(db, userId, input) {
  if (!input || typeof input.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.id)
    || !["link", "linkInstallment", "distinct", "discard", "convertToInstallments", "correct", "register"].includes(input.action)) {
    throw new ApiAccessError("Resolución no válida.", 400);
  }
  return db.$transaction(async tx => {
    await lockDebtAccounts(tx, userId);
    const movement = await tx.captureMovement.findFirst({ where: { id: input.id, userId } });
    if (!movement) throw new ApiAccessError("Aviso no encontrado.", 404);
    if (input.action === "correct") return correctCapture(tx, movement, input);
    if (input.action === "convertToInstallments") return convertCaptureToInstallments(tx, movement, input);
    // Una decisión terminal se conserva al reintentar o ante otra pestaña.
    if (["REGISTERED", "LINKED", "DISCARDED", "CONVERTED"].includes(movement.status)) return movement;
    if (input.action === "discard") return tx.captureMovement.update({ where: { id: movement.id }, data: { status: "DISCARDED", reason: "USER_DISCARDED", resolvedAt: new Date() } });
    if (input.action === "linkInstallment") {
      if (typeof input.installmentPurchaseId !== "string") throw new ApiAccessError("Selecciona la compra a meses existente.", 400);
      const purchase = await tx.installmentPurchase.findFirst({ where: { id: input.installmentPurchaseId, userId } });
      if (!purchase) throw new ApiAccessError("Compra a meses no encontrada.", 404);
      const proposal = effectiveCapture(movement);
      if (purchase.cardId !== proposal.cardId || !proposal.amount || !new Prisma.Decimal(purchase.totalAmount).equals(proposal.amount)) throw new ApiAccessError("Revisa tarjeta e importe total antes de vincular la evidencia.", 409);
      return tx.captureMovement.update({ where: { id: movement.id }, data: { status: "CONVERTED", reason: "USER_LINKED_INSTALLMENT", installmentPurchaseId: purchase.id, resolvedAt: new Date() } });
    }
    if (input.action === "link") {
      if (typeof input.expenseId !== "string") throw new ApiAccessError("Selecciona el gasto existente.", 400);
      const expense = await tx.dailyExpense.findFirst({ where: { id: input.expenseId, userId } });
      if (!expense) throw new ApiAccessError("Gasto no encontrado.", 404);
      const proposal = effectiveCapture(movement);
      if (expense.cardId !== proposal.cardId || !proposal.amount || !new Prisma.Decimal(expense.amount).equals(proposal.amount)) {
        throw new ApiAccessError("Revisa tarjeta e importe antes de vincular el aviso.", 409);
      }
      return tx.captureMovement.update({ where: { id: movement.id }, data: { status: "LINKED", reason: "USER_LINKED",
        expenseId: expense.id, originalExpenseId: expense.id, resolvedAt: new Date() } });
    }
    if (input.action === "register") {
      if (!movement.correction) throw new ApiAccessError("Revisa y guarda los datos antes de registrar la compra.", 409);
      return registerCaptureMovement(tx, movement, false);
    }
    if (!movement.correction && !["POSSIBLE_DUPLICATE", "NOTIFICATION_REVISION"].includes(movement.reason)) throw new ApiAccessError("Este aviso necesita revisión de sus datos antes de registrarse.", 409);
    return registerCaptureMovement(tx, movement, true);
  }, { isolationLevel: "ReadCommitted" });
}

async function convertCaptureToInstallments(tx, movement, input) {
  if (movement.status === "CONVERTED") return movement;
  if (!movement.expenseId || !Number.isInteger(input.months) || input.months < 2 || input.months > 120) throw new ApiAccessError("Selecciona un gasto y un plazo de 2 a 120 meses.", 400);
  const expense = await tx.dailyExpense.findFirst({ where: { id: movement.expenseId, userId: movement.userId } });
  if (!expense || expense.paymentMethod !== "CARD" || !expense.cardId || expense.subscriptionId || expense.receivableAccountId
    || expense.payableAccountId || Number(expense.cashContributionAmount) !== 0 || expense.personId) {
    throw new ApiAccessError("Este gasto tiene vínculos o aportaciones que requieren revisión antes de convertirlo.", 409);
  }
  await requireOwnedReferences(tx, movement.userId, expense, ["cardId", "categoryId"]);
  const purchase = await tx.installmentPurchase.create({ data: { userId: movement.userId, cardId: expense.cardId,
    purchaseDate: expense.date, concept: expense.concept, totalAmount: expense.amount, months: input.months, categoryId: expense.categoryId,
    notes: expense.notes, reconciliationStatus: expense.reconciledAt ? "PENDING" : expense.reconciliationStatus } });
  await archiveCapturedExpense(tx, expense);
  // Todas las evidencias del mismo gasto pasan a la compra antes de borrar.
  await tx.captureMovement.updateMany({ where: { userId: movement.userId, expenseId: expense.id }, data: {
    status: "CONVERTED", reason: "USER_INSTALLMENTS", expenseId: null, installmentPurchaseId: purchase.id, resolvedAt: new Date(),
  } });
  await tx.dailyExpense.delete({ where: { id: expense.id, userId: movement.userId } });
  return tx.captureMovement.findUnique({ where: { id: movement.id } });
}
