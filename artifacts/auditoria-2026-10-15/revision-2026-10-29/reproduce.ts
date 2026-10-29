// Diagnóstico fechado: ejecuta fuentes actuales con Auth, HTTP y persistencia ficticios.
// No carga .env ni abre conexiones. Las aserciones describen defectos observados,
// no criterios de aceptación; fallarán cuando se corrijan esos defectos.
// Desde la raíz: node --import tsx artifacts/auditoria-2026-10-15/revision-2026-10-29/reproduce.ts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { getCyclePaymentState } from '../../../src/lib/calculations/cardCyclePayments';
import { financialLoader, testReply } from '../../../tests/helpers/financial-fixtures';
import { array, record } from '../../../tests/helpers/dynamic-values';
import { transformSource } from '../../../tests/helpers/load-source';

async function main() {
  const findings: Record<string, unknown>[] = [];
  const cycle = { cutDate: '2026-10-01T12:00:00Z', dueDate: '2026-10-15T12:00:00Z', statementAmount: 1000 };
  const originalTZ = process.env.TZ;
  const states: Record<string, { morning: string; evening: string }> = {};
  try {
    for (const zone of ['UTC', 'America/Mexico_City']) {
      process.env.TZ = zone;
      states[zone] = {
        morning: getCyclePaymentState(cycle, new Date('2026-10-15T12:01:00Z')).displayStatus,
        evening: getCyclePaymentState(cycle, new Date('2026-10-16T00:01:00Z')).displayStatus,
      };
    }
  } finally {
    if (originalTZ === undefined) delete process.env.TZ;
    else process.env.TZ = originalTZ;
  }
  assert.equal(states.UTC?.morning, 'PAYMENT_PENDING');
  assert.equal(states.UTC?.evening, 'OVERDUE');
  assert.equal(states['America/Mexico_City']?.evening, 'PAYMENT_PENDING');
  findings.push({ id: 'A04', status: 'PARCIAL', originalMorningDefectFixed: true,
    sameInstant: '2026-10-16T00:01:00Z', mexicoLocalTime: '2026-10-15 18:01', states,
    limit: 'Función real; no determina la zona configurada en producción.' });

  const dataset = Array.from({ length: 101 }, (_, i) => ({ id: `income-${i + 1}`, amount: 10 }));
  const persisted: Record<string, unknown>[] = [];
  const db = {
    income: {
      findMany: async ({ take }: { take: number }) => dataset.slice(0, take),
      create: async ({ data }: { data: Record<string, unknown> }) => { persisted.push(data); return { id: 'audit-income', ...data }; },
    },
    incomeType: { findFirst: async () => ({ id: 'audit-type' }) },
    category: { findFirst: async () => ({ id: 'audit-category' }) },
    dailyExpense: { create: async ({ data }: { data: Record<string, unknown> }) => { persisted.push(data); return { id: 'audit-expense', ...data }; } },
    $queryRaw: async () => [],
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => run(db),
  };
  const load = financialLoader({
    '@/lib/prisma': { prisma: db },
    'next/server': { NextResponse: { json: testReply } },
    '@/lib/calendar/schedule': { scheduleCalendarSync: () => {} },
    '@supabase/supabase-js': { createClient: () => ({ auth: {
      getUser: async () => ({ data: { user: { id: 'audit-user', email: 'audit@example.test' } }, error: null }),
    } }) },
  });
  const request = (body: Record<string, unknown> = {}) => ({ url: 'http://audit.invalid/api/incomes',
    method: 'POST', headers: new Headers({ authorization: 'Bearer audit-user' }), json: async () => body });
  const incomes = load('src/app/api/incomes/route.ts');
  const list = await incomes.GET({ ...request(), method: 'GET' });
  assert.equal(list.status, 200);
  assert.equal(array(list.body.incomes).length, 100);
  assert.equal(list.body.total, 1000);
  findings.push({ id: 'A07', status: 'PENDIENTE', realCount: 101, returnedCount: 100, realTotal: 1010,
    returnedTotal: list.body.total, limit: 'Handler real con findMany ficticio que respeta take.' });

  const input = { date: '2026-02-30', amount: '10.123', source: '   ', concept: '   ', incomeTypeId: 'audit-type' };
  const income = await incomes.POST(request(input));
  const expenses = load('src/app/api/expenses/route.ts');
  const expense = await expenses.POST(request({ date: input.date, amount: input.amount, concept: input.concept,
    paymentMethod: 'CASH', categoryId: 'audit-category' }));
  assert.equal(income.status, 200);
  assert.equal(expense.status, 200);
  for (const value of [record(income.body.income), record(expense.body.expense)]) {
    assert.equal(String(value.date).slice(0, 10), '2026-03-02');
    assert.equal(value.amount, 10.123);
    assert.equal(value.concept, '');
  }
  findings.push({ id: 'A08', status: 'PENDIENTE', input,
    income: { httpStatus: income.status, value: income.body.income },
    expense: { httpStatus: expense.status, value: expense.body.expense }, writes: persisted.length,
    limit: 'Handlers y validadores reales; datos en memoria. No afirma cómo PostgreSQL redondearía el Decimal.' });

  const component = fs.readFileSync(path.resolve('src/components/gastos/GastosContent.tsx'), 'utf8');
  const start = component.indexOf('  async function loadExpenses(');
  const end = component.indexOf('  async function loadReceivables(', start);
  assert.ok(start > 0 && end > start);
  let currentFilter = 'A';
  let rendered: unknown;
  let loading = false;
  const calls: { url: string; resolve: (value: unknown) => void }[] = [];
  const runtime = vm.createContext({
    navigator: { onLine: true },
    buildExpensesUrl: () => `/api/expenses?filter=${currentFilter}`,
    lastExpensesUrlRef: { current: null },
    setIsExpensesLoading: (value: boolean) => { loading = value; },
    setExpenses: (value: unknown) => { rendered = value; }, setAvailableMonths: () => {},
    apiFetch: (url: string) => new Promise(resolve => { calls.push({ url, resolve }); }),
  });
  vm.runInContext(transformSource(component.slice(start, end), 'loadExpenses.ts'), runtime);
  assert.equal(typeof runtime.loadExpenses, 'function');
  const first: unknown = Reflect.apply(runtime.loadExpenses, undefined, ['audit-user']);
  currentFilter = 'B';
  const second: unknown = Reflect.apply(runtime.loadExpenses, undefined, ['audit-user']);
  assert.equal(calls.length, 2);
  calls[1]?.resolve({ ok: true, json: async () => ({ expenses: ['B'], availableMonths: [] }) });
  await second;
  assert.deepEqual(rendered, ['B']);
  const loadingWhileFirstPending = loading;
  calls[0]?.resolve({ ok: true, json: async () => ({ expenses: ['A'], availableMonths: [] }) });
  await first;
  assert.deepEqual(rendered, ['A']);
  findings.push({ id: 'A09', status: 'PENDIENTE', currentFilter, rendered, loadingWhileFirstPending,
    requestOrder: calls.map(call => call.url), responseOrder: ['B', 'A'],
    limit: 'Función loadExpenses extraída literalmente y transformada con esbuild; HTTP/estado simulados, sin navegador.' });
  const output = { reviewedAt: new Date().toISOString(), source: 'working tree', productionAccess: false,
    persistence: 'memory only', findings };
  fs.writeFileSync(path.join(__dirname, 'reproductions.json'), JSON.stringify(output, null, 2) + '\n');
  console.log(JSON.stringify(output, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
