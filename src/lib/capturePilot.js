import { captureParsers, normalizeMerchant } from "@/lib/captureParsers";
import { Prisma } from "@prisma/client";
import { paymentCaptureKind } from "@/lib/capturePaymentParsers";

const unresolved = ["REVIEW", "OBSERVED"];
const coincidenceReasons = ["POSSIBLE_DUPLICATE", "REFERENCE_CONFLICT", "NOTIFICATION_REVISION"];
const mexicoClock = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });

function mexicoTime(day, time) {
  const target = Date.parse(`${day}T${time}Z`);
  let result = target;
  for (let i = 0; i < 3; i++) {
    const local = Date.parse(`${mexicoClock.format(new Date(result)).replace(" ", "T")}Z`);
    result += target - local;
  }
  return new Date(result);
}

function changedProposal(movement) {
  const { proposal: original, correction } = movement;
  if (!correction) return false;
  // Completar un campo ausente o elegir categoría no demuestra un error del analizador.
  return ["cardId", "date", "currency"].some(key => original[key] && original[key] !== correction[key])
    || Boolean(original.amount && !new Prisma.Decimal(original.amount).equals(correction.amount))
    || Boolean(original.merchant && normalizeMerchant(original.merchant) !== normalizeMerchant(correction.merchant));
}

// Solo agrega evidencia persistida. No infiere compras, avisos perdidos ni cobertura
// del teléfono; esos hechos necesitan el cotejo del estado y la observación real.
export async function capturePilotSummary(tx, userId, period, records, statement) {
  const expenseIds = records.filter(row => row.type === "EXPENSE").map(row => row.id);
  const purchaseIds = records.filter(row => row.type === "INSTALLMENT").map(row => row.id);
  const operationDate = { gte: new Date(`${period.startDate}T00:00:00Z`), lte: new Date(`${period.endDate}T23:59:59.999Z`) };
  const receivedMovements = await tx.captureMovement.findMany({ where: { userId, OR: [
    { expenseId: { in: expenseIds } }, { installmentPurchaseId: { in: purchaseIds } },
    { cardId: period.cardId, operationDate },
  ] }, select: { id: true, status: true, reason: true, expenseId: true, originalExpenseId: true,
    installmentPurchaseId: true, proposal: true, correction: true,
    events: { where: { userId }, select: { id: true, sourcePackage: true } } } });
  const movements = receivedMovements.filter(row => !paymentCaptureKind(row));
  const aliases = await tx.captureCardAlias.findMany({ where: { userId, cardId: period.cardId }, select: { sourcePackage: true } });
  const sources = [...new Set(aliases.map(alias => alias.sourcePackage))];
  const automations = await tx.captureAutomation.findMany({ where: { userId, cardId: period.cardId, mode: "AUTOMATIC" }, select: { parserKey: true } });
  const automaticFormats = automations.filter(row => captureParsers.some(parser => parser.key === row.parserKey && parser.verified)).map(row => row.parserKey);
  // La recepción local solo delimita avisos sin fecha/tarjeta, nunca una compra.
  // Intl conserva también el horario de verano de períodos históricos.
  const receivedAt = { gte: mexicoTime(period.startDate, "00:00:00"),
    lte: new Date(mexicoTime(period.endDate, "23:59:59").getTime() + 999) };
  const unassignedSourceEvents = sources.length ? await tx.captureEvent.count({ where: { userId,
    sourcePackage: { in: sources }, receivedAt,
    OR: [{ movementId: null }, { movement: { cardId: null, status: { in: unresolved } } }],
  } }) : 0;
  const undatedCardMovements = await tx.captureMovement.count({ where: { userId, cardId: period.cardId,
    operationDate: null, status: { in: unresolved }, events: { some: { userId, receivedAt } },
  } });
  let recordsWithEvidence = 0, confirmedWithoutEvidence = 0, additionalEvidence = 0;
  const evidenceByRecord = records.map(row => {
    const linked = movements.filter(movement => row.type === "EXPENSE" ? movement.expenseId === row.id : movement.installmentPurchaseId === row.id);
    const count = new Set(linked.flatMap(movement => movement.events.map(event => event.id))).size;
    if (count) recordsWithEvidence++;
    else if (row.matched) confirmedWithoutEvidence++;
    additionalEvidence += Math.max(count - 1, 0);
    return { type: row.type, id: row.id, count };
  });
  const pending = movements.filter(row => unresolved.includes(row.status));
  const eventIds = new Set(movements.flatMap(row => row.events.map(event => event.id)));
  const missingExpenseIds = new Set(Object.values(statement?.operations || {}).map(operation => operation.expenseId));
  return {
    automaticFormats, records: records.length, confirmedRecords: records.filter(row => row.matched).length,
    recordsWithEvidence, recordsWithoutEvidence: records.length - recordsWithEvidence, confirmedWithoutEvidence,
    linkedEvents: eventIds.size, additionalEvidence, pendingMovements: pending.length,
    unresolvedCoincidences: pending.filter(row => coincidenceReasons.includes(row.reason)).length,
    correctedProposals: movements.filter(changedProposal).length,
    deletedExpenseLinks: movements.filter(row => row.originalExpenseId && !row.expenseId && !row.installmentPurchaseId).length,
    missingRecordsAdded: records.filter(row => row.type === "EXPENSE" && missingExpenseIds.has(row.id)).length,
    unassignedSourceEvents, undatedCardMovements, evidenceByRecord,
  };
}
