import type { CaptureConfigurationInput } from './captureConfiguration';
import type { CaptureBankFallback, CaptureEvent } from '@prisma/client';
import type { CaptureDb, CaptureProposal, CaptureInterpretation } from '@/lib/captureTypes';
import { captureCorrection } from '@/lib/captureJson';
import { ApiAccessError } from "@/lib/apiAuth";
import { captureParsers, interpretCapture, captureNotificationDate } from "@/lib/captureParsers";
import { resolveCaptureIdentity } from "@/lib/captureIdentity";
import { Prisma } from "@prisma/client";

const foreignCurrencyCodes = new Set(Intl.supportedValuesOf("currency").filter(code => code !== "MXN"));

export const bankFallbackFormats = [
  { sourcePackage: "com.citibanamex.banamexmobile", keys: ["banamex.card-charge.es.v1", "banamex.joy-card-charge.es.v1"], walletKey: "wallet.banamex-purchase.es.v1", datePolicy: "BANK_OPERATION" },
  { sourcePackage: "com.nu.production", keys: ["nu.card-purchase.es.v1"], walletKey: "wallet.nu-purchase.es.v1", datePolicy: "NOTIFICATION_POSTED_AT" },
  { sourcePackage: "mx.bancosantander.supermovil", keys: ["santander.card-purchase.es.v1"], walletKey: "wallet.santander-purchase.es.v2", datePolicy: "BANK_OPERATION" },
];

// Completa únicamente formatos observados, identidad resuelta y declaraciones
// explícitas del propietario. No cambia la verificación global de los parsers.
export function completeBankFallback(event: CaptureEvent, interpretation: CaptureInterpretation, policy: Pick<CaptureBankFallback, 'id' | 'userId' | 'cardId' | 'bankSourcePackage' | 'currency' | 'purchasesOnly' | 'bankDatePolicy' | 'waitMinutes' | 'acceptedAt'> | null): CaptureProposal | null {
  const format = bankFallbackFormats.find(row => row.sourcePackage === event.sourcePackage && row.keys.includes(interpretation.parserKey ?? ""));
  const p = interpretation.proposal;
  if (!format || !policy || !p.cardId || p.cardId !== policy.cardId || event.userId !== policy.userId
    || policy.bankSourcePackage !== format.sourcePackage || policy.currency !== "MXN" || !policy.purchasesOnly
    || policy.bankDatePolicy !== format.datePolicy || policy.waitMinutes !== 15 || !policy.acceptedAt
    || !["PURCHASE", "INCOMPLETE_FORMAT"].includes(interpretation.reason)) return null;
  const text = Object.values(event.fields || {}).join(" ");
  if ((text.toUpperCase().match(/\b[A-Z]{3}\b/g) || []).some(code => foreignCurrencyCodes.has(code))
    || /\b(?:d[oó]lares|dollars|euros|yenes|libras)\b|US\$/i.test(text)
    || (text.match(/\p{Sc}/gu) || []).some(symbol => symbol !== "$") || (p.currency && p.currency !== "MXN")) return null;
  if (/retiro\s+(?:(?:de|en)\s+)?efectivo|disposici[oó]n\s+(?:(?:de|en)\s+)?efectivo|\bcajero\b|\bATM\b/i.test(text)) return null;
  const date = format.datePolicy === "NOTIFICATION_POSTED_AT" ? captureNotificationDate(event)
    : p.operationAt && p.date && p.dateSource === "BANK_OPERATION" ? { date: p.date, dateSource: p.dateSource } : null;
  if (!date || !p.amount || !p.merchant) return null;
  return { ...p, ...date, currency: "MXN", currencySource: p.currency ? "BANK_NOTICE" : "OWNER_DECLARATION",
    movementType: "PURCHASE", evidenceOnly: false, missingFields: [],
    bankFallback: { policyId: policy.id, acceptedAt: new Date(policy.acceptedAt).toISOString(), walletParserKey: format.walletKey, waitMinutes: 15 } };
}

export async function bankFallbackInterpretation(tx: Prisma.TransactionClient, event: CaptureEvent, interpretation: CaptureInterpretation, observationOnly: boolean = false): Promise<{ primaryWalletParserKey: string; reason?: never; status?: never; proposal?: never; fallbackDueAt?: never } | { primaryWalletParserKey?: never; reason: string; status: string; proposal: CaptureProposal; fallbackDueAt?: Date } | null> {
  const format = bankFallbackFormats.find(row => row.keys.includes(interpretation.parserKey ?? "") || row.walletKey === interpretation.parserKey);
  if (!format || !interpretation.proposal.cardId) return null;
  const policy = await tx.captureBankFallback.findUnique({ where: { userId_cardId: { userId: event.userId, cardId: interpretation.proposal.cardId } } });
  if (!policy || policy.bankSourcePackage !== format.sourcePackage) return null;
  if (format.walletKey === interpretation.parserKey) return { primaryWalletParserKey: format.walletKey };
  const proposal = completeBankFallback(event, interpretation, policy);
  if (!proposal) return { reason: "BANK_FALLBACK_REVIEW", status: "REVIEW", proposal: interpretation.proposal };
  if (observationOnly || policy.mode !== "AUTOMATIC" || new Date(event.createdAt) < policy.acceptedAt) {
    return { reason: "BANK_FALLBACK_PAUSED", status: "OBSERVED", proposal };
  }
  const wallet = await tx.captureAutomation.findUnique({ where: { userId_cardId_parserKey: {
    userId: event.userId, cardId: policy.cardId, parserKey: format.walletKey,
  } } });
  if (wallet?.mode !== "AUTOMATIC" || wallet.datePolicy !== "NOTIFICATION_POSTED_AT") return { reason: "BANK_FALLBACK_PAUSED", status: "REVIEW", proposal };
  return { reason: "BANK_FALLBACK_WAIT", status: "REVIEW", proposal,
    fallbackDueAt: new Date(new Date(event.createdAt).getTime() + 15 * 60000) };
}

async function validatePilot(tx: Prisma.TransactionClient, userId: string, cardId: string, format: BankFallbackFormat, movement: FallbackPilot | null) {
  if (!movement || !["LINKED", "REGISTERED"].includes(movement.status) || !movement.expense?.reconciledAt
    || movement.expense.userId !== userId || movement.expense.cardId !== cardId || movement.events.length !== 1) return false;
  const event = movement.events[0]!;
  if (event.userId !== userId || event.sourcePackage !== format.sourcePackage) return false;
  const decoded = interpretCapture(event), parser = captureParsers.find(row => row.key === decoded.parserKey);
  const identity = await resolveCaptureIdentity(tx, event, decoded, parser);
  const proposal = completeBankFallback(event, identity, { id: "pilot", userId, cardId, bankSourcePackage: format.sourcePackage,
    currency: "MXN", purchasesOnly: true, bankDatePolicy: format.datePolicy, waitMinutes: 15, acceptedAt: new Date() });
  return Boolean(proposal && new Prisma.Decimal(proposal.amount!).equals(movement.expense.amount)
    && proposal.date === movement.expense.date.toISOString().slice(0, 10)
    && (!captureCorrection(movement.correction) || (["cardId", "amount", "date", "currency"] as const).every(key => String(captureCorrection(movement.correction)![key]) === String(proposal[key]))));
}

export async function bankFallbackOptions(tx: CaptureDb, userId: string, cardId: string | undefined = undefined) {
  const automations = await tx.captureAutomation.findMany({ where: { userId, ...(cardId ? { cardId } : {}), mode: "AUTOMATIC", datePolicy: "NOTIFICATION_POSTED_AT" } });
  const pilots = await tx.captureMovement.findMany({ where: { userId, ...(cardId ? { cardId } : {}), status: { in: ["LINKED", "REGISTERED"] },
    parserKey: { in: bankFallbackFormats.flatMap(row => row.keys) }, expense: { reconciledAt: { not: null } } },
    select: { id: true, cardId: true, parserKey: true, status: true, correction: true, events: true,
      expense: { select: { userId: true, cardId: true, amount: true, date: true, reconciledAt: true } } },
    orderBy: { createdAt: "desc" } });
  const options: { cardId: string; bankSourcePackage: string; bankDatePolicy: string; evidenceMovementId: string }[] = [];
  for (const pilot of pilots) {
    const format = bankFallbackFormats.find(row => row.keys.includes(pilot.parserKey ?? ""))!;
    if (options.some(row => row.cardId === pilot.cardId! && row.bankSourcePackage === format.sourcePackage)
      || !automations.some(row => row.cardId === pilot.cardId! && row.parserKey === format.walletKey)) continue;
    if (await validatePilot(tx, userId, pilot.cardId!, format, pilot)) options.push({ cardId: pilot.cardId!,
      bankSourcePackage: format.sourcePackage, bankDatePolicy: format.datePolicy, evidenceMovementId: pilot.id });
  }
  return options;
}

export async function configureBankFallback(tx: Prisma.TransactionClient, userId: string, data: Extract<CaptureConfigurationInput, { action: 'bankFallback' }>) {
  const identity = { userId, cardId: data.cardId };
  const existing = await tx.captureBankFallback.findUnique({ where: { userId_cardId: identity } });
  if (data.mode === "OBSERVATION") {
    if (!existing) throw new ApiAccessError("No hay un respaldo configurado para esta tarjeta.", 404);
    await tx.captureMovement.updateMany({ where: { ...identity, reason: "BANK_FALLBACK_WAIT" }, data: { fallbackDueAt: null, reason: "BANK_FALLBACK_PAUSED" } });
    return tx.captureBankFallback.update({ where: { id: existing.id }, data: { mode: "OBSERVATION" } });
  }
  const format = bankFallbackFormats.find(row => row.sourcePackage === data.bankSourcePackage && row.datePolicy === data.bankDatePolicy);
  if (!format) throw new ApiAccessError("Fuente o fecha de respaldo no disponible.", 400);
  const options = await bankFallbackOptions(tx, userId, data.cardId);
  if (!options.some(row => row.bankSourcePackage === data.bankSourcePackage)) {
    throw new ApiAccessError("Activa Wallet y vincula y coteja primero una muestra bancaria de esta tarjeta con terminación inequívoca.", 409);
  }
  // La muestra elegida se valida otra vez bajo el bloqueo del propietario.
  const pilot = await tx.captureMovement.findFirst({ where: { id: data.evidenceMovementId, userId, cardId: data.cardId }, include: { expense: true, events: true } });
  if (!await validatePilot(tx, userId, data.cardId, format, pilot)) throw new ApiAccessError("La muestra bancaria ya no respalda esta regla. Revisa tarjeta, importe, moneda y fecha.", 409);
  await tx.captureAutomation.updateMany({ where: { ...identity, parserKey: { in: format.keys } }, data: { mode: "OBSERVATION" } });
  if (existing?.mode === "AUTOMATIC" && existing.bankSourcePackage === data.bankSourcePackage) return existing;
  const policy = { bankSourcePackage: data.bankSourcePackage, bankDatePolicy: data.bankDatePolicy, mode: "AUTOMATIC",
    currency: "MXN", purchasesOnly: true, waitMinutes: 15, acceptedAt: new Date(), evidenceMovementId: data.evidenceMovementId };
  return tx.captureBankFallback.upsert({ where: { userId_cardId: identity }, create: { ...identity, ...policy }, update: policy });
}

type BankFallbackFormat = (typeof bankFallbackFormats)[number];
type FallbackPilot = Prisma.CaptureMovementGetPayload<{ select: { id: true; cardId: true; parserKey: true; status: true; correction: true; events: true; expense: { select: { userId: true; cardId: true; amount: true; date: true; reconciledAt: true } } } }>;
