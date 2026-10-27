import { amount, cents, buildSources, accountBalances, resolveRoute } from '@/lib/money/sources';
import { day, addDays, addMonths, monthDay, monthRange } from '@/lib/money/dates';
import { getDebtAccountState } from '@/lib/calculations/debtAccounts';
import { calculateCycleAmount } from '@/lib/calculations/cardCycles';
import { buildSubscriptionCharges } from '@/lib/subscriptionCharges';
import { Prisma } from '@prisma/client';
import { ruleAt, dailyYieldCents, roundedYieldCents, paysOn, isRecordedYield, previousBankingDay } from '@/lib/money/yieldRules';
import { budgetExpenses, budgetPaymentParts } from '@/lib/money/budgets';

function planPayDate(plan, date) { return plan.kind === 'PAYROLL' && plan.payrollBusinessDays ? previousBankingDay(date) : date; }
export function planDates(plan, from, to) {
  if (!plan.isActive) return [];
  const start = day(plan.startDate), end = day(plan.endDate);
  if (!plan.frequencyMonths) { const date = planPayDate(plan, start); return date >= from && date <= to && (!end || start <= end) ? [date] : []; }
  const [sy, sm] = start.split('-').map(Number);
  // Un pago del primer día del mes siguiente puede adelantarse a este mes.
  const lookahead = plan.kind === 'PAYROLL' && plan.payrollBusinessDays ? `${addMonths(to, 1)}-01` : to;
  return [...new Set(monthRange(from, lookahead).flatMap(month => {
    const [y, m] = month.split('-').map(Number);
    if ((y * 12 + m - sy * 12 - sm) % plan.frequencyMonths !== 0) return [];
    return [...new Set(plan.days.map(n => monthDay(month, n)))].filter(d => d >= start && (!end || d <= end)).map(d => planPayDate(plan, d)).filter(d => d >= from && d <= to);
  }))].sort();
}
function syntheticCycles(data, today, end) {
  const cycles = [...data.cycles];
  for (const card of data.cards) {
    for (const month of monthRange(`${addMonths(today, -1)}-01`, end)) {
      if (cycles.some(c => c.cardId === card.id && `${c.year}-${String(c.month).padStart(2, '0')}` === month)) continue;
      const cutDate = monthDay(month, card.usualCutDay);
      if (cutDate < today) continue;
      const previous = cycles.filter(c => c.cardId === card.id && day(c.cutDate) < cutDate).sort((a, b) => day(b.cutDate).localeCompare(day(a.cutDate)))[0];
      const startDate = addDays(previous ? day(previous.cutDate) : monthDay(addMonths(month, -1), card.usualCutDay), 1);
      let dueDate = monthDay(month, card.usualDueDay);
      if (dueDate <= cutDate) dueDate = monthDay(addMonths(month, 1), card.usualDueDay);
      cycles.push({ id: `projected:${card.id}:${month}`, cardId: card.id, card, year: Number(month.slice(0, 4)), month: Number(month.slice(5, 7)), startDate, cutDate, dueDate, projected: true, credits: [] });
    }
  }
  return cycles;
}
export function buildForecast(data, today, options = {}) {
  const end = monthDay(addMonths(today, 11), 31), months = monthRange(today, end);
  const scenario = { collectionDelay: 0, variablePercent: 100, stopPayrollDate: '', extraAmount: 0, extraDate: '', extraAccountId: '', ...options };
  const { events: actual, issues, pendingYields } = buildSources(data, today);
  const accounts = accountBalances(data.accounts, actual, today).map(a => ({ ...a, pendingYield: amount(roundedYieldCents(pendingYields[a.id] || new Prisma.Decimal(0), ruleAt(a, today))) }));
  const future = actual.filter(e => !e.excluded && e.date > today && e.date <= end).map(e => ({ ...e, status: 'REGISTERED_FUTURE' }));
  const plannedCardExpenses = [];
  const add = event => { if (event.cents && event.date <= end) future.push({ ...event, date: event.date < today ? today : event.date, originalDate: event.date, status: event.status || 'EXPECTED' }); };
  const resolve = (keys, fallback = {}) => resolveRoute(data, keys, fallback);
  const currentStart = `${today.slice(0, 7)}-01`;
  const planOccurrences = [], variableBudgets = [];
  if (!data.plans.some(p => p.isActive && p.kind === 'VARIABLE')) issues.push({ key: 'no-variable-budget', message: 'Sin presupuesto variable: la proyección solo contempla los gastos y compromisos definidos.' });
  for (const plan of data.plans.filter(p => p.isActive)) {
    const isIncome = ['INCOME', 'PAYROLL'].includes(plan.kind);
    if (plan.kind === 'VARIABLE') {
      const recordedByDate = new Map();
      for (const expense of budgetExpenses(data, plan.categoryId)) {
        const date = day(expense.date);
        recordedByDate.set(date, (recordedByDate.get(date) || 0) + expense.personalCents);
      }
      const monthlyAmount = Math.max(0, Math.round(cents(plan.amount) * scenario.variablePercent / 100));
      let pendingConsumption = 0;
      for (const month of months) {
        if (month < day(plan.startDate).slice(0, 7) || (plan.endDate && month > day(plan.endDate).slice(0, 7))) continue;
        const start = [today, day(plan.startDate), `${month}-01`].sort().at(-1), last = [end, day(plan.endDate) || end, monthDay(month, 31)].sort()[0];
        const daysInMonth = Number(monthDay(month, 31).slice(-2));
        for (let date = start; date <= last; date = addDays(date, 1)) {
          const ordinal = Number(date.slice(-2));
          // Ritmo diario, no obligación de agotar el presupuesto. El redondeo
          // acumulado conserva los centavos y la cuota de cada fecha al releer.
          const expected = Math.round(monthlyAmount * ordinal / daysInMonth) - Math.round(monthlyAmount * (ordinal - 1) / daysInMonth);
          const value = Math.max(0, expected - (recordedByDate.get(date) || 0));
          if (!value) continue;
          pendingConsumption += value;
          const event = { key: `budget:${plan.id}:${date}`, date, cents: -value, label: plan.name, kind: 'VARIABLE', accountId: plan.accountId, planId: plan.id, status: 'ESTIMATED' };
          const parts = plan.paymentMix ? budgetPaymentParts(value, plan.paymentMix) : [{ cardId: plan.cardId || null, cents: value }];
          let immediate = 0;
          for (const part of parts) {
            if (part.cardId && data.cards.some(card => card.id === part.cardId)) plannedCardExpenses.push({ id: `${event.key}:${part.cardId}`, cardId: part.cardId, paymentMethod: 'CARD', date, amount: amount(part.cents), concept: plan.name });
            else {
              if (part.cardId && !issues.some(issue => issue.key === `budget-card:${plan.id}:${part.cardId}`)) issues.push({ key: `budget-card:${plan.id}:${part.cardId}`, message: `Una tarjeta de ${plan.name} ya no existe; su gasto se estima como salida inmediata. Revisa la previsión.` });
              immediate += part.cents;
            }
          }
          if (immediate) add({ ...event, cents: -immediate });
        }
      }
      variableBudgets.push({ id: plan.id, categoryId: plan.categoryId, name: plan.name, monthlyAmount: amount(monthlyAmount), recordedAmount: amount([...recordedByDate].filter(([date]) => date.slice(0, 7) === today.slice(0, 7) && date <= today).reduce((sum, [, value]) => sum + value, 0)), pendingConsumption: amount(pendingConsumption), referenceMonths: plan.paymentMix?.referenceMonths || null });
      continue;
    }
    const effectiveStart = planPayDate(plan, day(plan.startDate)), effectiveEnd = plan.endDate ? planPayDate(plan, day(plan.endDate)) : null;
    const dates = planDates(plan, plan.frequencyMonths ? currentStart : effectiveStart, end);
    const autoPaid = new Map();
    if (isIncome && plan.incomeTypeId) {
      for (const e of actual.filter(e => e.incomeTypeId === plan.incomeTypeId && !e.planId && !e.excluded && e.date >= effectiveStart && (!effectiveEnd || e.date <= effectiveEnd))) {
        const month = e.date.slice(0, 7); autoPaid.set(month, (autoPaid.get(month) || 0) + Math.abs(e.cents));
      }
    }
    for (const date of dates) {
      const resolution = (plan.occurrences || []).find(o => day(o.date) === date);
      const explicit = actual.filter(e => e.planId === plan.id && e.occurrenceDate === date && !e.excluded).reduce((sum, e) => sum + Math.abs(e.cents), 0);
      const pool = autoPaid.get(date.slice(0, 7)) || 0;
      // Una fecha omitida no puede consumir el ingreso destinado a la siguiente.
      const auto = resolution?.status === 'SKIPPED' ? 0 : Math.min(Math.max(0, cents(plan.amount) - explicit), pool);
      autoPaid.set(date.slice(0, 7), pool - auto);
      const pending = Math.max(0, cents(plan.amount) - explicit - auto);
      planOccurrences.push({ planId: plan.id, date, label: plan.name, pending: amount(pending), status: resolution?.status || (pending ? 'PENDING' : 'MATCHED'), kind: plan.kind });
      if (resolution || !pending || (plan.kind === 'PAYROLL' && scenario.stopPayrollDate && date >= scenario.stopPayrollDate)) continue;
      const event = { key: `plan:${plan.id}:${date}`, date, cents: isIncome ? pending : -pending, label: plan.name, kind: plan.kind, accountId: plan.accountId, planId: plan.id };
      if (plan.cardId) {
        if (date < today) issues.push({ key: event.key, message: `Confirma u omite ${plan.name} del ${date} antes de proyectar su tarjeta.` });
        else plannedCardExpenses.push({ id: event.key, date, cardId: plan.cardId, paymentMethod: 'CARD', amount: amount(pending), concept: plan.name });
      } else add(event);
    }
  }
  for (const month of months) {
    for (const charge of buildSubscriptionCharges({ subscriptions: data.subscriptions, cycles: data.cycles, month, today: end })) {
      if (charge.paymentMethod !== 'CASH' || charge.status !== 'PENDING') continue;
      const route = resolve([`subscription:${charge.subscriptionId}`, 'default:expense']);
      if (!route.excluded) add({ key: `subscription:${charge.subscriptionId}:${month}`, date: charge.date, cents: -cents(charge.amount), label: charge.name, kind: 'SUBSCRIPTION', accountId: route.accountId || null });
    }
  }
  for (const receivable of data.receivables) {
    const state = getDebtAccountState(receivable, receivable.incomes);
    if (state.status !== 'ACTIVE') continue;
    // La exclusión de una previsión no debe ocultar abonos reales. Estos
    // conservan sus reglas de ingreso en buildSources.
    const route = resolve([`receivable-forecast:${receivable.id}`, `receivable:${receivable.id}`, 'default:income']);
    if (route.excluded) continue;
    let balance = cents(state.pendingBalance);
    if (!receivable.expectedMonthlyPayment || !receivable.expectedChargeDays.length) { issues.push({ key: `receivable:${receivable.id}`, message: `Falta calendario de cobro: ${receivable.concept}.` }); continue; }
    for (const month of months) {
      let paid = receivable.incomes.filter(i => day(i.date).startsWith(month)).reduce((sum, i) => sum + cents(i.amount), 0);
      const dates = [...new Set(receivable.expectedChargeDays.map(n => monthDay(month, n)))].sort();
      for (let i = 0; i < dates.length && balance > 0; i++) {
        // El campo legado representa el importe de cada fecha de cobro,
        // igual que Calendar y Avisos importantes, no un total a dividir.
        const nominal = cents(receivable.expectedMonthlyPayment);
        const covered = Math.min(paid, nominal); paid -= covered;
        if (dates[i] < day(receivable.originDate)) continue;
        const value = Math.min(balance, nominal - covered); balance -= value;
        add({ key: `receivable:${receivable.id}:${dates[i]}`, date: addDays(dates[i] < today ? today : dates[i], scenario.collectionDelay), cents: value, label: `Cobrar · ${receivable.person?.name || receivable.concept}`, kind: 'COLLECTION', accountId: route.accountId || null });
      }
    }
  }
  for (const payable of data.payables) {
    const state = getDebtAccountState(payable, payable.dailyExpenses);
    if (state.status !== 'ACTIVE') continue;
    const loan = payable.accountType === 'LOAN';
    const route = resolve([`payable:${payable.id}`, ...(!loan ? ['default:expense'] : [])], loan ? { excluded: true } : {});
    if (route.excluded) continue;
    const quota = cents(loan ? payable.paymentAmount : payable.expectedMonthlyPayment);
    if (payable.expectedDate && day(payable.expectedDate) < today) {
      add({ key: `payable-overdue:${payable.id}`, date: day(payable.expectedDate), cents: -cents(state.pendingBalance), label: `Vencida · ${payable.concept}`, kind: 'PAYABLE', accountId: route.accountId || null, status: 'ESTIMATED' });
      if (loan) issues.push({ key: `matured-loan:${payable.id}`, message: `Préstamo vencido: ${payable.concept}. Confirma el importe exigible con el banco.` });
      continue;
    }
    if (!quota) {
      if (!payable.expectedDate) { issues.push({ key: `payable:${payable.id}`, message: `Falta fecha o cuota: ${payable.concept}.` }); continue; }
      add({ key: `payable:${payable.id}`, date: day(payable.expectedDate), cents: -cents(state.pendingBalance), label: payable.concept, kind: 'PAYABLE', accountId: route.accountId || null }); continue;
    }
    const days = loan ? payable.paymentDays : [Number(day(payable.expectedDate)?.slice(-2) || 1)];
    if (!days.length || (loan && (payable.totalPayments == null || payable.paymentsMade == null))) issues.push({ key: `loan-calendar:${payable.id}`, message: `Revisa días y cuotas restantes: ${payable.concept}.` });
    let remaining = loan ? Math.max(0, (payable.totalPayments ?? 1000) - (payable.paymentsMade ?? 0)) : Infinity, balance = cents(state.pendingBalance);
    for (const month of months) {
      let paid = payable.dailyExpenses.filter(e => day(e.date).startsWith(month)).reduce((sum, e) => sum + cents(e.amount), 0);
      for (const date of [...new Set(days.map(n => monthDay(month, n)))].sort()) {
        if (date < day(payable.firstPaymentDate || payable.originDate) || (payable.expectedDate && date > day(payable.expectedDate))) continue;
        const covered = Math.min(paid, quota); paid -= covered;
        const value = loan ? quota - covered : Math.min(balance, quota - covered);
        if (!value || remaining <= 0 || (!loan && balance <= 0)) continue;
        remaining--; balance -= value;
        add({ key: `payable:${payable.id}:${date}`, date, cents: -value, label: payable.concept, kind: 'PAYABLE', accountId: route.accountId || null });
      }
    }
  }
  const cycles = syntheticCycles(data, today, end);
  for (const cycle of cycles) {
    const confirmed = cycle.statementAmount != null && day(cycle.cutDate) <= today;
    let total;
    try {
      total = confirmed ? cents(cycle.statementAmount) : cents(calculateCycleAmount({ cycle, expenses: [...data.expenses, ...plannedCardExpenses], subscriptions: data.subscriptions, purchases: data.purchases, includeBreakdown: false }).calculatedAmount);
    } catch {
      issues.push({ key: `cycle-data:${cycle.id}`, message: `No se pudo calcular un corte de ${cycle.card?.name || 'tarjeta'}; revisa sus cargos y bonificaciones.` });
      continue;
    }
    const pending = Math.max(0, total - cents(cycle.postCutCreditAmount) - cents(cycle.paidAmount));
    if (!pending) continue;
    const route = resolve([`card:${cycle.cardId}`, 'default:card']);
    if (!route.excluded) add({ key: `card-due:${cycle.id}`, date: day(cycle.dueDate), cents: -pending, label: `Tarjeta · ${cycle.card?.name || data.cards.find(c => c.id === cycle.cardId)?.name || ''}`, kind: 'CARD_DUE', accountId: route.accountId || null, status: confirmed ? 'COMMITTED' : 'ESTIMATED' });
  }
  if (scenario.extraAmount > 0 && scenario.extraDate) add({ key: 'scenario:extra', date: scenario.extraDate, cents: -cents(scenario.extraAmount), label: 'Compra simulada', kind: 'SCENARIO', accountId: scenario.extraAccountId || null });
  const accountIds = new Set(accounts.map(a => a.id));
  const oldest = accounts.map(a => day(a.asOf)).sort()[0] || today;
  for (const e of actual) {
    const key = e.paymentGroup ? `card-flow:${e.paymentGroup}` : e.key;
    e.includedInReference = !!e.date && accounts.length > 0 && accounts.every(a => e.date < day(a.asOf) || (e.date === day(a.asOf) && Object.values(a.baseline?.[key] || {}).reduce((sum, value) => sum + Math.abs(value), 0) >= Math.abs(e.cents)));
    e.needsAccount = !e.excluded && (!accountIds.has(e.accountId) || !e.date) && (!e.date || e.date >= oldest) && !e.includedInReference;
  }
  const unassigned = actual.filter(e => e.needsAccount);
  const missingFuture = future.filter(e => !accountIds.has(e.accountId));
  if (unassigned.length) issues.push({ key: 'unassigned', message: `${unassigned.length} movimientos sin cuenta o fecha. Los saldos están incompletos.` });
  if (missingFuture.length) issues.push({ key: 'future-unassigned', message: `${missingFuture.length} previsiones sin cuenta. Asígnalas para incluirlas en los saldos.` });
  for (const card of data.cards) {
    const overlapping = cycles.filter(c => c.cardId === card.id).sort((a, b) => day(a.startDate).localeCompare(day(b.startDate)));
    const pairs = overlapping.flatMap((cycle, index) => index && day(cycle.startDate) <= day(overlapping[index - 1].cutDate) ? [[overlapping[index - 1], cycle]] : []);
    if (pairs.length) {
      const historical = pairs.every(pair => pair.every(cycle => day(cycle.cutDate) < today && day(cycle.dueDate) < today && cycle.statementAmount != null && cents(cycle.paidAmount) + cents(cycle.postCutCreditAmount) >= cents(cycle.statementAmount)));
      issues.push({ key: `overlap:${card.id}`, scope: historical ? 'HISTORICAL' : 'PROJECTION', message: `Revisa períodos superpuestos de ${card.name}.` });
    }
  }
  const balances = Object.fromEntries(accounts.map(a => [a.id, cents(a.balance)]));
  const reserve = accounts.reduce((sum, a) => sum + cents(a.reservedAmount), 0), daily = [];
  const accrued = Object.fromEntries(accounts.map(a => [a.id, pendingYields[a.id] || new Prisma.Decimal(0)]));
  for (let date = today; date <= end; date = addDays(date, 1)) {
    let incoming = 0, outgoing = 0;
    const flows = future.filter(e => e.date === date && accountIds.has(e.accountId));
    // El abono usa los días previamente acumulados. Los movimientos de hoy
    // cambian el capital de hoy, cuyo rendimiento se abonará después.
    for (const account of accounts) {
      const rule = ruleAt(account, date);
      if (date <= today || !paysOn(rule, date)) continue;
      const value = isRecordedYield(account, actual, date) ? 0 : roundedYieldCents(accrued[account.id], rule);
      accrued[account.id] = new Prisma.Decimal(0);
      if (value > 0) {
        balances[account.id] += value; incoming += value;
        future.push({ key: `yield:${account.id}:${date}`, date, cents: value, label: `Rendimiento · ${account.name}`, kind: 'YIELD', accountId: account.id, status: 'ESTIMATED' });
      }
    }
    for (const e of flows) {
      balances[e.accountId] += e.cents;
      if (e.kind !== 'TRANSFER') { if (e.cents > 0) incoming += e.cents; else outgoing -= e.cents; }
    }
    for (const account of accounts) accrued[account.id] = accrued[account.id].add(dailyYieldCents(balances[account.id], ruleAt(account, date), date));
    const total = Object.values(balances).reduce((a, b) => a + b, 0);
    daily.push({ date, balance: amount(total), available: amount(total - reserve), incoming: amount(incoming), outgoing: amount(outgoing), accounts: Object.fromEntries(Object.entries(balances).map(([id, n]) => [id, amount(n)])) });
  }
  const starting = accounts.reduce((sum, a) => sum + cents(a.balance), 0);
  const monthly = months.map((month, i) => {
    const days = daily.filter(d => d.date.startsWith(month));
    return { month, opening: i ? daily.filter(d => d.date.startsWith(months[i - 1])).at(-1).balance : amount(starting), incoming: amount(days.reduce((s, d) => s + cents(d.incoming), 0)), outgoing: amount(days.reduce((s, d) => s + cents(d.outgoing), 0)), closing: days.at(-1).balance, minimum: Math.min(...days.map(d => d.balance)) };
  });
  const minimum = daily.reduce((min, d) => d.balance < min.balance ? d : min, { date: today, balance: amount(starting), available: amount(starting - reserve) });
  return {
    today, end, accounts, actual: actual.map(e => ({ ...e, amount: amount(e.cents) })), events: future.sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key)).map(e => ({ ...e, amount: amount(e.cents) })),
    daily, monthly, planOccurrences, variableBudgets, issues, summary: { balance: amount(starting), available: amount(starting - reserve), reserved: amount(reserve), minimum: minimum.balance, minimumDate: minimum.date, belowReserveDate: starting < reserve ? today : daily.find(d => d.available < 0)?.date || null, zeroDate: starting <= 0 ? today : daily.find(d => d.balance <= 0)?.date || null },
    accountShortfalls: accounts.map(a => ({ id: a.id, name: a.name, date: cents(a.balance) < cents(a.reservedAmount) ? today : daily.find(d => cents(d.accounts[a.id]) < cents(a.reservedAmount))?.date || null })).filter(a => a.date),
  };
}
