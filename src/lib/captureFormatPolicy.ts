import type { Prisma, CaptureAutomation, CaptureEvent } from '@prisma/client';
import type { CaptureProposal, CaptureInterpretation, CaptureParser } from '@/lib/captureTypes';
import { captureNotificationDate } from "@/lib/captureParsers";

export function matchesCapturePolicy(policy: CaptureAutomation | null | undefined, parser: CaptureParser, proposal: CaptureProposal | null = null) {
  if (!parser.completionPolicy || policy?.parserKey !== parser.key || policy.completionPolicy !== parser.completionPolicy
    || policy.datePolicy !== "NOTIFICATION_POSTED_AT" || !policy.policyAcceptedAt
    || (parser.policyRequiresSubscription ? !policy.policySubscriptionId : Boolean(policy.policySubscriptionId))) return false;
  return !proposal || (proposal.cardId === policy.cardId
    && (parser.policyRequiresSubscription ? proposal.subscriptionId === policy.policySubscriptionId : !proposal.subscriptionId)
    && proposal.completionPolicy === policy.completionPolicy && proposal.policyAcceptedAt === new Date(policy.policyAcceptedAt!).toISOString()
    && proposal.cardSource === "OWNER_FORMAT_POLICY" && proposal.currencySource === "OWNER_FORMAT_POLICY");
}

export async function completeCaptureFormat(tx: Prisma.TransactionClient, event: CaptureEvent, interpretation: CaptureInterpretation, parser: CaptureParser): Promise<CaptureInterpretation> {
  if (interpretation.reason !== "FORMAT_POLICY_REQUIRED") return interpretation;
  const policies = await tx.captureAutomation.findMany({ where: { userId: event.userId, parserKey: parser.key,
    completionPolicy: parser.completionPolicy } });
  if (policies.length !== 1 || !matchesCapturePolicy(policies[0], parser)) return interpretation;
  const policy = policies[0]!;
  if (!await tx.card.findFirst({ where: { id: policy.cardId, userId: event.userId } })
    || (parser.policyRequiresSubscription && !await tx.subscription.findFirst({ where: { id: policy.policySubscriptionId!, userId: event.userId } }))) return interpretation;
  const date = captureNotificationDate(event);
  if (!date) return { ...interpretation, reason: "INVALID_FIELDS", proposal: {} };
  return { ...interpretation, verified: true, reason: "PURCHASE", proposal: { ...interpretation.proposal, ...date,
    missingFields: [], cardId: policy.cardId, currency: "MXN", cardSource: "OWNER_FORMAT_POLICY", currencySource: "OWNER_FORMAT_POLICY",
    completionPolicy: policy.completionPolicy, policyAcceptedAt: new Date(policy.policyAcceptedAt!).toISOString(),
    ...(parser.policyRequiresSubscription ? { subscriptionId: policy.policySubscriptionId } : {}),
  } };
}
