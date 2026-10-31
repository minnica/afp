import { z } from 'zod';
import { isRecord } from './financialJson';

// Historical proposals can be partial. Inspect their known fields without
// coercion, defaults or stripping metadata; never rewrite the stored evidence.
function checked<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  schema.parse(value);
  // Validation established the shape; retain original key order and metadata
  // for optimistic checks, historical evidence and stored operation receipts.
  return value as z.output<S>;
}
const text = z.string().nullable().optional();
const number = z.number().nullable().optional();
export const captureProposalSchema = z.object({
  estimatedAmount: text, incomeKind: text, incomeTypeId: text, incomeAccountId: text, incomePolicyId: text,
  amount: text, date: text, currency: text, merchant: text, cardId: text,
  expenseVersion: text,
  operationAt: text, notificationAt: text, timeZone: text, dateSource: text,
  alias: z.object({ kind: z.string(), value: z.string() }).optional(),
  printedAlias: z.object({ value: z.string(), digits: z.number() }).optional(),
  aliasSourcePackage: text, reference: text, movementType: text,
  completionPolicy: text, policyAcceptedAt: text, subscriptionId: text, categoryId: text,
  cardSource: text, currencySource: text, bankAuthorization: text, bankReference: text,
  evidenceOnly: z.boolean().optional(), missingFields: z.array(z.string()).optional(),
  primaryWalletParserKey: text,
  bankFallback: z.object({ policyId: z.string(), acceptedAt: z.string(), walletParserKey: z.string(), waitMinutes: z.number() }).optional(),
  destinationLabel: text, accountLast4: text, accountSuffix: text,
  fromAccountId: text, toAccountId: text, moneyPolicyId: text, moneyKind: text,
  payableAccountId: text,
  paymentPolicyId: text, paymentEvidence: text, paymentCoverage: text,
  statementMonth: number, statementYear: number, statementConcept: text,
  uberReceipt: z.object({ tripAt: z.string(), updated: z.boolean(), tipAmount: z.string().optional(),
    expenseVersion: z.string().optional() }).optional(),
  destinationLast4: text, destinationHash: text, sourceAccountHash: text, transferReference: text,
  appliedAt: text, refundKind: text,
}).catchall(z.json().optional());
export function captureProposal(value: unknown) { return checked(captureProposalSchema, value); }
export function captureCorrection(value: unknown) { return value == null ? null : captureProposal(value); }
export function captureFields(value: unknown): Record<string, string> { return checked(z.record(z.string(), z.string()), value); }
export const captureAnalysisSchema = z.array(z.object({
  key: z.string().optional(), eventId: z.string().optional(), requestHash: z.string().optional(), validation: z.string().optional(),
  interpretation: z.object({ parserKey: text, reason: z.string(), proposal: captureProposalSchema }).catchall(z.json().optional()).optional(),
}).catchall(z.json().optional()));
export function captureHistory(value: unknown) { return checked(captureAnalysisSchema, value ?? []); }
export function captureInput(value: unknown): Record<string, unknown> { return isRecord(value) ? value : {}; }
export function captureSnapshot(value: unknown) {
  return checked(z.object({ fromAccountId: text, amount: text, date: text,
    correction: z.object({ kind: z.string(), toAccountId: text, cycleId: text }).catchall(z.json().optional()).optional(),
  }).catchall(z.json().optional()), value);
}
export function captureStatementMatches(value: unknown) {
  return checked(z.record(z.string(), z.object({ fingerprint: z.string(), confirmedAt: z.string() }).catchall(z.json().optional())), value ?? {});
}
export function captureStatementOperations(value: unknown) {
  return checked(z.record(z.string(), z.object({ request: z.string(), expenseId: z.string() }).catchall(z.json().optional())), value ?? {});
}
export function captureReportedState(value: unknown) {
  return checked(z.object({ deliveryPaused: z.boolean().optional(), notificationAccess: z.boolean().optional(), selectedPackages: z.array(z.string()).optional() }).catchall(z.json().optional()), value ?? {});
}
export function serializedCapture(value: unknown) { return z.record(z.string(), z.json()).parse(JSON.parse(JSON.stringify(value))); }

export function captureFieldsArray(value: unknown) { return checked(z.array(z.string()), value ?? []); }

export function captureAnalysisInterpretation(value: unknown) {
  return value == null ? null : checked(z.object({ parserKey: text, reason: text, proposal: captureProposalSchema.optional() }).catchall(z.json().optional()), value);
}
