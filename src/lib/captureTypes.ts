import type { CaptureMovement as StoredMovement } from '@prisma/client';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { z } from 'zod';
import type { captureProposalSchema } from './captureJson';
import type { correctionSchema } from './captureReview';

export type CaptureDb = PrismaClient | Prisma.TransactionClient;
export type CaptureProposal = z.output<typeof captureProposalSchema>;
export type CaptureInterpretation = {
  parserKey?: string | null;
  verified?: boolean;
  reason: string;
  proposal: CaptureProposal;
  status?: string;
}
export interface CaptureParser {
  key: string; sourcePackage: string; verified: boolean; title?: string;
  evidence?: string; incomeOnly?: boolean; moneyOnly?: boolean; refundOnly?: boolean; paymentOnly?: boolean;
  aliasKinds?: string[]; aliasSourcePackage?: string; dateSource?: string;
  aliasSourcePackages?: string[];
  completionPolicy?: string; policyRequiresSubscription?: boolean;
  rejectCrossBankAliasCollision?: boolean; evidenceOnly?: boolean; nonBlockingInObservation?: boolean;
}
export interface CaptureNotice {
  sourcePackage: string; fields: unknown; postedAt: Date | string; receivedAt: Date | string;
}
export interface CaptureCredential { id: string; secretHash: string }
export interface CaptureEventV1 {
  contractVersion: 1; eventId: string; sourcePackage: string; notificationKeyHash: string;
  postedAt: string; receivedAt: string; fields: Record<string, string>;
}
export type ParseAmount = (value: unknown) => string | null;
export type NotificationDate = (event: CaptureNotice) => { date: string; notificationAt: string; dateSource: string; timeZone: string } | null;
export type OperationTime = (value: string | undefined) => { operationAt: string; date: string; timeZone: string } | null;
export type CaptureDeviceState = 'PENDING' | 'EXPIRED' | 'ACTIVE' | 'PAUSED' | 'REVOKED';
export type CaptureResolution = { id: string } & (
  | { action: 'matchPayable' }
  | { action: 'confirmIncome'; income: { amount: string; expectedUpdatedAt: string; confirmedReceived: true } }
  | { action: 'registerIncome' | 'linkIncome'; income: { accountId: string; incomeTypeId: string; amount: string; date: string; concept: string; currency: 'MXN'; confirmedReceived: true; incomeId?: string; distinct?: boolean } }
  | { action: 'link'; expenseId: string }
  | { action: 'linkInstallment'; installmentPurchaseId: string }
  | { action: 'convertToInstallments'; months: number }
  | { action: 'correct'; correction: z.input<typeof correctionSchema>; expectedCorrection: string }
  | { action: 'registerPayment' | 'linkPayment'; payment: { cycleId: string; amount: string; date: string; currency: 'MXN'; confirmedApplied: true; expectedPaidAmount: string; expectedPaidAt: string | null; statementConcept?: string; distinct?: boolean } }
  | { action: 'applyRefund'; expenseId: string; expectedExpenseUpdatedAt: string; distinctRefund?: boolean }
  | { action: 'registerMoneyTransfer'; money: CaptureMoneyInput & { toAccountId: string } }
  | { action: 'registerMoneyWithdrawal' | 'registerDebitExpense'; money: CaptureMoneyInput }
  | { action: 'correctDebitType'; correction: { kind: 'TRANSFER'; toAccountId: string } | { kind: 'WITHDRAWAL' } | { kind: 'CARD_PAYMENT'; cycleId: string } }
  | { action: 'register' | 'distinct' | 'discard' | 'reinterpret' | 'validateWalletBackup' | 'reversePayment' | 'reverseRefund' }
);
export type Movement = StoredMovement;

export interface CaptureKindInput { parserKey?: string | null; proposal: unknown }
export interface CapturePeriod { cardId: string; startDate: string; endDate: string }
export interface PilotRecord { id: string; type: string; matched: boolean }

export interface CaptureMoneyInput { fromAccountId: string; toAccountId?: string; amount: string; date: string; concept: string; currency: 'MXN'; categoryId?: string; payableAccountId?: string; distinct?: boolean }
