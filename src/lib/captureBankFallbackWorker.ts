import type { PrismaClient } from '@prisma/client';
import { captureReportedState, captureProposal, captureFieldsArray } from './captureJson';
import { lockDebtAccounts } from "@/lib/debtAccountService";
import { interpretCapture, captureParsers } from "@/lib/captureParsers";
import { resolveCaptureIdentity } from "@/lib/captureIdentity";
import { bankFallbackInterpretation } from "@/lib/captureBankFallback";
import { registerCaptureMovement } from "@/lib/captureProcessing";

export async function runBankFallbacks(db: PrismaClient, { now = new Date(), limit = 50, budgetMs = 45000 } = {}) {
  const due = await db.captureMovement.findMany({ where: { reason: "BANK_FALLBACK_WAIT", status: "REVIEW", fallbackDueAt: { lte: now } },
    orderBy: [{ fallbackDueAt: "asc" }, { id: "asc" }], take: limit, select: { id: true, userId: true, events: { select: { deviceId: true } } } });
  const results = { registered: 0, review: 0, skipped: 0, failed: 0, users: [] as string[] }, started = Date.now();
  for (const candidate of due) {
    if (Date.now() - started >= budgetMs) break;
    try {
      const result = await db.$transaction(async tx => {
        // Misma jerarquía que la recepción: teléfono antes de propietario.
        const deviceId = candidate.events[0]?.deviceId;
        if (deviceId) await tx.$queryRaw`SELECT id FROM capture_devices WHERE id = ${deviceId}::uuid FOR UPDATE`;
        await lockDebtAccounts(tx, candidate.userId);
        const movement = await tx.captureMovement.findUnique({ where: { id: candidate.id }, include: { events: true } });
        if (!movement || movement.reason !== "BANK_FALLBACK_WAIT" || movement.status !== "REVIEW"
          || !movement.fallbackDueAt || movement.fallbackDueAt > now) return "skipped";
        const review = async (reason: string) => {
          await tx.captureMovement.update({ where: { id: movement.id }, data: { fallbackDueAt: null, reason } });
          return "review" as const;
        };
        if (movement.correction || movement.expenseId || movement.originalExpenseId || movement.installmentPurchaseId || movement.events.length !== 1) return review("BANK_FALLBACK_MANUAL_REVIEW");
        const event = movement.events[0]!, device = await tx.captureDevice.findUnique({ where: { id: event.deviceId } });
        if (!device?.approvedAt || device.userId !== movement.userId || device.pausedAt || device.revokedAt
          || captureFieldsArray(device.pausedPackages).includes(event.sourcePackage) || captureReportedState(device.reportedState)?.deliveryPaused || captureReportedState(device.reportedState)?.notificationAccess === false
          || (Array.isArray(captureReportedState(device.reportedState)?.selectedPackages) && !captureReportedState(device.reportedState).selectedPackages!.includes(event.sourcePackage))) return review("BANK_FALLBACK_PAUSED");
        const revision = await tx.captureEvent.findFirst({ where: { userId: event.userId, deviceId: event.deviceId,
          sourcePackage: event.sourcePackage, notificationKeyHash: event.notificationKeyHash, id: { not: event.id } } });
        if (revision) return review("NOTIFICATION_REVISION");
        const decoded = interpretCapture(event), parser = captureParsers.find(row => row.key === decoded.parserKey);
        const identity = await resolveCaptureIdentity(tx, event, decoded, parser);
        const fallback = await bankFallbackInterpretation(tx, event, identity);
        if (fallback?.reason !== "BANK_FALLBACK_WAIT" || fallback.proposal.bankFallback!.policyId !== captureProposal(movement.proposal).bankFallback?.policyId
          || fallback.proposal.bankFallback!.acceptedAt !== captureProposal(movement.proposal).bankFallback?.acceptedAt
          || (["cardId", "amount", "date", "currency", "merchant"] as const).some(key => fallback.proposal[key] !== captureProposal(movement.proposal)[key])) return review("BANK_FALLBACK_REVIEW");
        const registered = await registerCaptureMovement(tx, movement, false);
        await tx.captureMovement.update({ where: { id: movement.id }, data: { fallbackDueAt: null,
          ...(registered.status === "REGISTERED" ? { reason: "BANK_FALLBACK_REGISTERED" } : {}) } });
        return registered.status === "REGISTERED" ? "registered" : "review";
      }, { isolationLevel: "ReadCommitted", timeout: 10000 });
      results[result]++;
      if (result === "registered" && !results.users.includes(candidate.userId)) results.users.push(candidate.userId);
    } catch {
      // Una transacción fallida conserva el vencimiento para el siguiente intento.
      results.failed++;
    }
  }
  return results;
}
