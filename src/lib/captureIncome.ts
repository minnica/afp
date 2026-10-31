import { Prisma, type CaptureEvent } from '@prisma/client';
import { z } from 'zod';
import { ApiAccessError } from './apiAuth';
import { captureInput, captureProposal, captureSnapshot } from './captureJson';
import { captureHash } from './captureProtocol';
import { captureAmount, captureDate } from './captureReview';
import { incomeCaptureKind, incomeParserKeys } from './captureIncomeParsers';
import type { CaptureDb, CaptureInterpretation, Movement } from './captureTypes';
import { day, todayInMexico } from './money/dates';
const text = z.string().trim().min(1).max(160);
export const incomePolicySchema = z.object({ action: z.literal('incomePolicy'), parserKey: z.enum(incomeParserKeys), accountSuffix: z.string().regex(/^\d{4,5}$/), accountId: text, incomeTypeId: text, mode: z.enum(['OBSERVATION', 'AUTOMATIC']), currency: z.literal('MXN'), datePolicy: z.literal('NOTIFICATION_POSTED_AT'), verifiedMovementId: z.uuid().nullable().optional(), estimatedFirstHalfAmount: captureAmount.nullable().optional(), estimatedSecondHalfAmount: captureAmount.nullable().optional() }).strict();
const incomeInputSchema = z.object({ accountId: text, incomeTypeId: text, amount: captureAmount, date: captureDate, concept: text, currency: z.literal('MXN'), confirmedReceived: z.literal(true), incomeId: text.optional(), distinct: z.boolean().default(false) }).strict();
async function references(tx: CaptureDb, userId: string, accountId: string, incomeTypeId: string) {
  const account = await tx.moneyAccount.findFirst({ where: { id: accountId, userId, kind: 'BANK' } });
  const type = await tx.incomeType.findFirst({ where: { id: incomeTypeId, userId } });
  if (!account || !type) throw new ApiAccessError('Cuenta bancaria o tipo de ingreso no encontrado.', 404);
  return { account, type };
}
export async function configureIncomeCapture(tx: Prisma.TransactionClient, userId: string, input: z.output<typeof incomePolicySchema>) {
  const { action: _action, ...values } = input; void _action;
  await references(tx, userId, values.accountId, values.incomeTypeId);
  if (values.mode === 'AUTOMATIC') {
    const sample = values.verifiedMovementId && await tx.captureMovement.findFirst({ where: { id: values.verifiedMovementId, userId }, include: { moneyPosting: { include: { income: true } } } });
    const p = sample && captureProposal(sample.proposal);
    const payroll = values.parserKey === incomeParserKeys[0];
    // A payroll notice can validate identity, never its missing amount.
    const usable = sample && !sample.correction && p && sample.parserKey === values.parserKey && p.accountSuffix === values.accountSuffix
      && (payroll ? ['INCOME_AMOUNT_REQUIRED', 'INCOME_OBSERVATION', 'INCOME_ESTIMATED', 'INCOME_REGISTERED'].includes(sample.reason)
        : sample.moneyPosting?.income && !sample.moneyPosting.income.isEstimated && p.amount && captureSnapshot(sample.moneyPosting.snapshot).incomeTypeId === values.incomeTypeId && captureSnapshot(sample.moneyPosting.snapshot).accountId === values.accountId);
    if (!usable || (payroll && (!values.estimatedFirstHalfAmount || !values.estimatedSecondHalfAmount))) throw new ApiAccessError('Revisa una muestra propia de esta cuenta. La nómina necesita los dos importes estimados; otros depósitos necesitan una muestra completa registrada.', 409);
  }
  const identity = { userId, parserKey: values.parserKey, accountSuffix: values.accountSuffix };
  return tx.captureIncomePolicy.upsert({ where: { userId_parserKey_accountSuffix: identity }, create: { ...values, userId }, update: { ...values, acceptedAt: new Date() } });
}
export async function completeIncomeCapture(tx: Prisma.TransactionClient, event: CaptureEvent, decoded: CaptureInterpretation, observationOnly: boolean) {
  if (!incomeCaptureKind(decoded)) return null;
  const p = decoded.proposal;
  if (!['INCOME_POLICY_REQUIRED', 'INCOME_AMOUNT_REQUIRED'].includes(decoded.reason) || !p.date || !p.accountSuffix) return decoded;
  const policy = await tx.captureIncomePolicy.findUnique({ where: { userId_parserKey_accountSuffix: { userId: event.userId, parserKey: decoded.parserKey!, accountSuffix: p.accountSuffix } } });
  if (!policy) return decoded;
  const { account } = await references(tx, event.userId, policy.accountId, policy.incomeTypeId);
  const estimate = (typeof p.payrollPeriod === 'string' ? p.payrollPeriod.endsWith(':1') : Number(p.date.slice(8)) <= 15) ? policy.estimatedFirstHalfAmount : policy.estimatedSecondHalfAmount;
  // Keep the bank's proposal.amount absent: an estimate is never bank evidence.
  const sample = policy.verifiedMovementId && await tx.captureMovement.findFirst({ where: { id: policy.verifiedMovementId, userId: event.userId, parserKey: policy.parserKey }, include: { moneyPosting: { include: { income: true } } } });
  const sampleValid = sample && captureProposal(sample.proposal).accountSuffix === p.accountSuffix && !sample.correction && sample.status !== 'DISCARDED'
    && (p.incomeKind === 'PAYROLL' || (sample.moneyPosting?.income && !sample.moneyPosting.income.isEstimated && captureProposal(sample.proposal).amount && new Prisma.Decimal(captureProposal(sample.proposal).amount!).equals(sample.moneyPosting.income.amount) && captureSnapshot(sample.moneyPosting.snapshot).accountId === policy.accountId && captureSnapshot(sample.moneyPosting.snapshot).incomeTypeId === policy.incomeTypeId && sample.moneyPosting.income.incomeTypeId === policy.incomeTypeId));
  const automatic = sampleValid && !observationOnly && policy.mode === 'AUTOMATIC' && policy.verifiedMovementId && (p.amount || (p.incomeKind === 'PAYROLL' && estimate));
  const reason = p.date > todayInMexico() ? 'MONEY_FUTURE' : p.date < day(account.asOf) ? 'MONEY_BEFORE_REFERENCE' : automatic ? 'INCOME_READY' : 'INCOME_OBSERVATION';
  return { ...decoded, reason, proposal: { ...p, incomeAccountId: policy.accountId, incomeTypeId: policy.incomeTypeId, currency: 'MXN', incomePolicyId: policy.id, ...(estimate && p.incomeKind === 'PAYROLL' ? { estimatedAmount: estimate.toFixed(2) } : {}) } };
}
function sourceKey(event: CaptureEvent) { return captureHash(JSON.stringify([event.deviceId, event.sourcePackage, event.notificationKeyHash, new Date(event.postedAt).toISOString(), event.fields])); }
export async function postCapturedIncome(tx: Prisma.TransactionClient, movement: Movement, rawInput: unknown, automatic = false, event?: CaptureEvent) {
  if (!incomeCaptureKind(movement)) throw new ApiAccessError('Este aviso no corresponde a un ingreso.', 409);
  const existing = await tx.captureMoneyPosting.findUnique({ where: { movementId: movement.id } });
  if (existing) return movement;
  if (!['REVIEW', 'OBSERVED'].includes(movement.status)) throw new ApiAccessError('El aviso ya se resolvió.', 409);
  const parsed = incomeInputSchema.safeParse(rawInput);
  if (!parsed.success) throw new ApiAccessError('Revisa cuenta, tipo de ingreso, importe, fecha y confirmación del abono.', 400);
  const v = parsed.data, p = captureProposal(movement.proposal), userId = movement.userId;
  if (!['INCOME_POLICY_REQUIRED', 'INCOME_AMOUNT_REQUIRED', 'INCOME_READY', 'INCOME_OBSERVATION', 'INCOME_POSSIBLE_DUPLICATE', 'MONEY_BEFORE_REFERENCE'].includes(movement.reason)) throw new ApiAccessError('La notificación necesita revisión de su formato.', 409);
  if (v.date > todayInMexico() || (p.amount && !new Prisma.Decimal(p.amount).equals(v.amount))) throw new ApiAccessError('Conserva el importe que muestra el banco y revisa la fecha.', 409);
  const { account } = await references(tx, userId, v.accountId, v.incomeTypeId);
  if (v.date < day(account.asOf)) throw new ApiAccessError('El ingreso es anterior al saldo de referencia. Revisa si ya está incluido.', 409);
  const events = event ? [event] : await tx.captureEvent.findMany({ where: { userId, movementId: movement.id } });
  if (events.length !== 1) throw new ApiAccessError('Revisa las evidencias antes de registrar el ingreso.', 409);
  const origin = events[0]!;
  const prior = await tx.captureMoneyPosting.findUnique({ where: { userId_sourceKey: { userId, sourceKey: sourceKey(origin) } } });
  if (prior) {
    await tx.captureEvent.update({ where: { id: origin.id }, data: { movementId: prior.movementId } });
    await tx.captureMovement.update({ where: { id: movement.id }, data: { status: 'DISCARDED', reason: 'MONEY_REPEATED_NOTICE', resolvedAt: new Date() } });
    return (await tx.captureMovement.findUniqueOrThrow({ where: { id: prior.movementId } }));
  }
  const revision = await tx.captureEvent.findFirst({ where: { userId, deviceId: origin.deviceId, sourcePackage: origin.sourcePackage, notificationKeyHash: origin.notificationKeyHash, postedAt: origin.postedAt, id: { not: origin.id } } });
  const candidates = await incomeCandidates(tx, userId, v.amount, v.date, p.incomeKind === 'PAYROLL' ? v.incomeTypeId : undefined);
  const priorNotices = await tx.captureMoneyPosting.findMany({ where: { userId, kind: 'INCOME', snapshot: p.incomeKind === 'PAYROLL' && typeof p.payrollPeriod === 'string' ? { path: ['payrollPeriod'], equals: p.payrollPeriod } : { path: ['date'], equals: v.date } }, select: { snapshot: true } });
  const deletedOrRepeated = priorNotices.some(row => {
    const snapshot = captureSnapshot(row.snapshot);
    return snapshot.accountId === v.accountId && (snapshot.amount === v.amount || p.incomeKind === 'PAYROLL' && snapshot.incomeTypeId === v.incomeTypeId);
  });
  if (!v.incomeId && !v.distinct && (revision || candidates.length || deletedOrRepeated)) {
    if (!automatic) throw new ApiAccessError('Hay un ingreso o aviso parecido. Vincúlalo al ingreso existente o confirma que es otro abono.', 409);
    return tx.captureMovement.update({ where: { id: movement.id }, data: { reason: 'INCOME_POSSIBLE_DUPLICATE' } });
  }
  const estimated = automatic && !p.amount;
  let record;
  if (v.incomeId) {
    record = await tx.income.findFirst({ where: { id: v.incomeId, userId, amount: v.amount, incomeTypeId: v.incomeTypeId, date: { gte: new Date(`${v.date}T00:00:00Z`), lt: new Date(`${v.date}T23:59:59.999Z`) } } });
    const route = await tx.moneyRoute.findUnique({ where: { userId_key: { userId, key: `income:${v.incomeId}` } } });
    const credits = await tx.cardCycleCredit.count({ where: { userId, incomeId: v.incomeId } });
    if (!record || record.receivableAccountId || credits || (route && (route.accountId !== v.accountId || route.excluded))) throw new ApiAccessError('Revisa importe, fecha y cuenta del ingreso existente.', 409);
  } else record = await tx.income.create({ data: { userId, amount: v.amount, date: new Date(`${v.date}T12:00:00Z`), incomeTypeId: v.incomeTypeId, source: 'BBVA', concept: v.concept, isEstimated: estimated } });
  await tx.moneyRoute.upsert({ where: { userId_key: { userId, key: `income:${record.id}` } }, create: { userId, key: `income:${record.id}`, accountId: account.id }, update: { accountId: account.id, excluded: false } });
  await tx.captureMoneyPosting.create({ data: { userId, movementId: movement.id, sourceKey: sourceKey(origin), kind: 'INCOME', incomeId: record.id, originalRecordId: record.id, snapshot: { ...v, ...(typeof p.payrollPeriod === 'string' ? { payrollPeriod: p.payrollPeriod } : {}), automatic, isEstimated: estimated, accountName: account.name, amountSource: estimated ? 'ACCEPTED_ESTIMATE' : p.amount ? 'NOTIFICATION' : 'USER_CONFIRMED' } } });
  return tx.captureMovement.update({ where: { id: movement.id }, data: { status: v.incomeId ? 'LINKED' : 'REGISTERED', reason: estimated ? 'INCOME_ESTIMATED' : 'INCOME_REGISTERED', resolvedAt: new Date(), proposal: { ...p, incomeAccountId: account.id, incomeTypeId: v.incomeTypeId, currency: 'MXN' } } });
}
export async function automateIncomeCapture(tx: Prisma.TransactionClient, event: CaptureEvent, movement: Movement) {
  if (movement.reason !== 'INCOME_READY') return movement;
  const p = captureProposal(movement.proposal);
  return postCapturedIncome(tx, movement, { accountId: p.incomeAccountId, incomeTypeId: p.incomeTypeId, amount: p.amount || p.estimatedAmount, date: p.date, concept: p.merchant, currency: 'MXN', confirmedReceived: true }, true, event);
}
async function incomeCandidates(db: CaptureDb, userId: string, amount: string, date: string, payrollTypeId?: string) {
  const time = Date.parse(`${date}T00:00:00Z`);
  return db.income.findMany({ where: { userId, OR: [{ amount }, { isEstimated: true }, ...(payrollTypeId ? [{ incomeTypeId: payrollTypeId, source: 'BBVA', capturePostings: { some: { kind: 'INCOME' } } }] : [])], date: { gte: new Date(time - 86400000), lt: new Date(time + 2 * 86400000) } }, select: { id: true, amount: true, date: true, concept: true, isEstimated: true } });
}
export async function incomeCaptureDetail(db: CaptureDb, userId: string, movement: Movement) {
  const p = captureProposal(movement.proposal);
  const posting = await db.captureMoneyPosting.findFirst({ where: { userId, movementId: movement.id }, include: { income: true } });
  const time = p.date ? Date.parse(`${p.date}T00:00:00Z`) : NaN;
  const candidates = Number.isFinite(time) ? await db.income.findMany({
    where: { userId, date: { gte: new Date(time - 86400000), lt: new Date(time + 2 * 86400000) } },
    select: { id: true, amount: true, date: true, concept: true, isEstimated: true }, orderBy: { date: 'desc' }, take: 30,
  }) : [];
  return { posting, candidates };
}
export async function resolveIncomeCapture(tx: Prisma.TransactionClient, movement: Movement, rawInput: unknown) {
  const input = captureInput(rawInput);
  if (!incomeCaptureKind(movement)) throw new ApiAccessError('Este aviso no corresponde a un ingreso.', 409);
  if (input.action === 'confirmIncome') {
    const v = z.object({ amount: captureAmount, expectedUpdatedAt: z.string(), confirmedReceived: z.literal(true) }).strict().safeParse(input.income);
    if (!v.success) throw new ApiAccessError('Confirma el importe recibido y actualiza el aviso.', 400);
    const posting = await tx.captureMoneyPosting.findFirst({ where: { userId: movement.userId, movementId: movement.id }, include: { income: true } });
    const income = posting?.income;
    if (!income || !income.isEstimated || income.updatedAt.toISOString() !== v.data.expectedUpdatedAt) throw new ApiAccessError('El ingreso cambió. Actualiza antes de confirmarlo.', 409);
    const route = await tx.moneyRoute.findUnique({ where: { userId_key: { userId: movement.userId, key: `income:${income.id}` } } });
    const account = route?.accountId && await tx.moneyAccount.findFirst({ where: { id: route.accountId, userId: movement.userId } });
    if (!account || day(account.asOf) > day(income.date)) throw new ApiAccessError('El ingreso ya puede estar incluido en una conciliación. Revísalo en Ingresos.', 409);
    const credits = await tx.cardCycleCredit.aggregate({ where: { userId: movement.userId, incomeId: income.id }, _sum: { amount: true } });
    if (new Prisma.Decimal(v.data.amount).lt(credits._sum.amount || 0)) throw new ApiAccessError('El importe es menor que las bonificaciones aplicadas. Revisa esas aplicaciones en Ingresos.', 409);
    await tx.income.update({ where: { id: income.id }, data: { amount: v.data.amount, isEstimated: false } });
    return tx.captureMovement.update({ where: { id: movement.id }, data: { reason: 'INCOME_REGISTERED' } });
  }
  if (input.action === 'linkIncome' && !captureInput(input.income).incomeId) throw new ApiAccessError('Selecciona el ingreso existente.', 400);
  return postCapturedIncome(tx, movement, input.income);
}
