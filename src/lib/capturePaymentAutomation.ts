import type { CaptureEvent } from '@prisma/client';
import type { Movement } from '@/lib/captureTypes';
import { captureCorrection, captureProposal } from '@/lib/captureJson';
import { Prisma } from "@prisma/client";
import { captureHash } from "@/lib/captureProtocol";
import { paymentReceiptSource } from "@/lib/paymentReceipts";
import { getCyclePaymentState } from "@/lib/calculations/cardCyclePayments";
import { resolveCapturePayment } from "@/lib/capturePayments";

const noticeFormats: Record<string, { source: string; package: string; aliasRequired?: boolean }> = {
  "nu.card-payment.es.v1": { source: "NU_NOTICE", package: "com.nu.production" },
  "banamex.card-payment.es.v1": { source: "BANAMEX_NOTICE", package: "com.citibanamex.banamexmobile", aliasRequired: true },
  "mercadopago.card-payment.es.v1": { source: "MERCADOPAGO_NOTICE", package: "com.mercadopago.wallet" },
};

export async function automateCapturePayment(tx: Prisma.TransactionClient, event: CaptureEvent, movement: Movement) {
  const proposal = captureProposal(movement.proposal);
  const receipt = event.sourcePackage === paymentReceiptSource;
  const notice = noticeFormats[movement.parserKey ?? ''];
  if (!(receipt && movement.reason === "PAYMENT_RECEIPT") && !(notice && event.sourcePackage === notice.package && movement.reason === "PAYMENT_REVIEW")) return movement;
  const source = receipt ? "BBVA_RECEIPT" : notice!.source;
  const review = (reason: string) => tx.captureMovement.update({ where: { id: movement.id }, data: { reason } });
  if (notice?.aliasRequired && !proposal.cardId) return review("PAYMENT_POLICY_REQUIRED");
  const policies = await tx.capturePaymentPolicy.findMany({ where: { userId: event.userId, source, mode: "AUTOMATIC",
    acceptedAt: { not: null }, ...(receipt ? { destinationLast4: proposal.destinationLast4 } : {}),
    ...(notice?.aliasRequired ? { cardId: proposal.cardId! } : {}) } });
  const policy = policies.length === 1 ? policies[0] : null;
  if (!policy || (policy.destinationHash && policy.destinationHash !== proposal.destinationHash)) return review("PAYMENT_POLICY_REQUIRED");
  const p = { ...proposal, cardId: policy.cardId, currency: "MXN", paymentPolicyId: policy.id,
    policyAcceptedAt: policy.acceptedAt!.toISOString(), cardSource: notice?.aliasRequired ? "VERIFIED_BANK_ALIAS" : "OWNER_PAYMENT_POLICY", currencySource: "OWNER_PAYMENT_POLICY" };
  movement = await tx.captureMovement.update({ where: { id: movement.id }, data: { proposal: p, cardId: policy.cardId } });
  const receiverNotice = source === "BANAMEX_NOTICE" || source === "MERCADOPAGO_NOTICE";
  // Android puede reutilizar la misma clave para pagos posteriores. Solo una
  // actualización cercana se considera revisión; la clave no identifica una
  // operación bancaria de forma permanente.
  const posted = new Date(event.postedAt).getTime();
  if (receiverNotice && await tx.captureEvent.findFirst({ where: { userId: event.userId, deviceId: event.deviceId,
    sourcePackage: event.sourcePackage, notificationKeyHash: event.notificationKeyHash, id: { not: event.id },
    postedAt: { gte: new Date(posted - 5 * 60000), lte: new Date(posted + 5 * 60000) } } })) {
    return review("NOTIFICATION_REVISION");
  }
  if (receipt) {
    const referenceKey = captureHash(`payment-transfer:${p.sourceAccountHash}:${p.transferReference}`);
    const existing = await tx.captureMovement.findUnique({ where: { userId_referenceKey: { userId: event.userId, referenceKey } } });
    if (existing && existing.id !== movement.id) {
      const old = captureProposal(existing.proposal);
      if (old.amount !== p.amount || old.date !== p.date || old.destinationHash !== p.destinationHash || old.statementMonth !== p.statementMonth || old.statementYear !== p.statementYear) return review("REFERENCE_CONFLICT");
      await tx.captureEvent.update({ where: { id: event.id }, data: { movementId: existing.id } });
      await tx.captureMovement.delete({ where: { id: movement.id } });
      return existing;
    }
    movement = await tx.captureMovement.update({ where: { id: movement.id }, data: { referenceKey } });
  }
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Mexico_City" }).format(new Date());
  if (!p.date || p.date > today) return review("PAYMENT_FUTURE");
  const at = new Date(`${p.date}T12:00:00Z`);
  const cycles = await tx.cardCycle.findMany({ where: { userId: event.userId, cardId: policy.cardId, statementAmount: { not: null },
    cutDate: { lte: new Date(`${p.date}T23:59:59.999Z`), gte: new Date(at.getTime() - 90 * 86400000) },
    ...(receipt ? { month: p.statementMonth!, ...(p.statementYear ? { year: p.statementYear } : {}) } : {}) } });
  const candidates = receipt ? cycles : cycles.filter(cycle => Number(getCyclePaymentState(cycle).pendingAmount) > 0);
  if (candidates.length !== 1) return review("PAYMENT_CYCLE_REQUIRED");
  const cycle = candidates[0]!;
  await tx.$queryRaw`SELECT id FROM card_cycles WHERE id = ${cycle.id} AND "userId" = ${event.userId} FOR UPDATE`;
  const current = (await tx.cardCycle.findFirst({ where: { id: cycle.id, userId: event.userId } }))!;
  const prior = await tx.cardCyclePayment.findMany({ where: { userId: event.userId, cycleId: cycle.id, reversedAt: null } });
  const identified = prior.reduce((total, row) => total.add(row.amount), new Prisma.Decimal(0));
  if (!identified.equals(current.paidAmount || 0)) return review("PAYMENT_MANUAL_TOTAL");
  const duplicate = await tx.cardCyclePayment.findFirst({ where: { userId: event.userId, cycle: { cardId: policy.cardId }, amount: p.amount!,
    ...(receiverNotice ? {} : { reversedAt: null }),
    date: { gte: new Date(at.getTime() - 3 * 86400000), lte: new Date(at.getTime() + 3 * 86400000) } } });
  if (duplicate) return review("PAYMENT_POSSIBLE_DUPLICATE");
  if (Number(getCyclePaymentState(current).pendingAmount) < Number(p.amount)) return review("PAYMENT_EXCESS_REVIEW");
  if (p.paymentCoverage === "FULL" && !new Prisma.Decimal(getCyclePaymentState(current).pendingAmount!).equals(p.amount!)) return review("PAYMENT_TOTAL_MISMATCH");
  const resolved = await resolveCapturePayment(tx, movement, { action: "registerPayment", payment: { cycleId: cycle.id, amount: p.amount!,
    date: p.date, currency: "MXN", confirmedApplied: true, expectedPaidAmount: String(current.paidAmount || 0),
    expectedPaidAt: current.paidAt?.toISOString().slice(0, 10) || null, distinct: true,
    ...(receipt ? { statementConcept: p.statementConcept } : {}) } });
  return tx.captureMovement.update({ where: { id: resolved.id }, data: { reason: "PAYMENT_AUTOMATIC", correction: {
    ...captureCorrection(resolved.correction), dateSource: receipt ? "BANK_OPERATION" : p.dateSource, currencySource: "OWNER_PAYMENT_POLICY", paymentPolicyId: policy.id,
  } } });
}
