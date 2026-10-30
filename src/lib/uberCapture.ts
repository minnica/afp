import type { CaptureEvent, CaptureMovement, DailyExpense, Prisma } from '@prisma/client';
import { captureProposal } from './captureJson';
import { uberReceiptParserKey } from './gmailUberReceipts';
import { bankCapturePackages } from './captureSourcePolicy';

const bankSources = [...bankCapturePackages, 'com.google.android.apps.walletnfcrel'];
const uberMerchant = (value: string | null | undefined) => /(?:^|[^A-Z])UBER(?:[^A-Z]|$)/i.test(value || '');
const cents = (amount: string) => Math.round(Number(amount) * 100);
const eligible = (expense: DailyExpense) => expense.reconciliationStatus === 'PENDING' && !expense.reconciledAt
  && !expense.refundOriginalAmount && !expense.subscriptionId && !expense.personId && !expense.receivableAccountId
  && !expense.payableAccountId && Number(expense.cashContributionAmount) === 0;

export async function rememberUberExpense(tx: Prisma.TransactionClient, movement: CaptureMovement) {
  const proposal = captureProposal(movement.proposal);
  if (!movement.expenseId) return movement;
  if (movement.parserKey !== uberReceiptParserKey && (movement.reason !== 'AUTOMATIC' || !uberMerchant(proposal.merchant))) return movement;
  const expense = await tx.dailyExpense.findFirst({ where: { id: movement.expenseId, userId: movement.userId } });
  if (!expense) return movement;
  return tx.captureMovement.update({ where: { id: movement.id }, data: { proposal: {
    ...proposal, expenseVersion: expense.updatedAt.toISOString(),
    ...(proposal.uberReceipt ? { uberReceipt: { ...proposal.uberReceipt, expenseVersion: expense.updatedAt.toISOString() } } : {}),
  } } });
}

// Called under the owner's financial lock, only after both format and mode checks.
// Only an unedited automatic expense can be changed. Original events are immutable.
export async function settleUberCapture(tx: Prisma.TransactionClient, event: CaptureEvent, movement: CaptureMovement): Promise<CaptureMovement | null> {
  const p = captureProposal(movement.proposal);
  const receipt = p.uberReceipt;
  if (!p.cardId || !p.amount || !p.date || p.currency !== 'MXN') return null;
  const review = () => tx.captureMovement.update({ where: { id: movement.id }, data: { status: 'REVIEW', reason: 'UBER_RECEIPT_CHANGED' } });
  const link = async (expense: DailyExpense, reason: string) => {
    const linked = await tx.captureMovement.update({ where: { id: movement.id }, data: {
      status: 'LINKED', reason, expenseId: expense.id, originalExpenseId: expense.id, resolvedAt: new Date(),
    } });
    return rememberUberExpense(tx, linked);
  };

  if (movement.parserKey === uberReceiptParserKey && receipt) {
    const previous = await tx.captureMovement.findMany({ where: { userId: movement.userId, cardId: p.cardId,
      parserKey: uberReceiptParserKey, id: { not: movement.id },
      proposal: { path: ['uberReceipt', 'tripAt'], equals: receipt.tripAt }, originalExpenseId: { not: null },
      reason: { not: 'UBER_RECEIPT_OLDER' },
    }, orderBy: { createdAt: 'desc' } });
    if (previous.length) {
      const ids = new Set(previous.map(row => row.originalExpenseId));
      if (ids.size !== 1 || previous.some(row => !row.expenseId || row.correction)) return review();
      const prior = previous[0]!, old = captureProposal(prior.proposal), expense = await tx.dailyExpense.findFirst({
        where: { id: prior.expenseId!, userId: movement.userId, cardId: p.cardId },
      });
      if (!expense || !eligible(expense) || old.uberReceipt?.expenseVersion !== expense.updatedAt.toISOString()) return review();
      const current = cents(expense.amount.toString()), next = cents(p.amount);
      if (current === next) return link(expense, 'UBER_RECEIPT_LINKED');
      const oldTip = old.uberReceipt?.tipAmount ? cents(old.uberReceipt.tipAmount) : 0;
      const newTip = receipt.tipAmount ? cents(receipt.tipAmount) : 0;
      if (!receipt.updated && old.uberReceipt?.updated && current - oldTip === next) return link(expense, 'UBER_RECEIPT_OLDER');
      if (!receipt.updated || !receipt.tipAmount || next <= current || next - newTip !== current - oldTip) return review();
      const version = new Date(Math.max(Date.now(), expense.updatedAt.getTime() + 1));
      const changed = await tx.dailyExpense.updateMany({ where: { id: expense.id, userId: movement.userId, updatedAt: expense.updatedAt },
        data: { amount: p.amount, updatedAt: version } });
      if (changed.count !== 1) return review();
      return link({ ...expense, updatedAt: version }, 'UBER_RECEIPT_UPDATED');
    }

    const start = new Date(`${p.date}T00:00:00Z`), end = new Date(start.getTime() + 3 * 86400000);
    const candidates = await tx.dailyExpense.findMany({ where: { userId: movement.userId, cardId: p.cardId,
      amount: p.amount, date: { gte: start, lt: end }, paymentMethod: 'CARD',
    }, include: { captureMovements: { include: { events: true } } } });
    const plausible = candidates.filter(expense => uberMerchant(expense.concept)
      || expense.captureMovements.some(row => uberMerchant(captureProposal(row.proposal).merchant)));
    if (plausible.length > 1) return review();
    const matches = plausible.filter(expense => eligible(expense)
      && expense.captureMovements.every(row => !row.correction)
      && expense.captureMovements.some(row => {
        const bank = captureProposal(row.proposal);
        const time = new Date(bank.operationAt || bank.notificationAt || '').getTime(), trip = new Date(receipt.tripAt).getTime();
        return bankSources.includes(row.events[0]?.sourcePackage || '') && uberMerchant(bank.merchant)
          && row.status === 'REGISTERED' && row.reason === 'AUTOMATIC'
          && bank.expenseVersion === expense.updatedAt.toISOString()
          && time >= trip && time - trip <= 48 * 3600000
          && (bank.dateSource === 'NOTIFICATION_POSTED_AT' || bank.date === p.date);
      }));
    if (matches.length > 1) return review();
    if (matches[0]) {
      const expense = matches[0], date = new Date(`${p.date}T12:00:00Z`);
      const version = new Date(Math.max(Date.now(), expense.updatedAt.getTime() + 1));
      const changed = await tx.dailyExpense.updateMany({ where: { id: expense.id, userId: movement.userId, updatedAt: expense.updatedAt },
        data: { date, updatedAt: version } });
      if (changed.count !== 1) return review();
      return link({ ...expense, date, updatedAt: version }, 'UBER_RECEIPT_LINKED');
    }
    return plausible.length ? review() : null;
  }

  if (!bankSources.includes(event.sourcePackage) || !uberMerchant(p.merchant)) return null;
  const policy = await tx.captureAutomation.findUnique({ where: { userId_cardId_parserKey: {
    userId: movement.userId, cardId: p.cardId, parserKey: uberReceiptParserKey,
  } } });
  if (policy?.mode !== 'AUTOMATIC' || policy.datePolicy !== 'RECEIPT_OPERATION') return null;
  const time = new Date(p.operationAt || p.notificationAt || '').getTime();
  if (!Number.isFinite(time)) return null;
  const rows = await tx.captureMovement.findMany({ where: { userId: movement.userId, cardId: p.cardId,
    parserKey: uberReceiptParserKey, status: { in: ['REGISTERED', 'LINKED'] }, expenseId: { not: null },
    operationDate: { gte: new Date(time - 3 * 86400000), lte: new Date(time + 86400000) },
  }, include: { expense: true }, orderBy: { createdAt: 'desc' } });
  const matches = rows.filter(row => {
    const r = captureProposal(row.proposal), trip = new Date(r.uberReceipt?.tripAt || '').getTime();
    if (row.correction || !row.expense || !eligible(row.expense) || r.uberReceipt?.expenseVersion !== row.expense.updatedAt.toISOString()
      || !r.amount || time < trip || time - trip > 48 * 3600000) return false;
    const total = cents(r.amount), tip = r.uberReceipt?.tipAmount ? cents(r.uberReceipt.tipAmount) : 0;
    return [total, ...(tip ? [total - tip, tip] : [])].includes(cents(p.amount!));
  });
  if (new Set(matches.map(row => row.expenseId)).size > 1) return review();
  if (!matches[0]?.expense) return null;
  const expense = matches[0].expense;
  const covered = await tx.captureMovement.findMany({ where: { userId: movement.userId, expenseId: expense.id,
    parserKey: { not: uberReceiptParserKey }, status: { in: ['REGISTERED', 'LINKED'] },
    events: { some: { sourcePackage: event.sourcePackage } },
  }, select: { amount: true } });
  const coveredCents = covered.reduce((sum, row) => sum + cents(row.amount?.toString() || '0'), 0);
  if (coveredCents + cents(p.amount) > cents(expense.amount.toString())) {
    return tx.captureMovement.update({ where: { id: movement.id }, data: { status: 'REVIEW', reason: 'POSSIBLE_DUPLICATE' } });
  }
  return link(expense, 'UBER_BANK_LINKED');
}
