import type { Prisma, CaptureCardAlias, CaptureEvent } from '@prisma/client';
import type { CaptureInterpretation, CaptureParser } from '@/lib/captureTypes';
import { completeCaptureFormat } from "@/lib/captureFormatPolicy";

export function captureAliasScope(parser: Pick<CaptureParser, 'sourcePackage' | 'aliasSourcePackage' | 'aliasSourcePackages' | 'aliasKinds'>) {
  return { sourcePackage: parser.aliasSourcePackage || parser.sourcePackage,
    sourcePackages: parser.aliasSourcePackages,
    kinds: parser.aliasKinds || null };
}

export function aliasSupportsParser(alias: CaptureCardAlias, parser: CaptureParser) {
  const scope = captureAliasScope(parser);
  return (scope.sourcePackages ? scope.sourcePackages.includes(alias.sourcePackage) : alias.sourcePackage === scope.sourcePackage)
    && (!scope.kinds || scope.kinds.includes(alias.kind));
}

export async function resolveCaptureIdentity(tx: Prisma.TransactionClient, event: CaptureEvent, interpretation: CaptureInterpretation, parser: CaptureParser | undefined): Promise<CaptureInterpretation> {
  if (parser?.completionPolicy) return completeCaptureFormat(tx, event, interpretation, parser);
  const proposal = interpretation.proposal;
  if (!proposal.alias && !proposal.printedAlias) return interpretation;
  const printed = proposal.printedAlias;
  const scope = captureAliasScope(parser || { sourcePackage: event.sourcePackage });
  if (printed && (!scope.kinds || !/^\d{3,4}$/.test(printed.value) || printed.digits !== printed.value.length)) return interpretation;
  const aliases = await tx.captureCardAlias.findMany({ where: {
    userId: event.userId, sourcePackage: scope.sourcePackages ? { in: scope.sourcePackages } : scope.sourcePackage,
    kind: scope.kinds ? { in: scope.kinds } : proposal.alias!.kind,
    value: printed ? { endsWith: printed.value } : proposal.alias!.value,
  }, orderBy: [{ kind: "asc" }, { value: "asc" }] });
  const cards = [...new Set(aliases.map(alias => alias.cardId))];
  if (cards.length !== 1) return { ...interpretation, reason: cards.length ? "AMBIGUOUS_CARD" : "UNKNOWN_CARD" };
  const alias = aliases.find(alias => alias.verifiedAt);
  if (!alias) return { ...interpretation, reason: "UNVERIFIED_ALIAS" };
  // «TDC Platinum» no identifica el banco. Además del alias BBVA verificado,
  // rechazar terminaciones compartidas con otra tarjeta bancaria del propietario.
  if (parser?.rejectCrossBankAliasCollision && await tx.captureCardAlias.findFirst({ where: {
    userId: event.userId, cardId: { not: cards[0]! }, kind: { in: parser.aliasKinds },
    value: printed ? { endsWith: printed.value } : proposal.alias!.value,
  } })) return { ...interpretation, reason: "AMBIGUOUS_CARD" };
  if (!await tx.card.findFirst({ where: { id: cards[0]!, userId: event.userId } })) return { ...interpretation, reason: "UNKNOWN_CARD" };
  return { ...interpretation, proposal: { ...proposal, cardId: cards[0]!,
    ...(printed ? { alias: { kind: alias.kind, value: alias.value }, aliasSourcePackage: alias.sourcePackage } : {}),
  } };
}
