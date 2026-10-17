// Reproducciones de auditoría: código real con persistencia ficticia; no usa red ni BD.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const findings = [];
const source = file => fs.readFileSync(path.join(root, file), 'utf8');
function load(file, bindings = {}) {
  const context = vm.createContext({ URL, Date, console: { error() {} },
    NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) },
    SubscriptionChargeError: class extends Error {}, cycleCreditSelect: {}, ...bindings });
  vm.runInContext(source(file).replace(/^import[\s\S]*?from\s+["'][^"']+["'];\r?\n/gm, '').replace(/^export /gm, ''), context);
  return context;
}
const request = (body, query = '') => ({ url: `http://audit.invalid/api/test${query}`, headers: new Map(), json: async () => body });
const record = (id, finding, evidence) => findings.push({ id, finding, evidence });
function memory() {
  const data = new Map();
  return { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value) };
}

(async () => {
  // Una lectura anónima llega a Prisma y devuelve los datos del usuario solicitado.
  let requestedOwner;
  const anonymous = load('src/app/api/expenses/route.js', { prisma: { dailyExpense: {
    findMany: async options => { requestedOwner = options.where.userId; return [{ id: 'private-expense', amount: 70, date: '2026-10-15' }]; },
  } } });
  const result = await anonymous.GET(request(null, '?userId=victim'));
  assert.equal(result.status, 200); assert.equal(requestedOwner, 'victim');
  record('A01', 'Lectura sin sesión', { status: result.status, owner: requestedOwner, returned: result.body.expenses.length });
  let deleted;
  const cards = load('src/app/api/cards/route.js', { prisma: { card: { delete: async options => { deleted = options.where; } } } });
  const deletion = await cards.DELETE(request(null, '?id=other-users-card'));
  assert.equal(deletion.status, 200); assert.deepEqual(Object.keys(deleted), ['id']);
  record('A01b', 'Borrado sin sesión ni filtro de propietario', { status: deletion.status, where: deleted });

  // Dos pestañas leen la misma cola antes de que termine el primer envío.
  let requests = 0;
  const bodies = [];
  const offline = load('src/lib/offlineExpenses.js', { window: { localStorage: memory() },
    fetch: async (_url, options) => { requests++; bodies.push(JSON.parse(options.body)); return { ok: true, json: async () => ({ expense: { id: `db-${requests}` } }) }; } });
  offline.addOfflineExpense('user', { concept: 'Compra única', amount: 100 });
  await Promise.all([offline.syncOfflineExpenses('user'), offline.syncOfflineExpenses('user')]);
  assert.equal(requests, 2); assert.equal(bodies[0].clientId, undefined);
  record('A02', 'Sincronización concurrente duplica envíos', { logicalExpenses: 1, postRequests: requests, sendsClientId: false });

  // Una nueva captura, añadida durante el envío, desaparece al sobrescribir la cola.
  let release;
  const midSync = load('src/lib/offlineExpenses.js', { window: { localStorage: memory() },
    fetch: () => new Promise(resolve => { release = () => resolve({ ok: true, json: async () => ({ expense: { id: 'saved' } }) }); }) });
  midSync.addOfflineExpense('user', { concept: 'Primero', amount: 10 });
  const sync = midSync.syncOfflineExpenses('user');
  midSync.addOfflineExpense('user', { concept: 'Nuevo mientras sincroniza', amount: 20 });
  assert.equal(midSync.readOfflineExpenses('user').length, 2);
  release(); await sync;
  assert.equal(midSync.readOfflineExpenses('user').length, 0);
  record('A02b', 'Captura añadida durante sincronización se pierde', { unsentNewExpenses: 1, remainingQueue: 0 });

  let updated;
  const cycles = load('src/app/api/card-cycles/route.js', { prisma: { cardCycle: {
    update: async options => { updated = { statementAmount: 1000, ...options.data }; return updated; },
  } } });
  const partial = await cycles.PATCH(request({ id: 'cycle', action: 'MARK_AS_PAID', paidAt: '2026-10-15', paidAmount: '1' }));
  assert.equal(partial.status, 200); assert.equal(updated.status, 'PAID');
  record('A03', 'Abono insuficiente marca el corte como pagado', { statementAmount: 1000, paidAmount: updated.paidAmount, status: updated.status });
  const zero = await cycles.PATCH(request({ id: 'cycle', action: 'UPDATE_STATEMENT', statementAmount: 0 }));
  const stringZero = await cycles.PATCH(request({ id: 'cycle', action: 'UPDATE_STATEMENT', statementAmount: '0' }));
  assert.equal(zero.status, 400); assert.equal(stringZero.status, 200);
  record('A03b', 'Estado de cuenta cero depende del tipo JSON', { numericZeroStatus: zero.status, stringZeroStatus: stringZero.status });
  const zeroPayment = await cycles.PATCH(request({ id: 'cycle', action: 'MARK_AS_PAID', paidAt: '2026-10-15', paidAmount: '0' }));
  assert.equal(zeroPayment.status, 400);
  record('A03c', 'Corte con importe cero no admite cierre mediante pago cero', { paidAmount: '0', responseStatus: zeroPayment.status });

  class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : ['2026-10-15T12:01:00Z'])); } }
  const fixedCycles = load('src/app/api/card-cycles/route.js', { Date: FixedDate });
  const early = fixedCycles.getDisplayStatus({ dueDate: '2026-10-15T12:00:00Z', cutDate: '2026-10-01T12:00:00Z', statementAmount: 1000 });
  assert.equal(early, 'OVERDUE');
  record('A04', 'Vencido a las 06:01 de Ciudad de México el día límite', { atUTC: '2026-10-15T12:01:00Z', dueDate: '2026-10-15', displayed: early });

  let payableUpdates = 0;
  const expenses = load('src/app/api/expenses/route.js', { prisma: {
    $transaction: async run => run({ dailyExpense: {
      findUnique: async () => ({ id: 'expense', userId: 'user', amount: 100, payableAccountId: 'payable' }),
      update: async ({ data }) => ({ id: 'expense', payableAccountId: 'payable', ...data }),
    }, subscriptionCharge: { findUnique: async () => null } }),
    payableAccount: { update: async () => { payableUpdates++; } },
  } });
  const edit = await expenses.PATCH(request({ id: 'expense', date: '2026-10-15', paymentMethod: 'CASH', concept: 'Abono', amount: 50, categoryId: 'category' }));
  assert.equal(edit.status, 200); assert.equal(payableUpdates, 0);
  record('A05', 'Editar abono no recalcula estado de deuda', { oldPayment: 100, newPayment: 50, payableStatusUpdates: payableUpdates });
  const payable = load('src/app/api/payables/route.js', { prisma: { payableAccount: {
    update: async ({ data }) => ({ status: 'PAID_OFF', dailyExpenses: [{ amount: 100 }], ...data }),
  } } });
  const principalEdit = await payable.PATCH(request({ id: 'payable', personId: 'person', concept: 'Deuda', originalAmount: 200, originDate: '2026-10-15' }));
  assert.equal(principalEdit.body.payable.status, 'PAID_OFF');
  assert.equal(principalEdit.body.payable.pendingBalance, 100);
  record('A05b', 'Cambiar principal conserva estado liquidado con saldo positivo', { status: principalEdit.body.payable.status, pendingBalance: principalEdit.body.payable.pendingBalance });

  let receivablesCreated = 0;
  const failedExpense = load('src/app/api/expenses/route.js', { prisma: {
    receivableAccount: { create: async () => { receivablesCreated++; return { id: 'orphan' }; } },
    dailyExpense: { create: async () => { throw new Error('Foreign key failure'); } },
  } });
  const failed = await failedExpense.POST(request({ userId: 'user', date: '2026-10-15', paymentMethod: 'CASH', concept: 'Compra', amount: 50, categoryId: 'deleted-category', personId: 'person', createReceivable: true }));
  assert.equal(failed.status, 500); assert.equal(receivablesCreated, 1);
  record('A06', 'Fallo al crear gasto deja una cuenta por cobrar huérfana', { responseStatus: failed.status, persistedReceivables: receivablesCreated });

  const dataset = Array.from({ length: 101 }, (_, i) => ({ id: `income-${i}`, amount: 10 }));
  const incomes = load('src/app/api/incomes/route.js', { prisma: { income: { findMany: async options => dataset.slice(0, options.take) } } });
  const limited = await incomes.GET(request(null, '?userId=user'));
  assert.equal(limited.body.incomes.length, 100); assert.equal(limited.body.total, 1000);
  record('A07', 'Historial de ingresos truncado sin paginación de servidor', { realCount: 101, returnedCount: 100, realTotal: 1010, returnedTotal: limited.body.total });

  let savedDate;
  const invalidDate = load('src/app/api/expenses/route.js', { prisma: { dailyExpense: { create: async ({ data }) => { savedDate = data.date; return data; } } } });
  const normalized = await invalidDate.POST(request({ userId: 'user', date: '2026-02-30', paymentMethod: 'CASH', concept: 'Fecha imposible', amount: 10, categoryId: 'category' }));
  assert.equal(normalized.status, 200); assert.equal(savedDate.toISOString().slice(0, 10), '2026-03-02');
  record('A08', 'Fecha imposible se acepta y cambia de mes', { supplied: '2026-02-30', saved: savedDate.toISOString().slice(0, 10) });

  const component = source('src/components/gastos/GastosContent.jsx');
  const start = component.indexOf('  async function loadExpenses(');
  const end = component.indexOf('  async function loadReceivables(', start);
  const pending = [];
  let currentFilter = 'A'; let rendered;
  const race = vm.createContext({ buildExpensesUrl: () => currentFilter,
    lastExpensesUrlRef: { current: '' }, setIsExpensesLoading() {}, setAvailableMonths() {},
    setExpenses: rows => { rendered = rows; }, fetch: url => new Promise(resolve => pending.push({ url, resolve })) });
  vm.runInContext(component.slice(start, end), race);
  const first = race.loadExpenses('user'); currentFilter = 'B';
  const second = race.loadExpenses('user');
  pending[1].resolve({ ok: true, json: async () => ({ expenses: ['B'] }) }); await second;
  pending[0].resolve({ ok: true, json: async () => ({ expenses: ['A'] }) }); await first;
  assert.equal(rendered[0], 'A');
  record('A09', 'Respuesta vieja sobrescribe filtro más reciente', { selectedFilter: 'B', displayedRows: rendered });

  const output = { scope: 'Reproducción aislada con código fuente real y mocks de BD/red; ningún dato personal.', findings };
  fs.writeFileSync(path.join(__dirname, 'reproducciones.json'), JSON.stringify(output, null, 2) + '\n');
  console.log(JSON.stringify(output, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
