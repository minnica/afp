import type { CalculationData, MoneyEvent, MoneyIssue, MoneyValue, MoneyRoute, Exposure, DateValue } from './types';
import { readBaseline, readSnapshot } from './persisted';

type BalanceReference = { id: string; asOf: DateValue; openingBalance: MoneyValue; reservedAmount?: MoneyValue; baseline?: unknown; yieldInitialPendingDays?: number | null };
import { Prisma } from '@prisma/client';
import { day, addDays, todayInMexico } from '@/lib/money/dates';
import { yieldHistory, ruleAt, dailyYieldCents, roundedYieldCents, paysOn, isRecordedYield } from '@/lib/money/yieldRules';
export function cents(value: MoneyValue) { return new Prisma.Decimal(value || 0).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).mul(100).toNumber(); }
export function amount(value: number) { return value / 100; }
export function resolveRoute(data: CalculationData, keys: (string | false | null)[], fallback: MoneyRoute = {}) {
  for (const key of keys) { const route = data.routes.find(r => r.key === key); if (route) return route; }
  return fallback;
}
function rawSources(data: CalculationData) {
  const events: MoneyEvent[] = [], issues: MoneyIssue[] = [];
  const add = (event: MoneyEvent, keys: (string | false | null)[], fallback?: MoneyRoute) => {
    const route = resolveRoute(data, [event.key, ...keys], fallback);
    events.push({ ...event, accountId: route.accountId || null, excluded: !!route.excluded, planId: route.planId || null, occurrenceDate: day(route.occurrenceDate), status: 'ACTUAL' });
  };
  for (const income of data.incomes) {
    const nonCash = data.cycles.flatMap(c => c.credits || []).filter(c => c.incomeId === income.id).reduce((sum, c) => sum + cents(c.amount), 0);
    if (nonCash > cents(income.amount)) issues.push({ key: `credit:${income.id}`, message: `Revisa las bonificaciones de ${income.concept}.` });
    const value = Math.max(0, cents(income.amount) - nonCash);
    if (value) add({ key: `income:${income.id}`, date: day(income.date), cents: value, label: income.isEstimated ? `${income.concept} (estimado)` : income.concept, estimatedIncome: income.isEstimated, kind: income.receivableAccountId ? 'COLLECTION' : 'INCOME', incomeTypeId: income.incomeTypeId, receivableId: income.receivableAccountId, route: '/ingresos' }, [income.receivableAccountId && `receivable:${income.receivableAccountId}`, `incomeType:${income.incomeTypeId}`, 'default:income'].filter(Boolean));
  }
  for (const expense of data.expenses) {
    if (['CASH', 'DEBIT'].includes(expense.paymentMethod)) {
      const loan = data.payables.find(p => p.id === expense.payableAccountId && p.accountType === 'LOAN');
      add({ key: `expense:${expense.id}`, date: day(expense.date), cents: -cents(expense.amount), label: expense.concept, kind: 'EXPENSE', categoryId: expense.categoryId, payableId: expense.payableAccountId, subscriptionId: expense.subscriptionId, route: '/gastos' }, [expense.payableAccountId && `payable:${expense.payableAccountId}`, expense.subscriptionId && `subscription:${expense.subscriptionId}`, !loan && 'default:expense'].filter(Boolean), loan ? { excluded: true } : {});
    }
    if (expense.paymentMethod === 'DEBIT') {
      const event = events.find(e => e.key === `expense:${expense.id}`)!;
      event.accountId = expense.debitAccountId || null; event.excluded = false; event.debitExpenseId = expense.id;
    }
    if (cents(expense.cashContributionAmount) > 0) add({ key: `contribution:${expense.id}`, date: day(expense.date), cents: cents(expense.cashContributionAmount), label: `Efectivo recibido · ${expense.concept}`, kind: 'CONTRIBUTION', route: '/gastos' }, ['default:contribution']);
  }
  for (const cycle of data.cycles) {
    const identified = [...(cycle.payments || []).filter(p => !p.reversedAt).map(p => ({ ...p, source: 'captured' as const, accountId: undefined })), ...(cycle.moneyPayments || []).filter(p => !p.reversedAt).map(p => ({ ...p, source: 'money' as const }))];
    const total = cents(cycle.paidAmount), identifiedTotal = identified.reduce((sum, p) => sum + cents(p.amount), 0);
    if (identifiedTotal > total) { issues.push({ key: `payments:${cycle.id}`, message: `Los abonos de ${cycle.card?.name || 'tarjeta'} superan su total. Revisa el corte.` }); continue; }
    for (const payment of identified) add({ key: `payment:${payment.source}:${payment.id}`, paymentGroup: cycle.id, date: day(payment.date), cents: -cents(payment.amount), label: `Pago · ${cycle.card?.name || 'Tarjeta'}`, kind: 'CARD_PAYMENT', cardId: cycle.cardId, ownPaymentId: payment.source === 'money' ? payment.id : null, route: '/tarjetas' }, [`card:${cycle.cardId}`, 'default:card'], { accountId: payment.accountId });
    // Los abonos nuevos de Mi dinero conservan siempre su cuenta real.
    for (const payment of identified.filter(p => p.source === 'money')) { const e = events.find(e => e.key === `payment:money:${payment.id}`)!; e.accountId = payment.accountId; e.excluded = false; }
    if (total > identifiedTotal) {
      add({ key: `payment:legacy:${cycle.id}`, paymentGroup: cycle.id, date: day(cycle.paidAt), cents: -(total - identifiedTotal), label: `Pago acumulado · ${cycle.card?.name || 'Tarjeta'}`, kind: 'CARD_PAYMENT', cardId: cycle.cardId, approximateDate: true, route: '/tarjetas' }, [`card:${cycle.cardId}`, 'default:card']);
      if (!cycle.paidAt) issues.push({ key: `payment-date:${cycle.id}`, message: 'Hay un pago acumulado sin fecha; complétala en Tarjetas.' });
    }
  }
  for (const transfer of data.transfers.filter(t => !t.reversedAt)) {
    for (const [suffix, accountId, sign] of [['out', transfer.fromAccountId, -1], ['in', transfer.toAccountId, 1]] as const) events.push({ key: `transfer:${transfer.id}:${suffix}`, date: day(transfer.date), cents: sign * cents(transfer.amount), label: transfer.concept, kind: 'TRANSFER', accountId, transferId: transfer.id, excluded: false, status: 'ACTUAL' });
  }
  for (const withdrawal of (data.withdrawals || []).filter(t => !t.reversedAt)) events.push({ key: `withdrawal:${withdrawal.id}`, date: day(withdrawal.date), cents: -cents(withdrawal.amount), label: withdrawal.concept, kind: 'WITHDRAWAL', accountId: withdrawal.accountId, withdrawalId: withdrawal.id, excluded: false, status: 'ACTUAL', route: '/mi-dinero' });
  for (const e of events.filter(e => e.estimatedIncome && !e.excluded)) issues.push({ key: `estimated:${e.key}`, message: `${e.label}: el saldo incluye una cantidad aproximada. Confirma el importe real en Ingresos o Registro automático.` });
  return { events, issues };
}

// Los rendimientos son una vista calculada y reproducible, no ingresos bancarios
// inventados. Consultar varias veces o recuperar días sin abrir AFP no duplica nada.
export function buildSources(data: CalculationData, today = todayInMexico()) {
  const result = rawSources(data), pendingYields: Record<string, Prisma.Decimal> = {};
  for (const account of data.accounts || []) {
    let pending = new Prisma.Decimal(0);
    pendingYields[account.id] = pending;
    if (!yieldHistory(account).some(r => r.rule.autoYield)) continue;
    const references = new Map<string, BalanceReference>();
    for (const reconciliation of [...(account.reconciliations || [])].reverse()) {
      const snapshot = readSnapshot(reconciliation.snapshot);
      if (snapshot?.asOf && snapshot.openingBalance != null) references.set(day(snapshot.asOf), { ...snapshot, id: account.id, openingBalance: snapshot.openingBalance });
    }
    references.set(day(account.asOf), account);
    const ordered = [...references.values()].sort((a, b) => day(a.asOf).localeCompare(day(b.asOf)));
    const calculated: MoneyEvent[] = [];
    for (let date = day(ordered[0]!.asOf); date <= today; date = addDays(date, 1)) {
      const reference = [...ordered].reverse().find(r => day(r.asOf) <= date)!;
      const from = day(reference.asOf), rule = ruleAt(account, date);
      const cashAt = (target: string) => target < from ? cents(reference.openingBalance) : cents(accountBalances([reference], [...result.events.filter(e => !e.automaticYield), ...calculated.filter(e => e.date !== null && e.date > from)], target)[0]!.balance);
      const firstEnabled = yieldHistory(account).filter(r => r.rule.autoYield && r.from >= from).sort((a, b) => a.from.localeCompare(b.from))[0]?.from;
      const seedDate = firstEnabled && firstEnabled > from ? firstEnabled : from;
      const seededPending = date === seedDate && reference.yieldInitialPendingDays != null;
      if (seededPending) pending = dailyYieldCents(cashAt(addDays(date, -1)), rule, addDays(date, -1)).mul(reference.yieldInitialPendingDays!);
      // Lo indicado expresamente como pendiente aún no está en la referencia,
      // incluso si se capturó en un día de abono. Se liquida en el próximo.
      if (paysOn(rule, date) && !seededPending) {
        const value = roundedYieldCents(pending, rule);
        pending = new Prisma.Decimal(0);
        if (value > 0 && date > from && !isRecordedYield(account, result.events, date)) calculated.push({ key: `yield:auto:${account.id}:${date}`, date, cents: value, label: `Rendimiento calculado · ${account.name}`, kind: 'AUTO_YIELD', accountId: account.id, automaticYield: true, excluded: false, status: 'CALCULATED', route: '/mi-dinero' });
      }
      if (date < today && rule.autoYield) pending = pending.add(dailyYieldCents(cashAt(date), rule, date));
    }
    result.events.push(...calculated);
    pendingYields[account.id] = pending;
  }
  return { ...result, pendingYields };
}

// Agrupar abonos por corte impide que vincular evidencia al acumulado cree dinero.
export function exposure(events: MoneyEvent[], from: string, to: string, includeAutomatic = true) {
  const result: Exposure = {};
  for (const e of events) {
    if (e.excluded || !e.date || e.date < from || e.date > to || (!includeAutomatic && e.automaticYield)) continue;
    const key = e.paymentGroup ? `card-flow:${e.paymentGroup}` : e.key;
    result[key] ||= {};
    const account = e.accountId || 'UNASSIGNED';
    result[key]![account] = (result[key]![account] || 0) + e.cents;
  }
  return result;
}
export function accountBalances<T extends BalanceReference>(accounts: T[], events: MoneyEvent[], today: string) {
  return accounts.map(account => {
    const applicable = events.filter(e => !e.automaticYield || (e.date !== null && e.date > day(account.asOf)));
    const base = readBaseline(account.baseline), current = exposure(applicable, day(account.asOf), today);
    let delta = 0;
    for (const key of new Set([...Object.keys(base), ...Object.keys(current)])) {
      const now = current[key] || {}, before = base[key] || {};
      delta += (now[account.id] || 0) - (before[account.id] || 0);
      // Resolver una cuenta desconocida de la captura inicial no reaplica ese dinero.
      let unknown = Math.abs(before.UNASSIGNED || 0);
      for (const id of Object.keys(now).filter(id => id !== 'UNASSIGNED').sort()) {
        const newlyAssigned = Math.max(0, Math.abs(now[id]!) - Math.abs(before[id] || 0));
        const covered = Math.min(unknown, newlyAssigned);
        if (id === account.id) delta -= Math.sign(now[id]!) * covered;
        unknown -= covered;
      }
    }
    const balance = cents(account.openingBalance) + delta;
    const calculatedYield = applicable.filter(e => e.automaticYield && e.accountId === account.id && e.date !== null && e.date <= today && !e.excluded).reduce((sum, e) => sum + e.cents, 0);
    const estimatedIncomeAmount = applicable.filter(e => e.estimatedIncome && e.accountId === account.id && e.date !== null && e.date >= day(account.asOf) && e.date <= today && !e.excluded).reduce((sum, e) => sum + Math.max(0, e.cents - (base[e.key]?.[account.id] || 0)), 0);
    return { ...account, estimatedIncomeAmount: amount(estimatedIncomeAmount), balance: amount(balance), available: amount(balance - cents(account.reservedAmount)), delta: amount(delta), calculatedYield: amount(calculatedYield), recordedBalance: amount(balance - calculatedYield) };
  });
}
