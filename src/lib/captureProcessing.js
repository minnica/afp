import { ApiAccessError, requireOwnedReferences } from "@/lib/apiAuth";
import { lockDebtAccounts } from "@/lib/debtAccountService";
import { createExpenseInTransaction } from "@/lib/expenseService";
import { interpretCapture, normalizeMerchant, captureParsers } from "@/lib/captureParsers";
import { resolveCaptureIdentity } from "@/lib/captureIdentity";
import { captureHash } from "@/lib/captureProtocol";
import { subscriptionChargeDate, getSubscriptionReceipts } from "@/lib/subscriptionCharges";
import { Prisma } from "@prisma/client";
import { effectiveCapture, correctCapture } from "@/lib/captureReview";
import { matchesCapturePolicy } from "@/lib/captureFormatPolicy";
import { paymentCaptureKind } from "@/lib/capturePaymentParsers";
import { resolveCapturePayment } from "@/lib/capturePayments";
import { bankFallbackInterpretation } from "@/lib/captureBankFallback";
import { automateCapturePayment } from "@/lib/capturePaymentAutomation";
import { moneyCaptureKind, accountDebitNotice } from "@/lib/captureMoneyParsers";
import { completeMoneyCapture, automateMoneyCapture, resolveMoneyCapture } from "@/lib/captureMoney";
import { correctDebitCapture } from "@/lib/captureDebitCorrections";
import { refundCaptureKind } from "@/lib/captureRefundParsers";
import { completeRefundIdentity, resolveCaptureRefund } from "@/lib/captureRefunds";

export async function archiveCapturedExpense(tx, expense) {
  await tx.expenseTombstone.upsert({ where: { expenseId: expense.id }, update: {}, create: {
    expenseId: expense.id, userId: expense.userId, cardId: expense.cardId, date: expense.date,
    amount: expense.refundOriginalAmount ?? expense.amount, concept: expense.concept,
  } });
}

function dateWindow(date) {
  const value = new Date(`${date}T12:00:00.000Z`).getTime();
  return { gte: new Date(value - 3 * 86400000), lte: new Date(value + 3 * 86400000) };
}

export async function captureCandidates(tx, userId, proposal) {
  if (["MONEY_TRANSFER", "CASH_WITHDRAWAL", "CARD_PAYMENT", "ACCOUNT_DEBIT", "REFUND"].includes(proposal.movementType)) return [];
  if (!proposal.cardId || !proposal.amount || !proposal.date) return [];
  const where = { userId, cardId: proposal.cardId, amount: proposal.amount, date: dateWindow(proposal.date) };
  // Una transacción usa una conexión: no iniciar consultas simultáneas sobre ella.
  const expenses = await tx.dailyExpense.findMany({ where, select: { id: true, concept: true, date: true, amount: true } });
  const installments = await tx.installmentPurchase.findMany({ where: { userId, cardId: proposal.cardId, totalAmount: proposal.amount, purchaseDate: where.date }, select: { id: true, concept: true } });
  const deleted = await tx.expenseTombstone.findMany({ where, select: { expenseId: true, concept: true, date: true, amount: true } });
  const movements = await tx.captureMovement.findMany({ where: { userId, cardId: proposal.cardId, amount: proposal.amount, operationDate: where.date },
    select: { id: true, expenseId: true, originalExpenseId: true, installmentPurchaseId: true, status: true, reason: true, parserKey: true, correction: true, proposal: true } });
  // La evidencia parcial y Wallet de respaldo en observación no bloquean al
  // banco. Una corrección personal o una resolución financiera sí bloquean.
  const financialMovements = movements.filter(row => !paymentCaptureKind(row) && !refundCaptureKind(row)
    && !(["BANK_FALLBACK_WAIT", "BANK_FALLBACK_PAUSED"].includes(row.reason) && row.proposal?.bankFallback?.walletParserKey === proposal.primaryWalletParserKey
      && !row.correction && !row.expenseId && !row.originalExpenseId && !row.installmentPurchaseId)
    && !(["REVIEW", "OBSERVED"].includes(row.status)
    && !row.expenseId && !row.originalExpenseId && !row.installmentPurchaseId && !row.correction
    && captureParsers.some(parser => parser.key === row.parserKey
      && ((!row.proposal?.bankFallback && parser.evidenceOnly) || (parser.nonBlockingInObservation && row.status === "OBSERVED")))));
  return [
    ...expenses.map(row => ({ type: "EXPENSE", id: row.id, concept: row.concept })),
    ...installments.map(row => ({ type: "INSTALLMENT", id: row.id, concept: row.concept })),
    ...deleted.map(row => ({ type: "DELETED", id: row.expenseId, concept: row.concept })),
    ...financialMovements.map(row => ({ type: "MOVEMENT", id: row.id, expenseId: row.expenseId, deleted: !!row.originalExpenseId && !row.expenseId })),
  ];
}

// Se ejecuta dentro de la transacción de recepción, bajo el bloqueo financiero
// compartido con las altas, ediciones y borrados manuales del mismo usuario.
async function captureInterpretationState(tx, event, observationOnly = false) {
  const decoded = interpretCapture(event);
  const money = await completeMoneyCapture(tx, event, decoded, observationOnly);
  if (money) return { interpretation: money, parserKey: money.parserKey, reason: money.reason, proposal: money.proposal, status: "REVIEW" };
  const parser = captureParsers.find(parser => parser.key === decoded.parserKey);
  let interpretation = await resolveCaptureIdentity(tx, event, decoded, parser);
  if (refundCaptureKind(interpretation)) {
    interpretation = await completeRefundIdentity(tx, event, interpretation);
    return { interpretation, parserKey: interpretation.parserKey, reason: interpretation.reason,
      proposal: interpretation.proposal, status: "REVIEW" };
  }
  const fallback = await bankFallbackInterpretation(tx, event, interpretation, observationOnly);
  if (fallback?.primaryWalletParserKey) interpretation = { ...interpretation, proposal: { ...interpretation.proposal, ...fallback } };
  if (fallback?.reason) return { interpretation, parserKey: interpretation.parserKey, ...fallback };
  const { parserKey = null } = interpretation;
  let { reason } = interpretation;
  const proposal = interpretation.proposal;
  let status = reason === "NON_CREDIT_ACCOUNT" ? "DISCARDED" : "REVIEW";
  if (reason === "PURCHASE") {
    const automation = await tx.captureAutomation.findUnique({ where: {
      userId_cardId_parserKey: { userId: event.userId, cardId: proposal.cardId, parserKey },
    } });
    if (observationOnly || !interpretation.verified || automation?.mode !== "AUTOMATIC") {
      status = "OBSERVED";
      reason = interpretation.verified ? "OBSERVATION" : "UNVERIFIED_FORMAT";
    } else if (parser?.dateSource === "NOTIFICATION_POSTED_AT" && automation.datePolicy !== "NOTIFICATION_POSTED_AT") {
      reason = "DATE_POLICY_REQUIRED";
    }
  }
  return { interpretation, parserKey, reason, proposal, status };
}

export async function processCaptureEvent(tx, event) {
  await lockDebtAccounts(tx, event.userId);
  const state = await captureInterpretationState(tx, event);
  const { interpretation, parserKey, status } = state;
  let { reason, proposal } = state;
  let referenceKey = null;
  if (["PURCHASE", "BANK_FALLBACK_WAIT"].includes(reason)) {
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
    if (["PURCHASE", "BANK_FALLBACK_WAIT"].includes(reason) && revision) reason = "NOTIFICATION_REVISION";
    const candidates = await captureCandidates(tx, event.userId, proposal);
    if (candidates.length) {
      proposal = { ...proposal, candidates };
      if (["PURCHASE", "BANK_FALLBACK_WAIT"].includes(reason)) reason = "POSSIBLE_DUPLICATE";
    }
  }
  let movement = await tx.captureMovement.create({ data: {
    userId: event.userId, parserKey, status, reason, proposal, referenceKey,
    fallbackDueAt: reason === "BANK_FALLBACK_WAIT" ? state.fallbackDueAt : null,
    cardId: proposal.cardId || null, amount: proposal.amount || null,
    operationDate: proposal.date ? new Date(`${proposal.date}T12:00:00.000Z`) : null,
    resolvedAt: status === "DISCARDED" ? new Date() : null,
  } });
  if (reason === "PURCHASE") await registerCaptureMovement(tx, movement, false);
  if (paymentCaptureKind(movement)) movement = await automateCapturePayment(tx, event, movement);
  if (moneyCaptureKind(movement) || accountDebitNotice(movement)) movement = await automateMoneyCapture(tx, event, movement);
  await tx.captureEvent.update({ where: { id: event.id }, data: {
    movementId: movement.id, interpretation: { ...interpretation, proposal, reason },
  } });
  return movement;
}

async function reinterpretCaptureMovement(tx, movement) {
  const excludedDebit = movement.status === "DISCARDED" && movement.reason === "NON_CREDIT_ACCOUNT";
  if ((!excludedDebit && !["REVIEW", "OBSERVED"].includes(movement.status)) || movement.expenseId || movement.originalExpenseId || movement.installmentPurchaseId) {
    throw new ApiAccessError("El aviso ya se resolvió. Su registro y análisis se conservan.", 409);
  }
  if (movement.correction) throw new ApiAccessError("Este aviso tiene una corrección personal. Consérvala y resuélvelo desde la revisión.", 409);
  const events = await tx.captureEvent.findMany({ where: { userId: movement.userId, movementId: movement.id }, orderBy: { createdAt: "asc" } });
  if (events.length !== 1) throw new ApiAccessError("Revisa manualmente las evidencias de este movimiento.", 409);
  const event = events[0], state = await captureInterpretationState(tx, event, true);
  if (!state.parserKey) throw new ApiAccessError("Todavía no hay un formato disponible para este aviso.", 409);
  const key = captureHash(JSON.stringify({ eventId: event.id, requestHash: event.requestHash, parserKey: state.parserKey,
    reason: state.reason, proposal: state.proposal }));
  const history = movement.analysisHistory || [];
  if (history.some(analysis => analysis.key === key)) return movement;
  if (history.length >= 50) throw new ApiAccessError("El historial de análisis está completo. Conserva la evidencia y revisa los datos manualmente.", 409);
  return tx.captureMovement.update({ where: { id: movement.id }, data: {
    parserKey: state.parserKey, status: state.status, reason: state.reason, proposal: state.proposal,
    cardId: state.proposal.cardId || null, amount: state.proposal.amount || null,
    operationDate: state.proposal.date ? new Date(`${state.proposal.date}T12:00:00Z`) : null,
    referenceKey: null, fallbackDueAt: null,
    resolvedAt: state.status === "DISCARDED" ? new Date() : null,
    analysisHistory: [...history, { key, eventId: event.id, requestHash: event.requestHash, analyzedAt: new Date().toISOString(),
      previous: { parserKey: movement.parserKey, status: movement.status, reason: movement.reason, proposal: movement.proposal, referenceKey: movement.referenceKey },
      interpretation: { ...state.interpretation, reason: state.reason, proposal: state.proposal } }],
  } });
}

async function validateWalletBackup(tx, movement) {
  const oldKey = "wallet.santander-purchase.es.v1", newKey = "wallet.santander-purchase.es.v2";
  if (movement.parserKey === newKey && movement.status === "LINKED"
    && movement.analysisHistory?.some(analysis => analysis.validation === "LINKED_WALLET_BACKUP")) return movement;
  if (movement.parserKey !== oldKey || movement.status !== "LINKED" || !movement.expenseId || movement.correction || movement.installmentPurchaseId) {
    throw new ApiAccessError("Valida únicamente el aviso Wallet Santander anterior que ya vinculaste a un gasto bancario cotejado.", 409);
  }
  const expense = await tx.dailyExpense.findFirst({ where: { id: movement.expenseId, userId: movement.userId } });
  if (!expense?.reconciledAt || expense.reconciliationStatus !== "CONFIRMED" || expense.paymentMethod !== "CARD") {
    throw new ApiAccessError("Coteja primero el gasto bancario vinculado a este aviso.", 409);
  }
  const events = await tx.captureEvent.findMany({ where: { userId: movement.userId, movementId: movement.id } });
  if (events.length !== 1) throw new ApiAccessError("Revisa manualmente las evidencias de este aviso.", 409);
  const event = events[0], state = await captureInterpretationState(tx, event, true), p = state.proposal;
  if (state.parserKey !== newKey || state.reason !== "OBSERVATION" || p.currency !== "MXN"
    || p.cardId !== movement.cardId || p.cardId !== expense.cardId || !new Prisma.Decimal(p.amount).equals(expense.amount)) {
    throw new ApiAccessError("El formato actual no confirma tarjeta, moneda e importe del gasto vinculado. Revisa sus datos y alias.", 409);
  }
  if (p.date !== expense.date.toISOString().slice(0, 10)) {
    throw new ApiAccessError("La fecha del aviso Wallet difiere de la fecha del gasto bancario. Se conserva el gasto; revisa otra muestra para habilitar Wallet.", 409);
  }
  const bank = await tx.captureMovement.findFirst({ where: { userId: movement.userId, expenseId: expense.id,
    parserKey: "santander.card-purchase.es.v1", status: { in: ["REGISTERED", "LINKED"] } } });
  if (!bank?.proposal?.operationAt || bank.proposal.cardId !== p.cardId || bank.proposal.currency !== "MXN"
    || bank.proposal.date !== p.date || !new Prisma.Decimal(bank.proposal.amount).equals(p.amount)) {
    throw new ApiAccessError("Falta el aviso bancario completo que respalda este gasto cotejado.", 409);
  }
  const history = movement.analysisHistory || [];
  if (history.length >= 50) throw new ApiAccessError("El historial de análisis está completo. Conserva la evidencia y revisa otra muestra.", 409);
  const interpretation = { ...state.interpretation, reason: state.reason, proposal: p };
  const key = captureHash(JSON.stringify({ validation: "LINKED_WALLET_BACKUP", eventId: event.id, requestHash: event.requestHash, interpretation }));
  return tx.captureMovement.update({ where: { id: movement.id }, data: { parserKey: newKey, proposal: p,
    operationDate: new Date(`${p.date}T12:00:00Z`), analysisHistory: [...history, {
      key, validation: "LINKED_WALLET_BACKUP", eventId: event.id, requestHash: event.requestHash, analyzedAt: new Date().toISOString(),
      previous: { parserKey: movement.parserKey, status: movement.status, reason: movement.reason, proposal: movement.proposal, referenceKey: movement.referenceKey },
      interpretation,
    }] } });
}

async function captureExpenseData(tx, movement) {
  const { userId } = movement;
  const proposal = effectiveCapture(movement);
  const rule = await tx.captureMerchantRule.findUnique({ where: {
    userId_cardId_merchant: { userId, cardId: proposal.cardId, merchant: normalizeMerchant(proposal.merchant) },
  } });
  const policyParser = proposal.completionPolicy && captureParsers.find(parser => parser.key === movement.parserKey && parser.completionPolicy);
  const policySubscription = policyParser && proposal.subscriptionId ? await tx.subscription.findFirst({ where: { id: proposal.subscriptionId, userId } }) : null;
  if (policyParser) {
    const policy = await tx.captureAutomation.findFirst({ where: { userId, cardId: proposal.cardId, parserKey: policyParser.key } });
    if (!matchesCapturePolicy(policy, policyParser, proposal) || (policyParser.policyRequiresSubscription && !policySubscription)) return { reason: "FORMAT_POLICY_REQUIRED" };
  }
  let categoryId = movement.correction?.categoryId || policySubscription?.categoryId || rule?.categoryId;
  if (!categoryId) categoryId = (await tx.category.upsert({ where: { userId_name: { userId, name: "Por clasificar" } },
    create: { userId, name: "Por clasificar" }, update: {} })).id;
  const data = { date: proposal.date, amount: proposal.amount, concept: proposal.merchant,
    paymentMethod: "CARD", cardId: proposal.cardId, categoryId, subscriptionId: policySubscription?.id || rule?.subscriptionId || null };
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
    if ((!policySubscription && (full.cardId !== data.cardId || full.paymentMethod !== "CARD")) || !subscriptionChargeDate(full, month)
      || scheduledDate > today || data.date > today
      || full.charges.some(charge => charge.month === month)
      || full.dailyExpenses.some(expense => (expense.subscriptionCharge?.month || expense.date.toISOString().slice(0, 7)) === month)
      || getSubscriptionReceipts(full, month, cycles).length) return { reason: "SUBSCRIPTION_CONFLICT" };
  }
  return { data };
}

export async function registerCaptureMovement(tx, movement, distinct) {
  if (refundCaptureKind(movement)) throw new ApiAccessError("Una devolución se aplica a un gasto existente; no crea otro gasto.", 409);
  if (paymentCaptureKind(movement)) throw new ApiAccessError("Este aviso corresponde a un pago o cargo de cuenta. Usa la revisión de pagos de tarjeta.", 409);
  const p = effectiveCapture(movement);
  if (!p.cardId || !p.amount || !p.date || p.currency !== "MXN") throw new ApiAccessError("El aviso necesita tarjeta, importe, moneda y fecha verificados.", 409);
  if (!distinct && (await captureCandidates(tx, movement.userId, p)).some(candidate => candidate.type !== "MOVEMENT" || candidate.id !== movement.id)) {
    return tx.captureMovement.update({ where: { id: movement.id }, data: { reason: "POSSIBLE_DUPLICATE" } });
  }
  const { data, reason } = await captureExpenseData(tx, movement);
  if (reason) return tx.captureMovement.update({ where: { id: movement.id }, data: { status: "REVIEW", reason } });
  const { expense } = await createExpenseInTransaction(tx, movement.userId, data, { id: true }, "PENDING");
  return tx.captureMovement.update({ where: { id: movement.id }, data: { status: "REGISTERED", reason: distinct ? "USER_DISTINCT" : "AUTOMATIC",
    expenseId: expense.id, originalExpenseId: expense.id, fallbackDueAt: null, resolvedAt: new Date() } });
}

export async function resolveCaptureMovement(db, userId, input) {
  if (!input || typeof input.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.id)
    || !["link", "linkInstallment", "distinct", "discard", "convertToInstallments", "correct", "register", "reinterpret", "validateWalletBackup", "registerPayment", "linkPayment", "reversePayment", "applyRefund", "reverseRefund", "registerMoneyTransfer", "registerMoneyWithdrawal", "registerDebitExpense", "correctDebitType"].includes(input.action)) {
    throw new ApiAccessError("Resolución no válida.", 400);
  }
  return db.$transaction(async tx => {
    await lockDebtAccounts(tx, userId);
    const movement = await tx.captureMovement.findFirst({ where: { id: input.id, userId } });
    if (!movement) throw new ApiAccessError("Aviso no encontrado.", 404);
    if (input.action === "correctDebitType") return correctDebitCapture(tx, movement, input);
    if (["registerMoneyTransfer", "registerMoneyWithdrawal", "registerDebitExpense"].includes(input.action)) return resolveMoneyCapture(tx, movement, input);
    if (moneyCaptureKind(movement) && !["discard", "reinterpret"].includes(input.action)) throw new ApiAccessError("Revisa este aviso como movimiento entre cuentas.", 409);
    if (["applyRefund", "reverseRefund"].includes(input.action)) return resolveCaptureRefund(tx, movement, input);
    if (["registerPayment", "linkPayment", "reversePayment"].includes(input.action)) return resolveCapturePayment(tx, movement, input);
    if (input.action === "reinterpret") return reinterpretCaptureMovement(tx, movement);
    if (input.action === "validateWalletBackup") return validateWalletBackup(tx, movement);
    if (refundCaptureKind(movement) && input.action !== "discard") throw new ApiAccessError("Resuelve este aviso desde la revisión de devoluciones.", 409);
    if (paymentCaptureKind(movement) && input.action !== "discard") throw new ApiAccessError("Resuelve este aviso desde Pagos de tarjeta; no se puede convertir en un gasto.", 409);
    if (movement.fallbackDueAt) await tx.captureMovement.update({ where: { id: movement.id }, data: {
      fallbackDueAt: null, reason: "BANK_FALLBACK_MANUAL_REVIEW",
    } });
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
        expenseId: expense.id, originalExpenseId: expense.id, fallbackDueAt: null, resolvedAt: new Date() } });
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
  if (!expense || expense.refundOriginalAmount != null || expense.paymentMethod !== "CARD" || !expense.cardId || expense.subscriptionId || expense.receivableAccountId
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
