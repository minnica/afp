import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { ApiAccessError } from '@/lib/apiAuth';
import { captureHash } from '@/lib/captureProtocol';
import { captureAmount, captureDate } from '@/lib/captureReview';
import { createExpenseInTransaction } from '@/lib/expenseService';
import { moneyCaptureKind, accountDebitNotice } from '@/lib/captureMoneyParsers';
import { day, todayInMexico } from '@/lib/money/dates';

const text = z.string().trim().min(1).max(160);
const inputSchema = z.object({ fromAccountId: text, toAccountId: text.optional(), amount: captureAmount, date: captureDate, concept: text, categoryId: text.optional(), currency: z.literal('MXN'), distinct: z.boolean().default(false) }).strict();
export const moneyPolicySchema = z.object({ action: z.literal('moneyPolicy'), kind: z.enum(['NU_TRANSFER', 'BBVA_WITHDRAWAL', 'BBVA_DEBIT']), fromAccountId: text, toAccountId: text.nullable().optional(), destinationLabel: z.string().trim().max(160).default(''), accountLast4: z.string().regex(/^\d{4}$/).nullable().optional(), accountSuffixes: z.array(z.string().regex(/^\d{4,5}$/)).max(10).default([]), treatAsExpense: z.literal(true).optional(), currency: z.literal('MXN'), datePolicy: z.literal('NOTIFICATION_POSTED_AT'), mode: z.enum(['OBSERVATION', 'AUTOMATIC']), verifiedMovementId: z.string().uuid().nullable().optional() }).strict();

async function ownedAccount(tx, userId, id) {
  const row = typeof id === 'string' && await tx.moneyAccount.findFirst({ where: { id, userId } });
  if (!row) throw new ApiAccessError('Cuenta no encontrada.', 404);
  return row;
}
export async function configureMoneyCapture(tx, userId, input) {
  const parsed = moneyPolicySchema.safeParse(input); if (!parsed.success) throw new ApiAccessError('Revisa las cuentas y la regla de movimientos.', 400);
  const { action: _action, treatAsExpense, ...values } = parsed.data;
  await ownedAccount(tx, userId, values.fromAccountId);
  if (values.kind === 'NU_TRANSFER') {
    if (!values.destinationLabel || !values.toAccountId || values.toAccountId === values.fromAccountId || values.accountLast4) throw new ApiAccessError('Indica el destino exacto del aviso y dos cuentas distintas.', 400);
    await ownedAccount(tx, userId, values.toAccountId);
  } else if (values.kind === 'BBVA_DEBIT') {
    if (values.toAccountId || values.accountLast4 || values.destinationLabel || !values.accountSuffixes.length || !treatAsExpense) throw new ApiAccessError('Confirma que estos cargos se registren como gastos y las terminaciones de la cuenta.', 400);
    const from = await ownedAccount(tx, userId, values.fromAccountId);
    if (from.kind !== 'BANK') throw new ApiAccessError('Selecciona la cuenta bancaria de salida.', 400);
    values.accountSuffixes = [...new Set(values.accountSuffixes)];
  } else {
    if (values.toAccountId || !values.accountLast4 || values.destinationLabel) throw new ApiAccessError('Indica la cuenta de salida y sus cuatro cifras.', 400);
    if (values.mode === 'AUTOMATIC') {
      const sample = values.verifiedMovementId && await tx.captureMovement.findFirst({ where: { id: values.verifiedMovementId, userId }, include: { moneyPosting: { include: { withdrawal: true } } } });
      if (!sample || sample.parserKey !== 'bbva.atm-withdrawal.es.v1' || sample.proposal.accountLast4 !== values.accountLast4 || (sample.moneyPosting?.kind !== 'WITHDRAWAL' || sample.moneyPosting.withdrawal?.reversedAt) || sample.moneyPosting.snapshot.fromAccountId !== values.fromAccountId || sample.correction) throw new ApiAccessError('Primero revisa y registra un aviso real de retiro de esta cuenta. El cargo genérico no lo sustituye.', 409);
    }
  }
  if (values.kind !== 'BBVA_DEBIT' && values.accountSuffixes.length) throw new ApiAccessError('Estas terminaciones solo corresponden a cargos BBVA.', 400);
  const identity = { userId, kind: values.kind, destinationLabel: values.destinationLabel };
  return tx.captureMoneyPolicy.upsert({ where: { userId_kind_destinationLabel: identity }, create: { ...values, userId, acceptedAt: new Date() }, update: { ...values, acceptedAt: new Date() } });
}
export async function completeMoneyCapture(tx, event, decoded, observationOnly = false) {
  const p = decoded.proposal;
  const debit = accountDebitNotice(decoded);
  if (!moneyCaptureKind(decoded) && !debit) return null;
  if (!p.amount || !p.date || !['MONEY_POLICY_REQUIRED', 'WITHDRAWAL_SAMPLE_REQUIRED', 'ACCOUNT_DEBIT_REVIEW'].includes(decoded.reason)) return { ...decoded, status: 'REVIEW' };
  const kind = debit ? 'BBVA_DEBIT' : p.movementType === 'MONEY_TRANSFER' ? 'NU_TRANSFER' : 'BBVA_WITHDRAWAL';
  const policy = await tx.captureMoneyPolicy.findUnique({ where: { userId_kind_destinationLabel: { userId: event.userId, kind, destinationLabel: kind === 'NU_TRANSFER' ? p.destinationLabel : '' } } });
  if (!policy || (debit && !policy.accountSuffixes.includes(p.accountSuffix)) || (kind === 'BBVA_WITHDRAWAL' && policy.accountLast4 !== p.accountLast4)) return { ...decoded, status: 'REVIEW' };
  const from = await tx.moneyAccount.findFirst({ where: { id: policy.fromAccountId, userId: event.userId } });
  const to = policy.toAccountId && await tx.moneyAccount.findFirst({ where: { id: policy.toAccountId, userId: event.userId } });
  const automatic = !observationOnly && policy.mode === 'AUTOMATIC' && policy.acceptedAt && policy.currency === 'MXN' && policy.datePolicy === 'NOTIFICATION_POSTED_AT' && (kind !== 'BBVA_WITHDRAWAL' || policy.verifiedMovementId);
  const reason = p.date > todayInMexico() ? 'MONEY_FUTURE' : !from || (kind === 'NU_TRANSFER' && !to) ? 'MONEY_ACCOUNT_REQUIRED' : p.date < day(from.asOf) || (to && p.date < day(to.asOf)) ? 'MONEY_BEFORE_REFERENCE' : automatic ? 'MONEY_READY' : 'MONEY_OBSERVATION';
  return { ...decoded, status: 'REVIEW', reason, proposal: { ...p, currency: 'MXN', fromAccountId: policy.fromAccountId, toAccountId: policy.toAccountId, moneyPolicyId: policy.id } };
}

function sourceKey(event) { return captureHash(JSON.stringify([event.deviceId, event.sourcePackage, event.notificationKeyHash, new Date(event.postedAt).toISOString(), event.fields])); }
async function sameSourcePosting(tx, movement, event) {
  return tx.captureMoneyPosting.findUnique({ where: { userId_sourceKey: { userId: movement.userId, sourceKey: sourceKey(event) } } });
}
async function duplicateCandidates(tx, userId, kind, values) {
  const date = new Date(`${values.date}T00:00:00Z`), window = { gte: new Date(date.getTime() - 86400000), lte: new Date(date.getTime() + 2 * 86400000 - 1) };
  if (kind === 'TRANSFER') return tx.moneyTransfer.findMany({ where: { userId, fromAccountId: values.fromAccountId, toAccountId: values.toAccountId, amount: values.amount, date: window, reversedAt: null }, select: { id: true } });
  if (kind === 'WITHDRAWAL') return tx.moneyWithdrawal.findMany({ where: { userId, accountId: values.fromAccountId, amount: values.amount, date: window, reversedAt: null }, select: { id: true } });
  const expenses = await tx.dailyExpense.findMany({ where: { userId, paymentMethod: 'DEBIT', debitAccountId: values.fromAccountId, amount: values.amount, date: window }, select: { id: true } });
  const withdrawals = await tx.moneyWithdrawal.findMany({ where: { userId, accountId: values.fromAccountId, amount: values.amount, date: window, reversedAt: null }, select: { id: true } });
  const transfers = await tx.moneyTransfer.findMany({ where: { userId, fromAccountId: values.fromAccountId, amount: values.amount, date: window, reversedAt: null }, select: { id: true } });
  const payments = await tx.moneyCardPayment.findMany({ where: { userId, accountId: values.fromAccountId, amount: values.amount, date: window, reversedAt: null }, select: { id: true } });
  return [...expenses, ...withdrawals, ...transfers, ...payments];
}
async function post(tx, movement, kind, input, automatic = false, originEvent = null) {
  const existing = await tx.captureMoneyPosting.findUnique({ where: { movementId: movement.id } });
  if (existing) return movement;
  if (!['REVIEW', 'OBSERVED'].includes(movement.status) || movement.originalExpenseId || movement.expenseId || movement.installmentPurchaseId) throw new ApiAccessError('Este aviso ya está resuelto. Revisa su registro.', 409);
  const parsed = inputSchema.safeParse(input); if (!parsed.success) throw new ApiAccessError('Revisa cuenta, fecha, importe MXN y concepto.', 400);
  const v = parsed.data, p = movement.proposal, userId = movement.userId;
  if (v.date > todayInMexico() || v.date !== p.date || Number(v.amount) !== Number(p.amount)) throw new ApiAccessError('Conserva la fecha y el importe del aviso; los cambios requieren una revisión aparte.', 409);
  const from = await ownedAccount(tx, userId, v.fromAccountId), to = kind === 'TRANSFER' ? await ownedAccount(tx, userId, v.toAccountId) : null;
  if (to?.id === from.id) throw new ApiAccessError('Selecciona cuentas distintas.', 400);
  if (v.date < day(from.asOf) || (to && v.date < day(to.asOf))) throw new ApiAccessError('El aviso es anterior al saldo de referencia. Revisa si ya está incluido antes de registrarlo.', 409);
  const events = originEvent ? [originEvent] : await tx.captureEvent.findMany({ where: { userId, movementId: movement.id }, orderBy: { createdAt: 'asc' } });
  if (events.length !== 1) throw new ApiAccessError('Revisa las evidencias de este aviso antes de registrarlo.', 409);
  const prior = await sameSourcePosting(tx, movement, events[0]);
  if (prior) {
    await tx.captureEvent.update({ where: { id: events[0].id }, data: { movementId: prior.movementId } });
    await tx.captureMovement.update({ where: { id: movement.id }, data: { status: 'DISCARDED', reason: 'MONEY_REPEATED_NOTICE', resolvedAt: new Date() } });
    return tx.captureMovement.findUnique({ where: { id: prior.movementId } });
  }
  if (automatic && kind === 'DEBIT_EXPENSE') {
    const revision = await tx.captureEvent.findFirst({ where: { userId, deviceId: events[0].deviceId, sourcePackage: events[0].sourcePackage,
      notificationKeyHash: events[0].notificationKeyHash, postedAt: events[0].postedAt, id: { not: events[0].id } } });
    if (revision) return tx.captureMovement.update({ where: { id: movement.id }, data: { reason: 'NOTIFICATION_REVISION' } });
  }
  const candidates = await duplicateCandidates(tx, userId, kind, v);
  if (candidates.length && !v.distinct) {
    if (!automatic) throw new ApiAccessError('Hay un movimiento cercano con el mismo importe y cuentas. Confirma que es otro movimiento.', 409);
    return tx.captureMovement.update({ where: { id: movement.id }, data: { reason: 'MONEY_POSSIBLE_DUPLICATE', proposal: { ...p, moneyCandidates: candidates } } });
  }
  let record;
  if (kind === 'TRANSFER') record = await tx.moneyTransfer.create({ data: { userId, fromAccountId: from.id, toAccountId: to.id, amount: v.amount, date: new Date(`${v.date}T12:00:00Z`), concept: v.concept } });
  else if (kind === 'WITHDRAWAL') record = await tx.moneyWithdrawal.create({ data: { userId, accountId: from.id, amount: v.amount, date: new Date(`${v.date}T12:00:00Z`), concept: v.concept } });
  else {
    const category = v.categoryId ? await tx.category.findFirst({ where: { id: v.categoryId, userId } }) : await tx.category.findUnique({ where: { userId_name: { userId, name: 'Por clasificar' } } });
    const categoryId = category?.id || (!v.categoryId && (await tx.category.create({ data: { userId, name: 'Por clasificar' } })).id);
    if (!categoryId) throw new ApiAccessError('Categoría no encontrada.', 404);
    record = (await createExpenseInTransaction(tx, userId, { date: v.date, paymentMethod: 'DEBIT', debitAccountId: from.id, concept: v.concept, amount: v.amount, categoryId }, { id: true }, 'CONFIRMED')).expense;
  }
  await tx.captureMoneyPosting.create({ data: { id: randomUUID(), userId, movementId: movement.id, sourceKey: sourceKey(events[0]), kind,
    transferId: kind === 'TRANSFER' ? record.id : null, withdrawalId: kind === 'WITHDRAWAL' ? record.id : null, expenseId: kind === 'DEBIT_EXPENSE' ? record.id : null,
    originalRecordId: record.id, snapshot: { ...v, kind, automatic, fromName: from.name, toName: to?.name || null, destinationSource: 'USER_POLICY_OR_CONFIRMATION' } } });
  return tx.captureMovement.update({ where: { id: movement.id }, data: { status: 'REGISTERED', reason: automatic && kind === 'DEBIT_EXPENSE' ? 'BBVA_DEBIT_AUTOMATIC' : kind === 'TRANSFER' ? 'MONEY_TRANSFER_REGISTERED' : kind === 'WITHDRAWAL' ? 'MONEY_WITHDRAWAL_REGISTERED' : 'DEBIT_EXPENSE_REGISTERED', resolvedAt: new Date(), proposal: { ...p, moneyKind: kind, fromAccountId: from.id, toAccountId: to?.id || null, currency: 'MXN' }, ...(kind === 'DEBIT_EXPENSE' ? { expenseId: record.id, originalExpenseId: record.id } : {}) } });
}
export async function automateMoneyCapture(tx, event, movement) {
  if (movement.reason !== 'MONEY_READY') return movement;
  const p = movement.proposal;
  const kind = accountDebitNotice(movement) ? 'DEBIT_EXPENSE' : p.movementType === 'MONEY_TRANSFER' ? 'TRANSFER' : 'WITHDRAWAL';
  return post(tx, movement, kind, { fromAccountId: p.fromAccountId, ...(p.toAccountId ? { toAccountId: p.toAccountId } : {}), amount: p.amount, date: p.date, concept: p.merchant, currency: 'MXN' }, true, event);
}
export async function resolveMoneyCapture(tx, movement, input) {
  const type = movement.proposal?.movementType;
  if (input.action === 'registerDebitExpense' && !accountDebitNotice(movement)) throw new ApiAccessError('Este aviso no corresponde a un cargo genérico de cuenta.', 409);
  if (input.action === 'registerMoneyTransfer' && type !== 'MONEY_TRANSFER') throw new ApiAccessError('Este aviso no corresponde a una transferencia entre cuentas.', 409);
  if (input.action === 'registerMoneyWithdrawal' && !['CASH_WITHDRAWAL', 'ACCOUNT_DEBIT'].includes(type)) throw new ApiAccessError('Este aviso no corresponde a una salida de cuenta.', 409);
  return post(tx, movement, input.action === 'registerMoneyTransfer' ? 'TRANSFER' : input.action === 'registerMoneyWithdrawal' ? 'WITHDRAWAL' : 'DEBIT_EXPENSE', input.money);
}
export async function moneyCaptureDetail(tx, userId, movement) {
  const posting = await tx.captureMoneyPosting.findFirst({ where: { userId, movementId: movement.id }, include: { transfer: true, withdrawal: true, cardPayment: { include: { cycle: { select: { month: true, year: true, card: { select: { name: true } } } } } }, expense: { select: { id: true, concept: true, amount: true, paymentMethod: true, debitAccountId: true } } } });
  const cycles = posting?.kind === 'DEBIT_EXPENSE' && posting.expense ? await tx.cardCycle.findMany({ where: { userId, statementAmount: { not: null } }, orderBy: [{ year: 'desc' }, { month: 'desc' }], select: { id: true, month: true, year: true, statementAmount: true, paidAmount: true, postCutCreditAmount: true, card: { select: { name: true } } } }) : [];
  return { posting, cycles: cycles.filter(c => Number(c.statementAmount) - Number(c.paidAmount) - Number(c.postCutCreditAmount) > 0) };
}
