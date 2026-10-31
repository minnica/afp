import type { CaptureDb, Movement } from './captureTypes';
import type { Prisma } from '@prisma/client';
import { ApiAccessError } from './apiAuth';
import { getDebtAccountState } from './calculations/debtAccounts';
import { captureProposal, captureSnapshot, captureHistory } from './captureJson';
import { captureAmount, captureNotificationDate, captureOperationTime } from './captureParsers';
import { accountDebitNotice, interpretBbvaAccountCharge } from './captureMoneyParsers';
import { day } from './money/dates';
import { cents } from './money/sources';
import { readBaseline } from './money/persisted';
import { refreshDebtAccount } from './debtAccountService';

// A date/amount match is an explicitly chosen policy, not a bank reference.
// Payroll loans require capital/interest evidence and never use this matcher.
export async function payableCaptureCandidates(db: CaptureDb, userId: string, accountId: string, amount: string, date: string) {
  const start = new Date(`${date}T00:00:00Z`), end = new Date(start.getTime() + 86400000);
  const rows = await db.payableAccount.findMany({ where: { userId, accountType: 'SIMPLE', status: 'ACTIVE', expectedDate: { gte: start, lt: end }, originDate: { lt: end } }, include: { dailyExpenses: { select: { amount: true, loanPrincipalAmount: true } } }, orderBy: { id: 'asc' } });
  // A generic cash-expense default does not override an observed bank debit.
  // Respect only an explicit route or exclusion for this particular debt.
  const routes = await db.moneyRoute.findMany({ where: { userId, key: { in: rows.map(p => `payable:${p.id}`) } } });
  return rows.flatMap(p => {
    const route = routes.find(r => r.key === `payable:${p.id}`);
    if (route?.excluded || (route?.accountId && route.accountId !== accountId)) return [];
    const state = getDebtAccountState(p, p.dailyExpenses);
    if (state.status !== 'ACTIVE' || cents(state.pendingBalance) <= 0 || cents(state.pendingBalance) !== cents(amount)) return [];
    return [{ id: p.id, concept: p.concept, expectedDate: date, pendingAmount: (cents(state.pendingBalance) / 100).toFixed(2) }];
  });
}

// Historical evidence is read with today's parser solely for comparison. The
// event and its initial interpretation are never rewritten.
export function bbvaDebitEvidence(event: Parameters<typeof interpretBbvaAccountCharge>[0]) {
  const decoded = interpretBbvaAccountCharge(event, captureAmount, captureNotificationDate, captureOperationTime);
  return decoded?.reason === 'ACCOUNT_DEBIT_REVIEW' ? decoded.proposal : null;
}

export async function inspectCapturedPayable(db: CaptureDb, movement: Movement) {
  if (!accountDebitNotice(movement)) throw new ApiAccessError('Este aviso no corresponde a un cargo BBVA de cuenta.', 409);
  const posting = await db.captureMoneyPosting.findFirst({ where: { userId: movement.userId, movementId: movement.id }, include: { expense: true } });
  const expense = posting?.expense;
  if (!expense || posting.kind !== 'DEBIT_EXPENSE' || movement.status !== 'REGISTERED') throw new ApiAccessError('Falta un gasto con débito registrado para vincular.', 409);
  if (expense.payableAccountId) return { posting, expense, alreadyLinked: true, proposal: captureProposal(movement.proposal), candidates: [] };
  const snapshot = captureSnapshot(posting.snapshot);
  if (expense.userId !== movement.userId || expense.paymentMethod !== 'DEBIT' || expense.debitAccountId !== snapshot.fromAccountId
    || cents(expense.amount) !== cents(snapshot.amount) || day(expense.date) !== snapshot.date || expense.concept !== 'Cargo BBVA'
    || expense.updatedAt.getTime() !== expense.createdAt.getTime() || expense.refundOriginalAmount != null || expense.receivableAccountId
    || expense.subscriptionId || expense.personId || expense.reconciledAt || cents(expense.cashContributionAmount) || movement.correction || snapshot.correction) throw new ApiAccessError('El gasto cambió o tiene otros vínculos. Conserva sus datos y revísalo manualmente.', 409);
  const account = await db.moneyAccount.findFirst({ where: { id: expense.debitAccountId!, userId: movement.userId } });
  const events = await db.captureEvent.findMany({ where: { userId: movement.userId, movementId: movement.id } });
  const proposal = events.length === 1 ? bbvaDebitEvidence(events[0]!) : null;
  if (!proposal?.amount || !proposal.date || cents(proposal.amount) !== cents(expense.amount) || !account
    || proposal.date < day(account.asOf) || day(expense.date) < day(account.asOf) || readBaseline(account.baseline)[`expense:${expense.id}`]) throw new ApiAccessError('La evidencia o el saldo de referencia requieren revisión antes de vincular.', 409);
  const candidates = await payableCaptureCandidates(db, movement.userId, account.id, proposal.amount, proposal.date);
  return { posting, expense, alreadyLinked: false, proposal, candidates };
}

// Called under the owner's financial lock. Reuse the existing expense and its
// account: linking a payable is never another withdrawal.
export async function matchCapturedPayable(tx: Prisma.TransactionClient, movement: Movement) {
  const state = await inspectCapturedPayable(tx, movement);
  if (state.alreadyLinked || !state.candidates.length) return movement;
  if (state.candidates.length !== 1) throw new ApiAccessError('Hay varias cuentas por pagar con esa fecha e importe. Revisa cuál corresponde.', 409);
  const match = state.candidates[0]!, history = captureHistory(movement.analysisHistory);
  if (history.length >= 50) throw new ApiAccessError('El historial de este aviso requiere revisión manual.', 409);
  const previous = captureProposal(movement.proposal);
  const proposal = { ...previous, ...state.proposal, currency: 'MXN', moneyKind: 'DEBIT_EXPENSE', fromAccountId: state.expense.debitAccountId,
    payableAccountId: match.id, merchant: `Pago · ${match.concept}`, payableMatch: { ...match, matchedBy: 'EXACT_DATE_AND_PENDING_AMOUNT', source: 'USER_ACCEPTED_POLICY' } };
  await tx.dailyExpense.update({ where: { id: state.expense.id }, data: { payableAccountId: match.id, concept: proposal.merchant, date: new Date(`${state.proposal.date}T12:00:00Z`) } });
  await refreshDebtAccount(tx, movement.userId, 'payable', match.id);
  await tx.captureMoneyPosting.update({ where: { id: state.posting.id }, data: { snapshot: { ...captureSnapshot(state.posting.snapshot), payableMatch: proposal.payableMatch,
    payableAccountId: match.id, originalDate: day(state.expense.date), date: state.proposal.date, operationAt: state.proposal.operationAt || null } } });
  return tx.captureMovement.update({ where: { id: movement.id }, data: { reason: 'BBVA_PAYABLE_MATCHED', proposal, operationDate: new Date(`${state.proposal.date}T12:00:00Z`),
    analysisHistory: [...history, { validation: 'PAYABLE_DATE_AMOUNT_MATCH', analyzedAt: new Date().toISOString(), previous: { reason: movement.reason, proposal: previous }, interpretation: { parserKey: movement.parserKey, reason: 'BBVA_PAYABLE_MATCHED', proposal } }] } });
}
