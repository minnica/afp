import { captureAnalysisInterpretation } from './captureJson';
import type { CaptureCardAlias, CaptureAutomation } from '@prisma/client';
import type { CaptureDb, CaptureProposal, CaptureParser } from '@/lib/captureTypes';
import { captureCorrection, captureHistory, captureProposal } from '@/lib/captureJson';
import { Prisma } from "@prisma/client";
import { normalizeMerchant } from "@/lib/captureParsers";
import { capturePackages } from "@/lib/captureProtocol";
import { aliasSupportsParser } from "@/lib/captureIdentity";
import { matchesCapturePolicy } from "@/lib/captureFormatPolicy";

export const captureActivationReasons = {
  UNVERIFIED_FORMAT: "Faltan muestras reales verificadas de este formato.",
  NO_VERIFIED_ALIAS: "Falta una terminación verificada de esta tarjeta y fuente.",
  AMBIGUOUS_ALIAS: "Una terminación también pertenece a otra tarjeta. Revisa los alias.",
  NO_REVIEWED_CAPTURE: "Revisa, registra o vincula y concilia una propuesta de esta tarjeta y formato, sin corregir los datos interpretados.",
  FORMAT_POLICY_REQUIRED: "Confirma la regla del formato con tarjeta, MXN y fecha del aviso; incluye la suscripción cuando corresponda.",
};

function matchingAlias(alias: CaptureCardAlias, proposal: CaptureProposal, sourcePackage: string) {
  return alias.cardId === proposal.cardId && alias.sourcePackage === (proposal.aliasSourcePackage || sourcePackage)
    && alias.kind === proposal.alias?.kind && alias.value === proposal.alias?.value && alias.verifiedAt;
}

// El cotejo debe respaldar la propuesta original. Completar/corregir un aviso
// desconocido no valida el analizador; editar datos personales sí se permite.
export function isReviewedCapture(movement: RolloutMovement, parser: CaptureParser, aliases: CaptureCardAlias[], automations: CaptureAutomation[] = []) {
  const p = captureProposal(movement.proposal), expense = movement.expense;
  if (!p || movement.parserKey !== parser.key || !["REGISTERED", "LINKED"].includes(movement.status)
    || !movement.resolvedAt || !expense?.reconciledAt || expense.paymentMethod !== "CARD"
    || p.currency !== "MXN" || !p.amount || !p.date || !p.merchant
    || !(p.operationAt || (parser.dateSource === "NOTIFICATION_POSTED_AT" && p.dateSource === parser.dateSource && p.notificationAt))
    || p.cardId !== movement.cardId || p.cardId !== expense.cardId) return false;
  if (parser.completionPolicy) {
    if (!automations.some(policy => matchesCapturePolicy(policy, parser, p))
      || (parser.policyRequiresSubscription && expense.subscriptionId !== p.subscriptionId)) return false;
  } else if (!aliases.some(alias => matchingAlias(alias, p, parser.sourcePackage))) return false;
  if (!movement.events.some(event => {
    const analyses = [captureAnalysisInterpretation(event.interpretation), ...(captureHistory(movement.analysisHistory) || []).filter(analysis => event.id && analysis.eventId === event.id
      && analysis.requestHash === event.requestHash).map(analysis => analysis.interpretation)];
    return event.sourcePackage === parser.sourcePackage && analyses.some(analysis => analysis?.parserKey === parser.key
      && analysis?.proposal?.cardId === p.cardId && ["OBSERVATION", "UNVERIFIED_FORMAT"].includes(analysis?.reason ?? ""));
  })) return false;
  const correction = captureCorrection(movement.correction);
  if (correction && (correction.cardId !== p.cardId || correction.date !== p.date || correction.currency !== p.currency
    || normalizeMerchant(correction.merchant) !== normalizeMerchant(p.merchant))) return false;
  try {
    return new Date(expense.date).toISOString().slice(0, 10) === p.date
      && new Prisma.Decimal(p.amount).equals(expense.amount)
      && (!correction || new Prisma.Decimal(correction.amount!).equals(p.amount));
  } catch { return false; }
}

export function captureFormatReadiness(parser: CaptureParser, cardId: string, aliases: CaptureCardAlias[], movements: RolloutMovement[], automations: CaptureAutomation[] = []) {
  const own = aliases.filter(alias => alias.cardId === cardId && aliasSupportsParser(alias, parser));
  const verified = own.filter(alias => alias.verifiedAt);
  const ambiguous = parser.completionPolicy ? [] : own.filter(alias => aliases.some(other => other.cardId !== cardId
    && (aliasSupportsParser(other, parser) || (parser.rejectCrossBankAliasCollision && parser.aliasKinds!.includes(other.kind)))
    && (parser.aliasKinds || other.kind === alias.kind) && other.value === alias.value));
  const reviewed = movements.filter(movement => movement.cardId === cardId && isReviewedCapture(movement, parser, aliases, automations));
  const policy = automations.find(policy => policy.cardId === cardId && matchesCapturePolicy(policy, parser));
  const blockers: (keyof typeof captureActivationReasons)[] = [];
  if (!parser.verified || parser.evidence === "REAL_OUT_OF_SCOPE") blockers.push("UNVERIFIED_FORMAT");
  if (parser.completionPolicy && !policy) blockers.push("FORMAT_POLICY_REQUIRED");
  if (!verified.length) blockers.push("NO_VERIFIED_ALIAS");
  if (ambiguous.length) blockers.push("AMBIGUOUS_ALIAS");
  if (!reviewed.length) blockers.push("NO_REVIEWED_CAPTURE");
  return { parserKey: parser.key, sourcePackage: parser.sourcePackage, verified: Boolean(parser.verified), dateSource: parser.dateSource || "BANK_OPERATION",
    ...(parser.completionPolicy ? { completionPolicy: parser.completionPolicy, policyRequiresSubscription: Boolean(parser.policyRequiresSubscription), hasFormatPolicy: Boolean(policy), policySubscriptionId: policy?.policySubscriptionId || null } : {}),
    verifiedAliases: verified.length, ambiguousAliases: ambiguous.length, reviewedCaptures: reviewed.length,
    blockers, canEnable: blockers.length === 0 };
}

export async function captureRolloutMovements(db: CaptureDb, userId: string, filter: Pick<Prisma.CaptureMovementWhereInput, 'cardId' | 'parserKey'> = {}) {
  return db.captureMovement.findMany({ where: { userId, ...filter, status: { in: ["REGISTERED", "LINKED"] },
    expense: { userId, reconciledAt: { not: null } } }, select: {
    cardId: true, parserKey: true, status: true, proposal: true, correction: true, analysisHistory: true, resolvedAt: true,
    expense: { select: { cardId: true, date: true, amount: true, paymentMethod: true, reconciledAt: true, subscriptionId: true } },
    events: { where: { userId }, select: { id: true, requestHash: true, sourcePackage: true, interpretation: true } },
  } });
}

export function buildCaptureRollout(cards: { id: string }[], aliases: CaptureCardAlias[], automations: CaptureAutomation[], parsers: CaptureParser[], movements: RolloutMovement[]) {
  const formats = parsers.filter(parser => parser.evidence !== "REAL_OUT_OF_SCOPE" && !parser.moneyOnly && !parser.paymentOnly && !parser.refundOnly);
  return cards.map(card => {
    // Las fuentes proceden de alias explícitos, nunca del nombre editable.
    // Wallet se muestra también sin alias para hacer visible esa limitación.
    const sources = capturePackages.filter(sourcePackage => sourcePackage === "com.google.android.apps.walletnfcrel"
      || formats.some(parser => parser.sourcePackage === sourcePackage && parser.aliasSourcePackages
        && aliases.some(alias => alias.cardId === card.id && aliasSupportsParser(alias, parser)))
      || aliases.some(alias => alias.cardId === card.id && alias.sourcePackage === sourcePackage)
      || automations.some(mode => mode.cardId === card.id && formats.some(parser => parser.key === mode.parserKey && parser.sourcePackage === sourcePackage)));
    sources.sort((a, b) => Number(a === "com.google.android.apps.walletnfcrel") - Number(b === "com.google.android.apps.walletnfcrel"));
    return { cardId: card.id,
      retiredFormats: automations.filter(mode => mode.cardId === card.id && !formats.some(parser => parser.key === mode.parserKey))
        .map(mode => ({ parserKey: mode.parserKey, mode: mode.mode })),
      sources: sources.map(sourcePackage => ({ sourcePackage,
      verifiedAliases: aliases.filter(alias => alias.cardId === card.id && alias.sourcePackage === sourcePackage && alias.verifiedAt).length,
      formats: formats.filter(parser => parser.sourcePackage === sourcePackage).map(parser => ({
        ...captureFormatReadiness(parser, card.id, aliases, movements, automations),
        mode: automations.find(mode => mode.cardId === card.id && mode.parserKey === parser.key)?.mode || "OBSERVATION",
        datePolicy: automations.find(mode => mode.cardId === card.id && mode.parserKey === parser.key)?.datePolicy || "BANK_OPERATION",
      })),
    })) };
  });
}

export type RolloutMovement = Awaited<ReturnType<typeof captureRolloutMovements>>[number];
