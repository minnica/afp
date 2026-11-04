import type { CaptureEvent, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { correctDebitCapture } from './captureDebitCorrections';
import { captureProposal, captureSnapshot } from './captureJson';
import { interpretCapture } from './captureParsers';
import { captureHash } from './captureProtocol';
import type { Movement } from './captureTypes';
import { cents } from './money/balance';
import { day, todayInMexico } from './money/dates';

const incomingKey = 'nu.account-received.es.v1', debitKey = 'bbva.account-charge.es.v1';
const windowMs = 5 * 60_000;
function sourceKey(event: CaptureEvent) {
  return captureHash(JSON.stringify([event.deviceId, event.sourcePackage, event.notificationKeyHash, event.postedAt.toISOString(), event.fields]));
}

// Called only for a newly received notice, under the owner's financial lock.
// The accepted rule is necessary: neither notice identifies the other account.
export async function automateTransferPair(tx: Prisma.TransactionClient, event: CaptureEvent, movement: Movement): Promise<Movement | null> {
  if (![incomingKey, debitKey].includes(movement.parserKey || '')) return null;
  const policy = await tx.captureMoneyPolicy.findUnique({ where: { userId_kind_destinationLabel: { userId: movement.userId, kind: 'BBVA_NU_TRANSFER', destinationLabel: '' } } });
  if (!policy || policy.mode !== 'AUTOMATIC' || policy.currency !== 'MXN' || policy.datePolicy !== 'NOTIFICATION_POSTED_AT' || event.postedAt < policy.acceptedAt) return null;
  const original = interpretCapture(event), p = original.proposal;
  if (!['TRANSFER_PAIR_REQUIRED', 'ACCOUNT_DEBIT_REVIEW'].includes(original.reason) || !p.amount || !p.date) return null;
  if (movement.parserKey === debitKey && !policy.accountSuffixes.includes(p.accountSuffix || '')) return null;
  const markReview = (reason: string) => tx.captureMovement.update({ where: { id: movement.id }, data: { reason } });
  const prior = await tx.captureMoneyPosting.findUnique({ where: { userId_sourceKey: { userId: movement.userId, sourceKey: sourceKey(event) } } });
  if (prior) {
    await tx.captureMovement.update({ where: { id: movement.id }, data: { status: 'DISCARDED', reason: 'MONEY_REPEATED_NOTICE', resolvedAt: new Date() } });
    return tx.captureMovement.findUnique({ where: { id: prior.movementId } });
  }
  // Search twice the window so uniqueness is checked from both ends, including
  // competing debits just outside the incoming notice's first search window.
  const nearby = await tx.captureMovement.findMany({ where: { userId: movement.userId, amount: p.amount,
    parserKey: { in: [incomingKey, debitKey] }, events: { some: { postedAt: {
      gte: new Date(event.postedAt.getTime() - 2 * windowMs), lte: new Date(event.postedAt.getTime() + 2 * windowMs),
    } } } }, include: { events: true, moneyPosting: { include: { expense: true } } }, take: 101 });
  if (nearby.length > 100) return markReview('TRANSFER_PAIR_AMBIGUOUS');
  const proofs = nearby.flatMap(row => {
    if (row.events.length !== 1) return [];
    const notice = row.events[0]!, decoded = interpretCapture(notice), proposal = decoded.proposal;
    if (notice.postedAt < policy.acceptedAt || decoded.parserKey !== row.parserKey || !proposal.amount || !proposal.date || cents(proposal.amount) !== cents(p.amount)) return [];
    if (decoded.parserKey === debitKey && (decoded.reason !== 'ACCOUNT_DEBIT_REVIEW' || !policy.accountSuffixes.includes(proposal.accountSuffix || ''))) return [];
    if (decoded.parserKey === incomingKey && decoded.reason !== 'TRANSFER_PAIR_REQUIRED') return [];
    return [{ row, notice, proposal }];
  });
  const current = proofs.find(proof => proof.row.id === movement.id);
  if (!current) return markReview('TRANSFER_PAIR_PROTECTED');
  const compatible = (a: typeof current, b: typeof current) => a.row.parserKey !== b.row.parserKey
    && Math.abs(a.notice.postedAt.getTime() - b.notice.postedAt.getTime()) <= windowMs
    && (!a.proposal.operationAt || Math.abs(Date.parse(a.proposal.operationAt) - b.notice.postedAt.getTime()) <= windowMs)
    && (!b.proposal.operationAt || Math.abs(Date.parse(b.proposal.operationAt) - a.notice.postedAt.getTime()) <= windowMs);
  const matches = proofs.filter(proof => compatible(current, proof));
  if (!matches.length) return movement.parserKey === incomingKey ? markReview('TRANSFER_PAIR_WAITING') : null;
  const match = matches[0]!;
  if (matches.length !== 1 || proofs.filter(proof => compatible(match, proof)).length !== 1) return markReview('TRANSFER_PAIR_AMBIGUOUS');
  const debit = current.row.parserKey === debitKey ? current : match, incoming = current.row.parserKey === incomingKey ? current : match;
  const from = await tx.moneyAccount.findFirst({ where: { userId: movement.userId, id: policy.fromAccountId, kind: 'BANK' } });
  const to = policy.toAccountId && await tx.moneyAccount.findFirst({ where: { userId: movement.userId, id: policy.toAccountId, kind: { in: ['BANK', 'SAVINGS'] } } });
  const date = debit.proposal.date!;
  if (!from || !to || from.id === to.id) return markReview('MONEY_ACCOUNT_REQUIRED');
  if (date > todayInMexico() || incoming.proposal.date! > todayInMexico()) return markReview('MONEY_FUTURE');
  if (date < day(from.asOf) || date < day(to.asOf)) return markReview('MONEY_BEFORE_REFERENCE');
  const pending = (row: Movement) => ['REVIEW', 'OBSERVED'].includes(row.status) && !row.correction && !row.expenseId && !row.originalExpenseId && !row.installmentPurchaseId;
  if (!pending(incoming.row) || incoming.row.moneyPosting || debit.row.correction || debit.row.installmentPurchaseId) return markReview('TRANSFER_PAIR_PROTECTED');
  const posting = debit.row.moneyPosting, snapshot = posting && captureSnapshot(posting.snapshot), expense = posting?.expense;
  if (posting) {
    // Convert only the untouched generic expense created by the debit rule.
    // Personal classifications, edits, reconciliations and deleted records win.
    const category = expense && await tx.category.findFirst({ where: { id: expense.categoryId, userId: movement.userId, name: 'Por clasificar' } });
    if (debit.row.status !== 'REGISTERED' || debit.row.reason !== 'BBVA_DEBIT_AUTOMATIC' || posting.kind !== 'DEBIT_EXPENSE' || snapshot?.automatic !== true || snapshot.correction
      || !expense || !category || expense.concept !== snapshot.concept || expense.debitAccountId !== from.id
      || cents(expense.amount) !== cents(p.amount) || day(expense.date) !== date
      || expense.notes || expense.reconciledAt || expense.refundOriginalAmount != null || expense.subscriptionId || expense.receivableAccountId
      || expense.payableAccountId || expense.personId || Number(expense.cashContributionAmount)) return markReview('TRANSFER_PAIR_PROTECTED');
  } else if (!pending(debit.row)) return markReview('TRANSFER_PAIR_PROTECTED');
  const dateMs = Date.parse(`${date}T00:00:00Z`), range = { gte: new Date(dateMs - 86400000), lte: new Date(dateMs + 2 * 86400000 - 1) };
  const common = { userId: movement.userId, amount: p.amount, date: range };
  const blockers = await Promise.all([
    tx.moneyTransfer.count({ where: { ...common, fromAccountId: from.id, toAccountId: to.id } }),
    // Income routing is configurable; any nearby matching income needs review
    // rather than assuming it belongs to a different account.
    tx.income.count({ where: common }),
    tx.dailyExpense.count({ where: { ...common, debitAccountId: from.id, ...(expense ? { id: { not: expense.id } } : {}) } }),
    tx.moneyWithdrawal.count({ where: { ...common, accountId: from.id } }),
    tx.moneyCardPayment.count({ where: { ...common, accountId: from.id } }),
  ]);
  if (blockers.some(Boolean)) return markReview('MONEY_POSSIBLE_DUPLICATE');
  const evidence = { policyId: policy.id, acceptedAt: policy.acceptedAt.toISOString(), matchedBy: 'EXACT_AMOUNT_AND_FIVE_MINUTE_WINDOW',
    debitMovementId: debit.row.id, incomingMovementId: incoming.row.id, debitEventId: debit.notice.id, incomingEventId: incoming.notice.id };
  let transferId: string;
  if (posting) {
    await correctDebitCapture(tx, debit.row, { correction: { kind: 'TRANSFER', toAccountId: to.id } });
    const corrected = await tx.captureMoneyPosting.findUniqueOrThrow({ where: { id: posting.id } });
    transferId = corrected.transferId!;
    await tx.captureMoneyPosting.update({ where: { id: posting.id }, data: { snapshot: { ...captureSnapshot(corrected.snapshot), transferPair: evidence } } });
  } else {
    const transfer = await tx.moneyTransfer.create({ data: { userId: movement.userId, fromAccountId: from.id, toAccountId: to.id,
      amount: p.amount, date: new Date(`${date}T12:00:00Z`), concept: 'Transferencia entre mis cuentas' } });
    transferId = transfer.id;
    await tx.captureMoneyPosting.create({ data: { id: randomUUID(), userId: movement.userId, movementId: debit.row.id, sourceKey: sourceKey(debit.notice),
      kind: 'TRANSFER', transferId, originalRecordId: transferId, snapshot: { fromAccountId: from.id, toAccountId: to.id, fromName: from.name, toName: to.name,
        amount: p.amount, date, kind: 'TRANSFER', automatic: true, transferPair: evidence } } });
  }
  await tx.captureMoneyPosting.create({ data: { id: randomUUID(), userId: movement.userId, movementId: incoming.row.id, sourceKey: sourceKey(incoming.notice),
    kind: 'TRANSFER', transferId, originalRecordId: transferId, snapshot: { fromAccountId: from.id, toAccountId: to.id, fromName: from.name, toName: to.name,
      amount: p.amount, date, kind: 'TRANSFER', automatic: true, transferPair: evidence } } });
  for (const proof of [debit, incoming]) await tx.captureMovement.update({ where: { id: proof.row.id }, data: {
    status: 'REGISTERED', reason: 'TRANSFER_PAIR_REGISTERED', resolvedAt: new Date(), expenseId: null,
    proposal: { ...captureProposal(proof.row.proposal), fromAccountId: from.id, toAccountId: to.id, moneyKind: 'TRANSFER', currency: 'MXN', transferPair: evidence },
  } });
  return tx.captureMovement.findUniqueOrThrow({ where: { id: movement.id } });
}
