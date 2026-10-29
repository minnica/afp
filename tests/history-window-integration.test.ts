import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { fixtureConnection, fixtureDatabase } from './helpers/fixture-database';
import { financialLoader, testHandler, testReply } from './helpers/financial-fixtures';
import { record, array } from './helpers/dynamic-values';

const connection = process.env.AFP_TEST_DATABASE_URL;
test('A13 PostgreSQL: ventanas, páginas, referencias y resumen', { skip: !connection }, async t => {
  const db = await fixtureDatabase(fixtureConnection(connection));
  const user = await db.user.create({ data: { email: `history-${randomUUID()}@example.test` } });
  const other = await db.user.create({ data: { email: `history-other-${randomUUID()}@example.test` } });
  const load = financialLoader({ '@/lib/prisma': { prisma: db }, 'next/server': { NextResponse: { json: testReply } },
    '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async (token: string) => ({ data: { user: [user, other].find(item => item.id === token) || null } }) } }) },
  }, { console });
  const call = (route: string, query = '', owner = user) => testHandler(record(load(`src/app/api/${route}/route`)).GET)({
    url: `http://localhost/api/${route}?clientDate=2026-10-29&${query}`, headers: new Headers({ authorization: `Bearer ${owner.id}` }),
  });
  try {
    const category = await db.category.create({ data: { userId: user.id, name: 'Comida' } });
    const card = await db.card.create({ data: { userId: user.id, name: 'Tarjeta sintética', usualCutDay: 31, usualDueDay: 20, usagePolicy: { productKey: 'HSBC_ZERO' } } });
    await db.dailyExpense.createMany({ data: Array.from({ length: 251 }, (_, index) => ({ userId: user.id, categoryId: category.id,
      concept: index % 2 ? (index === 1 ? 'CAFÈ' : 'CAFÉ') : 'Comida', amount: '1.01', cashContributionAmount: '0.01', paymentMethod: 'CASH' as const, date: new Date('2026-10-20T12:00:00Z') })) });
    await db.dailyExpense.create({ data: { userId: user.id, categoryId: category.id, concept: 'Histórico', amount: 99, paymentMethod: 'CASH', date: new Date('2001-01-01') } });
    await db.cardCycle.createMany({ data: Array.from({ length: 12 }, (_, i) => ({ userId: user.id, cardId: card.id, year: 2024, month: i + 1,
      startDate: new Date(Date.UTC(2024, i, 1)), cutDate: new Date(Date.UTC(2024, i + 1, 0, 12)), dueDate: new Date(Date.UTC(2024, i + 1, 20)), statementAmount: 0 })) });
    const current = await db.cardCycle.create({ data: { userId: user.id, cardId: card.id, year: 2026, month: 10,
      startDate: new Date('2026-10-01'), cutDate: new Date('2026-10-31T12:00:00Z'), dueDate: new Date('2026-11-20') } });
    const overdue = await db.cardCycle.create({ data: { userId: user.id, cardId: card.id, year: 2000, month: 1,
      startDate: new Date('2000-01-01'), cutDate: new Date('2000-01-31'), dueDate: new Date('2000-02-20'), status: 'PAID', statementAmount: 100, paidAmount: 20 } });
    await t.test('páginas deterministas, Decimal y agregados de todo el filtro', async () => {
      const pages = await Promise.all([1, 2, 3].map(page => call('expenses', `startDate=2026-10-01&page=${page}`)));
      for (const page of pages) { assert.equal(page.status, 200); assert.equal(page.body.totalCount, 251); assert.equal(page.body.total, 253.51); assert.equal(page.body.personalTotal, 251); }
      const ids = pages.flatMap(page => array(page.body.expenses).map(row => record(row).id));
      assert.equal(ids.length, 251); assert.equal(new Set(ids).size, 251);
      assert.deepEqual(array(pages[0]!.body.availableMonths), ['2026-10', '2001-01']);
      assert.equal((await call('expenses', 'page=999')).body.page, 3);
      assert.equal((await call('expenses', 'userId=forged', other)).body.totalCount, 0);
    });
    await t.test('filtros móviles alternativos, acentos y sumas', async () => {
      const filters = encodeURIComponent(JSON.stringify([{ type: 'concept', value: 'cafe' }, { type: 'concept', value: 'histórico' }, { type: 'amount', value: '101' }]));
      const response = await call('expenses', `filters=${filters}`);
      assert.equal(response.status, 200); assert.equal(response.body.totalCount, 125); assert.equal(response.body.total, 126.25);
    });
    await t.test('bootstrap mantiene una página y los catálogos agrupados', async () => {
      const result = await call('gastos/bootstrap', 'startDate=2026-10-01');
      assert.equal(result.status, 200); assert.equal(array(result.body.expenses).length, 100); assert.equal(result.body.totalCount, 251);
      assert.equal(array(result.body.categories).length, 1); assert.equal(result.body.pageCount, 3);
    });
    await t.test('ciclos históricos paginados, detalle aislado y dueño', async () => {
      const page = await call('card-cycles', 'year=2024&pageSize=5&page=3');
      assert.equal(page.status, 200); assert.equal(page.body.totalCount, 12); assert.equal(array(page.body.cycles).length, 2);
      const detail = await call('card-cycles', `cycleId=${current.id}`);
      assert.equal(detail.status, 200); assert.equal(record(detail.body.cycle).id, current.id);
      assert.equal((await call('card-cycles', `cycleId=${current.id}`, other)).body.cycle, null);
      assert.equal((await call('card-cycles', 'year=2024&pageSize=5&page=999')).body.page, 3);
    });
    await t.test('conserva parciales antiguos y excluye el historial liquidado', async () => {
      const response = await call('dashboard'); assert.equal(response.status, 200);
      const cycles = array(response.body.cycles).map(record);
      assert.equal(record(cycles.find(cycle => cycle.id === overdue.id)).pendingAmount, 80);
      assert.ok(cycles.filter(cycle => cycle.year === 2024).length < 3);
      assert.ok(array(response.body.importantNotices).some(notice => record(notice).type === 'CARD_PAYMENT'));
      const old = await call('dashboard', 'year=2001'); assert.equal(old.status, 200);
      assert.equal(record(array(record(old.body.categoryBreakdownByMonth)['0'])[0]).total, 99);
      await db.dailyExpense.create({ data: { userId: user.id, categoryId: category.id, paymentMethod: 'CASH', concept: 'Febrero histórico', date: new Date('2025-02-15'), amount: 19 } });
      const leap = await testHandler(record(load('src/app/api/dashboard/route.ts')).GET)({ url: 'http://localhost/api/dashboard?year=2025&clientDate=2024-02-29', headers: new Headers({ authorization: `Bearer ${user.id}` }) });
      assert.equal(leap.status, 200); assert.equal(record(leap.body.monthlySummary).dailyExpensesTotal, 19);
    });
    await t.test('batch antiguo conserva la tarjeta ya pagada del mismo mes', async () => {
      const second = await db.card.create({ data: { userId: user.id, name: 'Pagada en batch antiguo', usualCutDay: 31, usualDueDay: 20 } });
      const paid = await db.cardCycle.create({ data: { userId: user.id, cardId: second.id, year: 2000, month: 1,
        startDate: new Date('2000-01-01'), cutDate: new Date('2000-01-31'), dueDate: new Date('2000-02-20'), statementAmount: 100, paidAmount: 100 } });
      const full = await call('dashboard'); assert.equal(full.status, 200);
      const payment = array(full.body.payments).map(record).find(item => record(item.card).id === second.id)!;
      assert.equal(record(payment.currentPayment).id, paid.id); assert.equal(record(payment.currentPayment).isSettled, true);
    });
    await t.test('ocurrencia confirmada fuera de ventana sustituye previsión sin duplicar', async () => {
      const subscription = await db.subscription.create({ data: { userId: user.id, name: 'Cobro contabilizado después', categoryId: category.id,
        cardId: card.id, paymentMethod: 'CARD', amount: 30, chargeDay: 15, startYear: 2026, startMonth: 10 } });
      const expense = await db.dailyExpense.create({ data: { userId: user.id, categoryId: category.id, cardId: card.id, subscriptionId: subscription.id,
        date: new Date('2029-01-15'), amount: 25, paymentMethod: 'CARD', concept: 'Contabilización posterior' } });
      await db.subscriptionCharge.create({ data: { userId: user.id, subscriptionId: subscription.id, month: '2026-10', status: 'CONFIRMED', expenseId: expense.id } });
      const detail = await call('card-cycles', `cycleId=${current.id}`); assert.equal(detail.status, 200);
      assert.equal(record(detail.body.cycle).subscriptionsAmount, 0);
      const full = await call('dashboard'); assert.equal(full.status, 200);
      assert.equal(record(full.body.monthlySummary).subscriptionsTotal, 0);
    });
    await t.test('MSI antigua con ancla posterior conserva cuota verificada', async () => {
      await db.installmentPurchase.create({ data: { userId: user.id, cardId: card.id, categoryId: category.id, concept: 'MSI con ancla',
        purchaseDate: new Date('2010-01-01'), months: 12, totalAmount: 1200,
        statementReconciliations: [{ year: 2026, month: 10, paymentNumber: 1, amount: 70, remainingBalance: 770 }] } });
      const detail = await call('card-cycles', `cycleId=${current.id}`); assert.equal(detail.status, 200);
      assert.equal(record(detail.body.cycle).purchasesAmount, 70);
    });
    await t.test('resumen conserva avisos y consumo sin los comparativos anuales', async () => {
      const full = await call('dashboard'); const summary = await call('dashboard/summary');
      assert.equal(summary.status, 200);
      assert.deepEqual(summary.body.importantNotices, full.body.importantNotices);
      assert.deepEqual(summary.body.cardUsageWaiversCurrent, full.body.cardUsageWaiversCurrent);
      assert.equal(summary.body.weeklyComparisonByMonth, undefined); assert.equal(summary.body.cycles, undefined);
      assert.equal(summary.headers.get('cache-control'), 'private, no-store');
    });
    await t.test('Turbo conserva la compra válida fuera de ventana y omite comisiones', async () => {
      const nu = await db.card.create({ data: { userId: user.id, name: 'Nu sintética', usualCutDay: 15, usualDueDay: 25, usagePolicy: { productKey: 'NU' } } });
      const expense = await db.dailyExpense.create({ data: { userId: user.id, cardId: nu.id, categoryId: category.id, concept: 'Compra antigua válida',
        amount: 25, paymentMethod: 'CARD', date: new Date('2010-06-01') } });
      await db.dailyExpense.createMany({ data: Array.from({ length: 101 }, () => ({ userId: user.id, cardId: nu.id, categoryId: category.id, concept: 'COMISION ADMINISTRACION',
        amount: 20, paymentMethod: 'CARD' as const, date: new Date('2020-01-01') })) });
      const summary = await call('dashboard/summary'); assert.equal(summary.status, 200);
      const usage = array(summary.body.cardUsageWaiversCurrent).map(record).find(row => record(row.card).id === nu.id)!;
      assert.equal(record(usage.lastPurchase).id, `expense:${expense.id}`); assert.equal(usage.status, 'NOT_MET');
    });
    await t.test('Turbo conserva comprobante verificado antiguo sin descargar todos los estados', async () => {
      const nu = await db.card.findFirstOrThrow({ where: { userId: user.id, name: 'Nu sintética' } });
      await db.cardCycle.create({ data: { userId: user.id, cardId: nu.id, year: 2021, month: 1,
        startDate: new Date('2021-01-01'), cutDate: new Date('2021-01-31'), dueDate: new Date('2021-02-20'), statementAmount: 0,
        usageReconciliation: { version: 1, source: 'Estado sintético', sourceSha256: 'a'.repeat(64), startDate: '2021-01-01', cutDate: '2021-01-31',
          subscriptionCharges: [{ subscriptionId: 'servicio-retirado', name: 'Servicio válido', date: '2021-01-15', amount: 30 }] } } });
      const summary = await call('dashboard/summary'); assert.equal(summary.status, 200);
      const usage = array(summary.body.cardUsageWaiversCurrent).map(record).find(row => record(row.card).id === nu.id)!;
      assert.equal(record(usage.lastPurchase).date, '2021-01-15');
    });
    await t.test('rechaza parámetros inválidos y autenticación ausente', async () => {
      for (const query of ['page=0', 'pageSize=101', 'startDate=2026-02-30', 'startDate=2026-10-10&endDate=2026-01-01', 'sortBy=unknown']) assert.equal((await call('expenses', query)).status, 400);
      for (const query of ['year=0', 'pageSize=101', 'page=-1']) assert.equal((await call('card-cycles', query)).status, 400);
      assert.equal((await call('dashboard', 'year=bad')).status, 400);
      const noAuth = await testHandler(record(load('src/app/api/dashboard/summary/route.ts')).GET)({ url: 'http://localhost/api/dashboard/summary', headers: new Headers() });
      assert.equal(noAuth.status, 401);
    });
  } finally { await db.user.deleteMany({ where: { id: { in: [user.id, other.id] } } }); await db.$disconnect(); }
});
