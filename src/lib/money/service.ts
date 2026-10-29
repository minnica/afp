import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import type { MoneyData } from './data';
import { readPaymentMix } from './persisted';
import { mutationResponseSchema, type MoneyMutationResponse } from './commands';
import { executeTransfer } from '@/lib/money/transfers';
import { createHash } from 'node:crypto';
import { ApiAccessError } from '@/lib/apiAuth';
import { runDebtAccountOperation } from '@/lib/debtAccountService';
import { getStoredCycleStatus } from '@/lib/calculations/cardCyclePayments';
import { accountSchema, reconcileSchema, planSchema, withdrawalSchema, paymentSchema } from '@/lib/money/schema';
import { todayInMexico, day, validDay, addMonths } from '@/lib/money/dates';
import { buildBudgetPaymentMix } from '@/lib/money/budgets';
import { Prisma } from '@prisma/client';
import { buildSources, accountBalances, exposure, cents, amount } from '@/lib/money/sources';
import { planDates } from '@/lib/money/forecast';
import { yieldRule, changedYieldHistory } from '@/lib/money/yieldRules';

export { loadMoneyData } from './data';
import { loadMoneyData } from './data';
function parsed<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiAccessError(result.error.issues[0]?.message ?? 'Referencia no válida.', 400);
  return result.data;
}
function requireRecord<T extends { id: string }>(rows: T[], id: unknown) {
  if (typeof id !== 'string' || !id) throw new ApiAccessError('Referencia no válida.', 400);
  const record = rows.find(row => row.id === id);
  if (!record) throw new ApiAccessError('Registro no encontrado.', 404);
  return record;
}
function version(record: { version: number }, value: unknown) { if (value !== record.version) throw new ApiAccessError('Este registro cambió. Actualiza la página y vuelve a intentarlo.', 409); }
function canonical(value: unknown): unknown { if (Array.isArray(value)) return value.map(canonical); if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, entry]: [string, unknown]) => [key, canonical(entry)])); return value; }
function accountSnapshot(account: MoneyData['accounts'][number]) {
  const { reconciliations: _history, ...snapshot } = account;
  void _history;
  return z.record(z.string(), z.json()).parse(JSON.parse(JSON.stringify(snapshot)));
}

export function routingOptions(data: MoneyData) {
  return [
    { key: 'default:income', label: 'Ingresos generales' }, { key: 'default:expense', label: 'Gastos en efectivo' },
    { key: 'default:contribution', label: 'Efectivo recibido en gastos compartidos' }, { key: 'default:card', label: 'Pagos de tarjetas' },
    ...data.incomeTypes.map(t => ({ key: `incomeType:${t.id}`, label: `Ingreso · ${t.name}` })),
    ...data.cards.map(c => ({ key: `card:${c.id}`, label: `Pago · ${c.name}` })),
    ...data.receivables.filter(a => a.status === 'ACTIVE').map(a => ({ key: `receivable:${a.id}`, label: `Cobro · ${a.concept}` })),
    ...data.receivables.filter(a => a.status === 'ACTIVE').map(a => ({ key: `receivable-forecast:${a.id}`, label: `Previsión de cobro · ${a.concept}`, forecastOnly: true })),
    ...data.payables.filter(a => a.status === 'ACTIVE').map(a => ({ key: `payable:${a.id}`, label: `Pago · ${a.concept}`, payrollDefault: a.accountType === 'LOAN' })),
    ...data.subscriptions.filter(s => s.paymentMethod === 'CASH').map(s => ({ key: `subscription:${s.id}`, label: `Suscripción · ${s.name}` })),
  ];
}
export async function mutateMoney(db: MoneyTransactionRunner, userId: string, body: unknown, today = todayInMexico(), internal: { matchedPaymentOverage?: boolean } = {}) {
  if (!body || Array.isArray(body) || typeof body !== 'object' || !('operationId' in body) || typeof body.operationId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.operationId || '')) throw new ApiAccessError('La operación necesita un identificador válido.', 400);
  const command: Record<string, unknown> = { ...body };
  const operationId = body.operationId;
  const fingerprint = createHash('sha256').update(JSON.stringify(canonical(body))).digest('hex');
  const operation = async (tx: Prisma.TransactionClient): Promise<MoneyMutationResponse> => {
    const previous = await tx.moneyOperation.findUnique({ where: { userId_operationId: { userId, operationId } } });
    if (previous) { if (previous.fingerprint !== fingerprint) throw new ApiAccessError('El identificador ya corresponde a otra operación.', 409); return mutationResponseSchema.parse(previous.result); }
    const data = await loadMoneyData(tx, userId), { events } = buildSources(data, today);
    let result: MoneyMutationResponse = { ok: true };
    if (command.action === 'CREATE_ACCOUNT') {
      const values = parsed(accountSchema, command);
      if (values.yieldIncomeTypeId) requireRecord(data.incomeTypes, values.yieldIncomeTypeId);
      if (values.asOf > today) throw new ApiAccessError('La fecha del saldo no puede ser futura.', 400);
      const baseline = exposure(events, values.asOf, values.asOf, false);
      const account = await tx.moneyAccount.create({ data: { ...values, yieldDailyAmount: values.yieldDailyAmount === '' ? null : values.yieldDailyAmount, yieldInitialPendingDays: values.yieldInitialPendingDays ?? null, yieldHistory: [{ from: values.asOf, rule: yieldRule(values) }], yieldCap: values.yieldCap || null, yieldStartDate: values.yieldStartDate ? new Date(values.yieldStartDate) : null, yieldEndDate: values.yieldEndDate ? new Date(values.yieldEndDate) : null, yieldIncomeTypeId: values.yieldIncomeTypeId || null, asOf: new Date(values.asOf), userId, baseline } });
      // Un saldo de un día anterior se interpreta al cierre de ese día.
      result = { ok: true, id: account.id };
    } else if (command.action === 'UPDATE_ACCOUNT') {
      const account = requireRecord(data.accounts, command.id); version(account, command.version);
      const values = parsed(accountSchema, { ...account, openingBalance: String(account.openingBalance), reservedAmount: String(account.reservedAmount), yieldCap: account.yieldCap == null ? null : String(account.yieldCap), yieldDailyAmount: account.yieldDailyAmount == null ? null : String(account.yieldDailyAmount), yieldStartDate: day(account.yieldStartDate), yieldEndDate: day(account.yieldEndDate), ...command, asOf: day(account.asOf) });
      if (values.yieldIncomeTypeId) requireRecord(data.incomeTypes, values.yieldIncomeTypeId);
      const history = changedYieldHistory(account, values, today);
      const correction = cents(values.openingBalance) - cents(account.openingBalance);
      const pendingCorrection = (values.yieldInitialPendingDays ?? null) !== account.yieldInitialPendingDays;
      if (correction || pendingCorrection) {
        const current = accountBalances([account], events, today)[0]!;
        const revised = { ...account, ...values, yieldDailyAmount: values.yieldDailyAmount ?? null, yieldCap: values.yieldCap ?? null, yieldStartDate: values.yieldStartDate || null, yieldEndDate: values.yieldEndDate || null, yieldIncomeTypeId: values.yieldIncomeTypeId || null, yieldInitialPendingDays: values.yieldInitialPendingDays ?? null, asOf: account.asOf, yieldHistory: z.array(z.json()).parse(history) };
        const revisedData = { ...data, accounts: data.accounts.map(a => a.id === account.id ? revised : a) };
        const corrected = accountBalances([revised], buildSources(revisedData, today).events, today)[0]!;
        const reason = correction ? `Corrección del saldo de referencia del ${day(account.asOf)}: ${account.openingBalance} → ${values.openingBalance}.` : `Ajuste de días de rendimiento pendientes en la referencia del ${day(account.asOf)}: ${account.yieldInitialPendingDays ?? 'según historial'} → ${values.yieldInitialPendingDays ?? 'según historial'}.`;
        await tx.moneyReconciliation.create({ data: { accountId: account.id, date: new Date(today), previousBalance: current.balance, bankBalance: corrected.balance, reason, snapshot: accountSnapshot(account) } });
      }
      await tx.moneyAccount.update({ where: { id: account.id, userId }, data: { name: values.name, kind: values.kind, openingBalance: values.openingBalance, reservedAmount: values.reservedAmount, annualYield: values.annualYield, yieldTaxPercent: values.yieldTaxPercent, yieldBasis: values.yieldBasis, yieldFrequency: values.yieldFrequency, yieldPayDay: values.yieldPayDay, autoYield: values.autoYield, yieldMethod: values.yieldMethod, yieldDailyAmount: values.yieldDailyAmount === '' ? null : values.yieldDailyAmount, yieldExcessRate: values.yieldExcessRate, yieldPayout: values.yieldPayout, yieldRounding: values.yieldRounding, yieldInitialPendingDays: values.yieldInitialPendingDays ?? null, yieldHistory: z.array(z.json()).parse(history), yieldCap: values.yieldCap || null, yieldStartDate: values.yieldStartDate ? new Date(values.yieldStartDate) : null, yieldEndDate: values.yieldEndDate ? new Date(values.yieldEndDate) : null, yieldIncomeTypeId: values.yieldIncomeTypeId || null, version: { increment: 1 } } });
    } else if (command.action === 'RECONCILE') {
      const values = parsed(reconcileSchema, command), account = requireRecord(data.accounts, values.accountId); version(account, values.version);
      const current = accountBalances([account], events, today)[0]!;
      await tx.moneyReconciliation.create({ data: { accountId: account.id, date: new Date(today), previousBalance: current.balance, bankBalance: values.bankBalance, reason: values.reason, snapshot: accountSnapshot(account) } });
      await tx.moneyAccount.update({ where: { id: account.id, userId }, data: { openingBalance: values.bankBalance, asOf: new Date(today), baseline: exposure(events, today, today, false), yieldInitialPendingDays: null, version: { increment: 1 } } });
    } else if (command.action === 'ROUTE') {
      const key = typeof command.key === 'string' ? command.key : '';
      const event = events.find(e => e.key === command.key);
      if (!event && !routingOptions(data).some(r => r.key === command.key)) throw new ApiAccessError('Movimiento no encontrado.', 404);
      if (event?.automaticYield) throw new ApiAccessError('El rendimiento calculado pertenece a esta cuenta. Ajusta su configuración o concilia el saldo.', 409);
      if (event?.ownPaymentId || event?.transferId || event?.withdrawalId || event?.debitExpenseId) throw new ApiAccessError('Revierte el movimiento para cambiar su cuenta.', 409);
      if (command.clear === true) { await tx.moneyRoute.deleteMany({ where: { userId, key } }); }
      else {
        if (typeof command.excluded !== 'boolean') throw new ApiAccessError('Selecciona cómo afecta al dinero.', 400);
        if (!command.excluded) requireRecord(data.accounts, command.accountId);
        let planId = null, occurrenceDate = null;
        if (command.planId) {
          const plan = requireRecord(data.plans, command.planId);
          if (!event || command.excluded || !validDay(command.occurrenceDate) || !planDates(plan, command.occurrenceDate, command.occurrenceDate).length || ((event.cents > 0) !== ['PAYROLL', 'INCOME'].includes(plan.kind))) throw new ApiAccessError('La previsión no corresponde a este movimiento.', 400);
          planId = plan.id; occurrenceDate = new Date(command.occurrenceDate);
        }
        const values = { accountId: command.excluded ? null : requireRecord(data.accounts, command.accountId).id, excluded: command.excluded, planId, occurrenceDate };
        await tx.moneyRoute.upsert({ where: { userId_key: { userId, key } }, create: { userId, key, ...values }, update: values });
      }
    } else if (command.action === 'SAVE_PLAN') {
      const existing = command.id ? requireRecord(data.plans, command.id) : null;
      if (existing) version(existing, command.version);
      const values = parsed(planSchema, { ...command, useHistoricalPayments: command.useHistoricalPayments ?? !!existing?.paymentMix, referenceMonths: command.referenceMonths ?? readPaymentMix(existing?.paymentMix)?.referenceMonths }); requireRecord(data.accounts, values.accountId);
      if (values.cardId) requireRecord(data.cards, values.cardId);
      if (values.incomeTypeId) requireRecord(data.incomeTypes, values.incomeTypeId);
      if (values.categoryId) requireRecord(data.categories, values.categoryId);
      if (values.incomeTypeId && data.plans.some(p => p.id !== command.id && p.isActive && p.incomeTypeId === values.incomeTypeId)) throw new ApiAccessError('Ya hay una previsión activa para ese tipo de ingreso. Usa una sola regla para evitar duplicados.', 409);
      if (values.kind === 'VARIABLE' && data.plans.some(p => p.id !== command.id && p.isActive && p.kind === 'VARIABLE' && p.categoryId === values.categoryId)) throw new ApiAccessError('Ya existe un presupuesto activo para esta categoría.', 409);
      const { useHistoricalPayments, referenceMonths, ...stored } = values;
      let paymentMix: Prisma.InputJsonValue | typeof Prisma.DbNull = Prisma.DbNull;
      if (useHistoricalPayments) {
        const months = [...new Set(referenceMonths || [3, 2, 1].map(offset => addMonths(today, -offset)))].sort();
        if (months.some(month => month >= today.slice(0, 7))) throw new ApiAccessError('Usa meses completos anteriores para estimar los pagos.', 400);
        try { paymentMix = buildBudgetPaymentMix(data, values.categoryId, months); }
        catch (error) { throw new ApiAccessError(error instanceof Error ? error.message : String(error), 400); }
      }
      const fields = { ...stored, paymentMix, days: [...new Set(values.days)].sort((a, b) => a - b), cardId: values.cardId || null, incomeTypeId: values.incomeTypeId || null, categoryId: values.categoryId || null, startDate: new Date(values.startDate), endDate: values.endDate ? new Date(values.endDate) : null };
      if (existing) { await tx.moneyPlan.update({ where: { id: existing.id, userId }, data: { ...fields, version: { increment: 1 } } }); }
      else { const plan = await tx.moneyPlan.create({ data: { userId, ...fields } }); result.id = plan.id; }
    } else if (command.action === 'OCCURRENCE') {
      const plan = requireRecord(data.plans, command.planId);
      if (!validDay(command.date) || !planDates(plan, command.date, command.date).length || !(command.status === 'SKIPPED' || command.status === 'CLOSED' || command.status === 'RESTORE')) throw new ApiAccessError('Previsión no válida.', 400);
      const date = new Date(command.date);
      if (command.status === 'RESTORE') await tx.moneyOccurrence.deleteMany({ where: { planId: plan.id, date } });
      else await tx.moneyOccurrence.upsert({ where: { planId_date: { planId: plan.id, date } }, create: { planId: plan.id, date, status: command.status }, update: { status: command.status } });
    } else if (command.action === 'WITHDRAWAL') {
      const values = parsed(withdrawalSchema, command), account = requireRecord(data.accounts, values.accountId);
      if (values.date > today || values.date < day(account.asOf)) throw new ApiAccessError('El retiro debe tener una fecha real desde el saldo de referencia.', 400);
      const saved = await tx.moneyWithdrawal.create({ data: { ...values, userId, date: new Date(values.date) } }); result.id = saved.id;
    } else if (command.action === 'REVERSE_WITHDRAWAL') {
      const withdrawal = requireRecord(data.withdrawals, command.id);
      if (day(requireRecord(data.accounts, withdrawal.accountId).asOf) > day(withdrawal.date)) throw new ApiAccessError('El retiro ya quedó incluido en una conciliación posterior. Revisa el saldo de la cuenta.', 409);
      await tx.moneyWithdrawal.update({ where: { id: withdrawal.id, userId }, data: { reversedAt: withdrawal.reversedAt || new Date() } });
      const samples = await tx.captureMoneyPosting.findMany({ where: { userId, withdrawalId: withdrawal.id }, select: { movementId: true } });
      if (samples.length) await tx.captureMoneyPolicy.updateMany({ where: { userId, kind: 'BBVA_WITHDRAWAL', verifiedMovementId: { in: samples.map(s => s.movementId) } }, data: { mode: 'OBSERVATION', verifiedMovementId: null } });
    } else if (command.action === 'TRANSFER' || command.action === 'REVERSE_TRANSFER') {
      result = await executeTransfer(tx, userId, body, data);
    } else if (command.action === 'CARD_PAYMENT' || command.action === 'REVERSE_PAYMENT') {
      let payment, values;
      if (command.action === 'CARD_PAYMENT') { values = parsed(paymentSchema, command); requireRecord(data.accounts, values.accountId); if (values.date > today || values.date < day(requireRecord(data.accounts, values.accountId).asOf)) throw new ApiAccessError('El pago debe tener una fecha real desde el saldo inicial.', 400); }
      else { payment = data.cycles.flatMap(c => c.moneyPayments).find(p => p.id === command.id); if (!payment) throw new ApiAccessError('Pago no encontrado.', 404); if (payment.reversedAt) return { ok: true }; values = { cycleId: payment.cycleId, date: day(payment.date) }; }
      requireRecord(data.cycles, values.cycleId);
      await tx.$queryRaw`SELECT id FROM card_cycles WHERE id = ${values.cycleId} AND "userId" = ${userId} FOR UPDATE`;
      const cycle = await tx.cardCycle.findUnique({ where: { id: values.cycleId, userId } });
      if (!cycle || cycle.statementAmount == null) throw new ApiAccessError('Captura el estado de cuenta antes de registrar un pago.', 409);
      const delta = command.action === 'CARD_PAYMENT' ? cents(values.amount) : -cents(payment!.amount);
      // Solo la coincidencia automática puede conservar hasta $1 de excedente.
      // La API pública no toma esta opción del cuerpo de la solicitud.
      const overage = internal.matchedPaymentOverage && 'transactionScope' in db && db.transactionScope === 'existing' ? 100 : 0;
      if (delta > Math.max(0, cents(cycle.statementAmount) - cents(cycle.postCutCreditAmount) - cents(cycle.paidAmount)) + overage) throw new ApiAccessError('El abono supera el saldo pendiente de este corte.', 409);
      const total = cents(cycle.paidAmount) + delta;
      const changes = { paidAmount: amount(total), paidAt: total ? new Date([day(cycle.paidAt) || values.date, values.date].sort().at(-1)!) : null };
      if (payment) await tx.moneyCardPayment.update({ where: { id: payment.id, userId }, data: { reversedAt: new Date() } });
      // El trigger comprueba el total identificado; aumentar antes de añadir el abono.
      await tx.cardCycle.update({ where: { id: cycle.id, userId }, data: { ...changes, status: z.enum(['OPEN', 'CUT', 'PAYMENT_PENDING', 'PAID', 'OVERDUE']).parse(getStoredCycleStatus({ ...cycle, ...changes })) } });
      if (!payment) { const saved = await tx.moneyCardPayment.create({ data: { userId, cycleId: cycle.id, accountId: values.accountId!, amount: values.amount!, date: new Date(values.date) } }); result.id = saved.id; }
    } else throw new ApiAccessError('Acción no permitida.', 400);
    await tx.moneyOperation.create({ data: { userId, operationId, fingerprint, result } });
    return result;
  };
  // The shared JS coordinator retains the owner lock and transaction options.
  const result: unknown = await runDebtAccountOperation(db, userId, operation);
  return mutationResponseSchema.parse(result);
}

export type MoneyTransactionRunner = PrismaClient | {
  transactionScope: 'existing';
  $transaction<T>(run: (tx: Prisma.TransactionClient) => Promise<T>, options?: { isolationLevel?: Prisma.TransactionIsolationLevel; timeout?: number; maxWait?: number }): Promise<T>;
}
