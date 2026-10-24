import { createHash } from 'node:crypto';
import { ApiAccessError } from '@/lib/apiAuth';
import { runDebtAccountOperation } from '@/lib/debtAccountService';
import { getStoredCycleStatus } from '@/lib/calculations/cardCyclePayments';
import { accountSchema, reconcileSchema, planSchema, transferSchema, paymentSchema } from '@/lib/money/schema';
import { todayInMexico, day, validDay } from '@/lib/money/dates';
import { buildSources, accountBalances, exposure, cents, amount } from '@/lib/money/sources';
import { planDates } from '@/lib/money/forecast';

export async function loadMoneyData(db, userId) {
  const names = ['accounts', 'routes', 'plans', 'transfers', 'cards', 'cycles', 'incomes', 'expenses', 'subscriptions', 'purchases', 'receivables', 'payables', 'incomeTypes', 'categories'];
  const where = { userId };
  const values = await Promise.all([
    db.moneyAccount.findMany({ where, orderBy: { createdAt: 'asc' }, include: { reconciliations: { orderBy: { createdAt: 'desc' }, take: 20 } } }),
    db.moneyRoute.findMany({ where }), db.moneyPlan.findMany({ where, include: { occurrences: true } }), db.moneyTransfer.findMany({ where }),
    db.card.findMany({ where }), db.cardCycle.findMany({ where, include: { card: true, credits: { include: { income: true } }, payments: true, moneyPayments: true } }),
    db.income.findMany({ where, orderBy: { date: 'desc' } }),
    db.dailyExpense.findMany({ where, include: { subscriptionCharge: true } }),
    db.subscription.findMany({ where, include: { charges: true, dailyExpenses: { include: { subscriptionCharge: true } } } }),
    db.installmentPurchase.findMany({ where }), db.receivableAccount.findMany({ where, include: { incomes: true, person: true } }),
    db.payableAccount.findMany({ where, include: { dailyExpenses: true, person: true } }),
    db.incomeType.findMany({ where }), db.category.findMany({ where }),
  ]);
  return Object.fromEntries(names.map((name, i) => [name, values[i]]));
}
function parsed(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiAccessError(result.error.issues[0].message, 400);
  return result.data;
}
function requireRecord(rows, id) {
  if (typeof id !== 'string' || !id) throw new ApiAccessError('Referencia no válida.', 400);
  const record = rows.find(row => row.id === id);
  if (!record) throw new ApiAccessError('Registro no encontrado.', 404);
  return record;
}
function version(record, value) { if (value !== record.version) throw new ApiAccessError('Este registro cambió. Actualiza la página y vuelve a intentarlo.', 409); }
function canonical(value) { if (Array.isArray(value)) return value.map(canonical); if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])); return value; }

export function routingOptions(data) {
  return [
    { key: 'default:income', label: 'Ingresos generales' }, { key: 'default:expense', label: 'Gastos en efectivo o débito' },
    { key: 'default:contribution', label: 'Efectivo recibido en gastos compartidos' }, { key: 'default:card', label: 'Pagos de tarjetas' },
    ...data.incomeTypes.map(t => ({ key: `incomeType:${t.id}`, label: `Ingreso · ${t.name}` })),
    ...data.cards.map(c => ({ key: `card:${c.id}`, label: `Pago · ${c.name}` })),
    ...data.receivables.filter(a => a.status === 'ACTIVE').map(a => ({ key: `receivable:${a.id}`, label: `Cobro · ${a.concept}` })),
    ...data.payables.filter(a => a.status === 'ACTIVE').map(a => ({ key: `payable:${a.id}`, label: `Pago · ${a.concept}`, payrollDefault: a.accountType === 'LOAN' })),
    ...data.subscriptions.filter(s => s.paymentMethod === 'CASH').map(s => ({ key: `subscription:${s.id}`, label: `Suscripción · ${s.name}` })),
  ];
}
export async function mutateMoney(db, userId, body, today = todayInMexico()) {
  if (!body || Array.isArray(body) || typeof body !== 'object' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.operationId || '')) throw new ApiAccessError('La operación necesita un identificador válido.', 400);
  const fingerprint = createHash('sha256').update(JSON.stringify(canonical(body))).digest('hex');
  return runDebtAccountOperation(db, userId, async tx => {
    const previous = await tx.moneyOperation.findUnique({ where: { userId_operationId: { userId, operationId: body.operationId } } });
    if (previous) { if (previous.fingerprint !== fingerprint) throw new ApiAccessError('El identificador ya corresponde a otra operación.', 409); return previous.result; }
    const data = await loadMoneyData(tx, userId), { events } = buildSources(data);
    let result = { ok: true };
    if (body.action === 'CREATE_ACCOUNT') {
      const values = parsed(accountSchema, body);
      if (values.yieldIncomeTypeId) requireRecord(data.incomeTypes, values.yieldIncomeTypeId);
      if (values.asOf > today) throw new ApiAccessError('La fecha del saldo no puede ser futura.', 400);
      const baseline = exposure(events, values.asOf, values.asOf);
      const account = await tx.moneyAccount.create({ data: { ...values, yieldCap: values.yieldCap || null, yieldStartDate: values.yieldStartDate ? new Date(values.yieldStartDate) : null, yieldEndDate: values.yieldEndDate ? new Date(values.yieldEndDate) : null, yieldIncomeTypeId: values.yieldIncomeTypeId || null, asOf: new Date(values.asOf), userId, baseline } });
      // Un saldo de un día anterior se interpreta al cierre de ese día.
      result = { ok: true, id: account.id };
    } else if (body.action === 'UPDATE_ACCOUNT') {
      const account = requireRecord(data.accounts, body.id); version(account, body.version);
      const values = parsed(accountSchema, { ...account, asOf: day(account.asOf), ...body, openingBalance: String(account.openingBalance) });
      if (values.yieldIncomeTypeId) requireRecord(data.incomeTypes, values.yieldIncomeTypeId);
      await tx.moneyAccount.update({ where: { id: account.id, userId }, data: { name: values.name, kind: values.kind, reservedAmount: values.reservedAmount, annualYield: values.annualYield, yieldTaxPercent: values.yieldTaxPercent, yieldBasis: values.yieldBasis, yieldFrequency: values.yieldFrequency, yieldPayDay: values.yieldPayDay, yieldCap: values.yieldCap || null, yieldStartDate: values.yieldStartDate ? new Date(values.yieldStartDate) : null, yieldEndDate: values.yieldEndDate ? new Date(values.yieldEndDate) : null, yieldIncomeTypeId: values.yieldIncomeTypeId || null, version: { increment: 1 } } });
    } else if (body.action === 'RECONCILE') {
      const values = parsed(reconcileSchema, body), account = requireRecord(data.accounts, values.accountId); version(account, values.version);
      const current = accountBalances([account], events, today)[0];
      await tx.moneyReconciliation.create({ data: { accountId: account.id, date: new Date(today), previousBalance: current.balance, bankBalance: values.bankBalance, reason: values.reason, snapshot: JSON.parse(JSON.stringify(account)) } });
      await tx.moneyAccount.update({ where: { id: account.id, userId }, data: { openingBalance: values.bankBalance, asOf: new Date(today), baseline: exposure(events, today, today), version: { increment: 1 } } });
    } else if (body.action === 'ROUTE') {
      const event = events.find(e => e.key === body.key);
      if (!event && !routingOptions(data).some(r => r.key === body.key)) throw new ApiAccessError('Movimiento no encontrado.', 404);
      if (event?.ownPaymentId || event?.transferId) throw new ApiAccessError('Revierte el movimiento para cambiar su cuenta.', 409);
      if (body.clear === true) { await tx.moneyRoute.deleteMany({ where: { userId, key: body.key } }); }
      else {
        if (typeof body.excluded !== 'boolean') throw new ApiAccessError('Selecciona cómo afecta al dinero.', 400);
        if (!body.excluded) requireRecord(data.accounts, body.accountId);
        let planId = null, occurrenceDate = null;
        if (body.planId) {
          const plan = requireRecord(data.plans, body.planId);
          if (!event || body.excluded || !validDay(body.occurrenceDate) || !planDates(plan, body.occurrenceDate, body.occurrenceDate).length || ((event.cents > 0) !== ['PAYROLL', 'INCOME'].includes(plan.kind))) throw new ApiAccessError('La previsión no corresponde a este movimiento.', 400);
          planId = plan.id; occurrenceDate = new Date(body.occurrenceDate);
        }
        const values = { accountId: body.excluded ? null : body.accountId, excluded: body.excluded, planId, occurrenceDate };
        await tx.moneyRoute.upsert({ where: { userId_key: { userId, key: body.key } }, create: { userId, key: body.key, ...values }, update: values });
      }
    } else if (body.action === 'SAVE_PLAN') {
      const values = parsed(planSchema, body); requireRecord(data.accounts, values.accountId);
      if (values.cardId) requireRecord(data.cards, values.cardId);
      if (values.incomeTypeId) requireRecord(data.incomeTypes, values.incomeTypeId);
      if (values.categoryId) requireRecord(data.categories, values.categoryId);
      if (values.incomeTypeId && data.plans.some(p => p.id !== body.id && p.isActive && p.incomeTypeId === values.incomeTypeId)) throw new ApiAccessError('Ya hay una previsión activa para ese tipo de ingreso. Usa una sola regla para evitar duplicados.', 409);
      if (values.kind === 'VARIABLE' && data.plans.some(p => p.id !== body.id && p.isActive && p.kind === 'VARIABLE' && p.categoryId === values.categoryId)) throw new ApiAccessError('Ya existe un presupuesto activo para esta categoría.', 409);
      const fields = { ...values, days: [...new Set(values.days)].sort((a, b) => a - b), cardId: values.cardId || null, incomeTypeId: values.incomeTypeId || null, categoryId: values.categoryId || null, startDate: new Date(values.startDate), endDate: values.endDate ? new Date(values.endDate) : null };
      if (body.id) { const existing = requireRecord(data.plans, body.id); version(existing, body.version); await tx.moneyPlan.update({ where: { id: existing.id, userId }, data: { ...fields, version: { increment: 1 } } }); }
      else { const plan = await tx.moneyPlan.create({ data: { userId, ...fields } }); result.id = plan.id; }
    } else if (body.action === 'OCCURRENCE') {
      const plan = requireRecord(data.plans, body.planId);
      if (!validDay(body.date) || !planDates(plan, body.date, body.date).length || !['SKIPPED', 'CLOSED', 'RESTORE'].includes(body.status)) throw new ApiAccessError('Previsión no válida.', 400);
      const date = new Date(body.date);
      if (body.status === 'RESTORE') await tx.moneyOccurrence.deleteMany({ where: { planId: plan.id, date } });
      else await tx.moneyOccurrence.upsert({ where: { planId_date: { planId: plan.id, date } }, create: { planId: plan.id, date, status: body.status }, update: { status: body.status } });
    } else if (body.action === 'TRANSFER') {
      const values = parsed(transferSchema, body); requireRecord(data.accounts, values.fromAccountId); requireRecord(data.accounts, values.toAccountId);
      for (const id of [values.fromAccountId, values.toAccountId]) if (values.date < day(requireRecord(data.accounts, id).asOf)) throw new ApiAccessError('La transferencia debe ser posterior al saldo inicial de ambas cuentas.', 400);
      const transfer = await tx.moneyTransfer.create({ data: { ...values, date: new Date(values.date), userId } }); result.id = transfer.id;
    } else if (body.action === 'REVERSE_TRANSFER') {
      const transfer = requireRecord(data.transfers, body.id);
      if (data.accounts.some(a => [transfer.fromAccountId, transfer.toAccountId].includes(a.id) && day(a.asOf) > day(transfer.date))) throw new ApiAccessError('La transferencia ya está incluida en una conciliación posterior. Corrige los saldos con una nueva conciliación.', 409);
      await tx.moneyTransfer.update({ where: { id: transfer.id, userId }, data: { reversedAt: new Date() } });
    } else if (body.action === 'CARD_PAYMENT' || body.action === 'REVERSE_PAYMENT') {
      let payment, values;
      if (body.action === 'CARD_PAYMENT') { values = parsed(paymentSchema, body); requireRecord(data.accounts, values.accountId); if (values.date > today || values.date < day(requireRecord(data.accounts, values.accountId).asOf)) throw new ApiAccessError('El pago debe tener una fecha real desde el saldo inicial.', 400); }
      else { payment = data.cycles.flatMap(c => c.moneyPayments).find(p => p.id === body.id); if (!payment) throw new ApiAccessError('Pago no encontrado.', 404); if (payment.reversedAt) return { ok: true }; values = { cycleId: payment.cycleId, date: day(payment.date) }; }
      requireRecord(data.cycles, values.cycleId);
      await tx.$queryRaw`SELECT id FROM card_cycles WHERE id = ${values.cycleId} AND "userId" = ${userId} FOR UPDATE`;
      const cycle = await tx.cardCycle.findUnique({ where: { id: values.cycleId, userId } });
      if (cycle.statementAmount == null) throw new ApiAccessError('Captura el estado de cuenta antes de registrar un pago.', 409);
      const delta = body.action === 'CARD_PAYMENT' ? cents(values.amount) : -cents(payment.amount);
      if (delta > Math.max(0, cents(cycle.statementAmount) - cents(cycle.postCutCreditAmount) - cents(cycle.paidAmount))) throw new ApiAccessError('El abono supera el saldo pendiente de este corte.', 409);
      const total = cents(cycle.paidAmount) + delta;
      const changes = { paidAmount: amount(total), paidAt: total ? new Date([day(cycle.paidAt) || values.date, values.date].sort().at(-1)) : null };
      if (payment) await tx.moneyCardPayment.update({ where: { id: payment.id, userId }, data: { reversedAt: new Date() } });
      // El trigger comprueba el total identificado; aumentar antes de añadir el abono.
      await tx.cardCycle.update({ where: { id: cycle.id, userId }, data: { ...changes, status: getStoredCycleStatus({ ...cycle, ...changes }) } });
      if (!payment) { const saved = await tx.moneyCardPayment.create({ data: { userId, cycleId: cycle.id, accountId: values.accountId, amount: values.amount, date: new Date(values.date) } }); result.id = saved.id; }
    } else throw new ApiAccessError('Acción no permitida.', 400);
    await tx.moneyOperation.create({ data: { userId, operationId: body.operationId, fingerprint, result } });
    return result;
  });
}
