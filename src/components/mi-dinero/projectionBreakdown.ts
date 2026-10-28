import type { ForecastResponse, DisplayEvent } from '@/lib/money/responses';

type BreakdownEvent = DisplayEvent & { phase?: 'CALCULATED' | 'REGISTERED' | 'EXPECTED' };
type Row = { key: string; label: string; accountName: string; status: NonNullable<DisplayEvent['status']>; phase: NonNullable<BreakdownEvent['phase']>; cents: number; dates: Set<string | null>; approximateDate: boolean };
type Account = { id: string; name: string; yieldIncomeTypeId?: string | null };
type Plan = { id: string; name: string; kind: string; categoryId?: string | null };
const groups = [
  { id: 'income', title: 'Entradas', description: 'Nómina, cobros y otros ingresos' },
  { id: 'payments', title: 'Pagos y gastos', description: 'Tarjetas, deudas y gastos con fecha' },
  { id: 'variable', title: 'Gasto variable', description: 'Salidas directas por categoría' },
  { id: 'yield', title: 'Rendimientos', description: 'Total por cuenta' },
  { id: 'transfers', title: 'Transferencias entre tus cuentas', description: 'Redistribuyen tu dinero entre cuentas' },
];

// El historial puede estar incluido en el saldo de referencia: se muestra como
// composición del mes, sin volver a aplicarlo a los saldos de la proyección.
export function monthlyBreakdownEvents(forecast: ForecastResponse, month: string, accountId = 'ALL'): BreakdownEvent[] {
  const inScope = (event: DisplayEvent) => event.date?.startsWith(month) && (accountId === 'ALL' || event.accountId === accountId);
  const registered = forecast.actual.filter(event => event.date !== null && event.date <= forecast.today && inScope(event)).map(event => ({
    ...event, phase: event.automaticYield || event.kind === 'AUTO_YIELD' ? 'CALCULATED' as const : 'REGISTERED' as const,
  }));
  const registeredKeys = new Set(registered.filter(event => event.key).map(event => event.key));
  const expected = forecast.events.filter(event => inScope(event) && !registeredKeys.has(event.key)).map(event => ({ ...event, phase: 'EXPECTED' as const }));
  return [...registered, ...expected];
}

// Resume movimientos existentes. El consumo con crédito aparece únicamente al
// pagar su tarjeta; no se reconstruyen gastos ni rendimientos históricos ausentes.
export function buildProjectionBreakdown(events: BreakdownEvent[], accounts: Account[], plans: Plan[] = [], categories: { id: string; name: string }[] = []) {
  const accountsById = new Map(accounts.map(account => [account.id, account]));
  const accountNames = new Map(accounts.map(account => [account.id, account.name]));
  const plansById = new Map(plans.map(plan => [plan.id, plan]));
  const categoryNames = new Map(categories.map(category => [category.id, category.name]));
  const variableCategories = new Map(plans.filter(plan => plan.kind === 'VARIABLE' && plan.categoryId).map(plan => [plan.categoryId, categoryNames.get(plan.categoryId || '') || plan.name]));
  const result = new Map(groups.map(group => [group.id, { ...group, cents: 0, registeredCents: 0, calculatedCents: 0, expectedCents: 0, rows: new Map<string, Row>() }]));
  let unassignedCount = 0;

  for (const event of events) {
    const value = Math.round(event.amount * 100);
    if (event.excluded || !value) continue;
    if (!accountNames.has(event.accountId || '')) { unassignedCount++; continue; }
    const account = accountsById.get(event.accountId || '')!;
    const isYield = ['YIELD', 'AUTO_YIELD'].includes(event.kind) || (event.kind === 'INCOME' && account.yieldIncomeTypeId && event.incomeTypeId === account.yieldIncomeTypeId);
    const isVariable = event.kind === 'VARIABLE' || (event.kind === 'EXPENSE' && variableCategories.has(event.categoryId || '') && !event.subscriptionId && !event.payableId && !event.planId);
    const id = event.kind === 'TRANSFER' ? 'transfers'
      : isYield ? 'yield'
      : isVariable ? 'variable'
      : value > 0 ? 'income' : 'payments';
    const group = result.get(id)!;
    const plan = plansById.get(event.planId || '');
    const categoryId = event.categoryId || plan?.categoryId;
    const concept = id === 'yield' ? event.accountId
      : id === 'variable' ? categoryId || event.planId || event.label
      : event.label;
    const status = event.status || 'EXPECTED';
    const phase = event.phase || (status === 'CALCULATED' ? 'CALCULATED' : status === 'ACTUAL' ? 'REGISTERED' : 'EXPECTED');
    const key = JSON.stringify([concept, event.accountId, phase, status, event.kind, Math.sign(value)]);
    if (!group.rows.has(key)) group.rows.set(key, {
      key, label: id === 'yield' ? account.name : id === 'variable' ? categoryNames.get(categoryId || '') || variableCategories.get(categoryId || '') || event.label : event.label,
      accountName: account.name, status, phase, cents: 0, dates: new Set(), approximateDate: false,
    });
    const row = group.rows.get(key)!;
    row.cents += value;
    row.dates.add(event.date);
    row.approximateDate ||= !!event.approximateDate;
    group.cents += value;
    group[phase === 'REGISTERED' ? 'registeredCents' : phase === 'CALCULATED' ? 'calculatedCents' : 'expectedCents'] += value;
  }

  return {
    unassignedCount,
    groups: [...result.values()].filter(group => group.rows.size).map(group => ({
      ...group,
      amount: group.cents / 100,
      registeredAmount: group.registeredCents / 100,
      calculatedAmount: group.calculatedCents / 100,
      expectedAmount: group.expectedCents / 100,
      rows: [...group.rows.values()].map(row => ({ ...row, amount: row.cents / 100, dates: [...row.dates].sort() }))
        .sort((a, b) => ['REGISTERED', 'CALCULATED', 'EXPECTED'].indexOf(a.phase) - ['REGISTERED', 'CALCULATED', 'EXPECTED'].indexOf(b.phase) || Math.abs(b.cents) - Math.abs(a.cents) || a.label.localeCompare(b.label, 'es')),
    })),
  };
}
