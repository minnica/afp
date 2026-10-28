const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { sourceLoader } = require('./helpers/load-source.cjs');
const connectionString = process.env.AFP_TEST_DATABASE_URL;

test('PostgreSQL: seguimiento desde saldo inicial, movimientos reales, reintentos, conciliación y concurrencia', { skip: !connectionString }, async (t) => {
  const url = new URL(connectionString);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && /^\/afp_test[a-zA-Z0-9_]*$/.test(url.pathname) && !url.search);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const user = await db.user.create({ data: { email: `tracking-${randomUUID()}@example.test` } });
  const other = await db.user.create({ data: { email: `tracking-${randomUUID()}@example.test` } });
  let actor = user.id;
  const load = sourceLoader({
    '@/lib/prisma': { prisma: db },
    '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: actor } } }) } }) },
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body: JSON.parse(JSON.stringify(body)), status: options.status || 200 }) } },
  });
  const cards = load('src/app/api/cards/route.ts');
  const expenses = load('src/app/api/expenses/route.ts');
  const purchases = load('src/app/api/installment-purchases/route.ts');
  const cycles = load('src/app/api/card-cycles/route.ts');
  const today = load('src/lib/cardBalances.ts').getBalanceToday();
  const now = new Date(`${today}T12:00:00Z`);
  const yesterday = new Date(now.getTime() - 86400000);
  const request = (body = {}, query = '') => ({ url: `http://localhost/api/test?${query}`, headers: new Headers({ authorization: 'Bearer test' }), json: async () => body });
  const ok = response => { assert.equal(response.status, 200, JSON.stringify(response.body)); return response.body; };
  try {
    const card = await db.card.create({ data: { userId: user.id, name: 'Tarjeta A', usualCutDay: 10, usualDueDay: 30 } });
    const second = await db.card.create({ data: { userId: user.id, name: 'Tarjeta B', usualCutDay: 10, usualDueDay: 30 } });
    const category = await db.category.create({ data: { userId: user.id, name: 'Prueba' } });
    const cycle = await db.cardCycle.create({ data: { userId: user.id, cardId: card.id, month: now.getUTCMonth() + 1, year: now.getUTCFullYear(), startDate: new Date(yesterday.getTime() - 30 * 86400000), cutDate: yesterday, dueDate: new Date(now.getTime() + 5 * 86400000), statementAmount: 5000, paidAmount: 1000, paidAt: yesterday } });
    await db.dailyExpense.create({ data: { userId: user.id, cardId: card.id, categoryId: category.id, date: now, paymentMethod: 'CARD', concept: 'Ya incluido en banco', amount: 500 } });
    await db.installmentPurchase.create({ data: { userId: user.id, cardId: card.id, categoryId: category.id, purchaseDate: now, concept: 'MSI ya incluida', totalAmount: 12000, months: 12 } });
    const readCard = async (id = card.id) => ok(await cards.GET(request())).cards.find(row => row.id === id);
    const reconcile = async (id, usedBalance) => {
      const previous = await readCard(id);
      const body = { id, action: 'UPDATE_CREDIT_BALANCE', creditLimit: 20000, usedBalance, balanceAsOf: today, balanceCaptureId: randomUUID(), expectedBalanceCaptureId: previous.balanceTracking?.captureId ?? null };
      ok(await cards.PATCH(request(body))); return body;
    };
    await reconcile(card.id, 3000); await reconcile(second.id, 1000);
    await t.test('los movimientos existentes no se vuelven a cargar; consultar no escribe', async () => {
      const before = await db.card.findUnique({ where: { id: card.id } });
      assert.equal((await readCard()).usedBalance, '3000.00');
      assert.equal((await readCard()).usedBalance, '3000.00');
      assert.deepEqual(await db.card.findUnique({ where: { id: card.id } }), before);
    });
    const expenseBody = { operationId: randomUUID(), date: today, paymentMethod: 'CARD', cardId: card.id, concept: 'Cargo nuevo', amount: '100.25', cashContributionAmount: 80, categoryId: category.id };
    let expense;
    await t.test('gasto compartido y recibo offline cuentan el cargo completo una sola vez', async () => {
      expense = ok(await expenses.POST(request(expenseBody))).expense;
      assert.equal(ok(await expenses.POST(request(expenseBody))).expense.id, expense.id);
      assert.equal((await readCard()).usedBalance, '3100.25');
    });
    await t.test('edición, traslado a otra tarjeta, efectivo y eliminación se reflejan a centavos', async () => {
      ok(await expenses.PATCH(request({ ...expenseBody, id: expense.id, amount: '150.50' })));
      assert.equal((await readCard()).usedBalance, '3150.50');
      ok(await expenses.PATCH(request({ ...expenseBody, id: expense.id, amount: '150.50', cardId: second.id })));
      assert.equal((await readCard()).usedBalance, '3000.00');
      assert.equal((await readCard(second.id)).usedBalance, '1150.50');
      ok(await expenses.PATCH(request({ ...expenseBody, id: expense.id, amount: '150.50', paymentMethod: 'CASH', cardId: null })));
      assert.equal((await readCard(second.id)).usedBalance, '1000.00');
      ok(await expenses.DELETE(request({}, `id=${expense.id}`)));
      assert.equal((await readCard()).usedBalance, '3000.00');
    });
    await t.test('pago acumulado, reintento y devolución después del corte', async () => {
      const pay = { id: cycle.id, action: 'MARK_AS_PAID', paidAt: today, paidAmount: 1500 };
      ok(await cycles.PATCH(request(pay))); ok(await cycles.PATCH(request(pay)));
      assert.equal((await readCard()).usedBalance, '2500.00');
      ok(await cycles.PATCH(request({ id: cycle.id, action: 'UPDATE_POST_CUT_CREDIT', postCutCreditAmount: 200, postCutCreditDate: today, postCutCreditNotes: 'Devolución confirmada de prueba' })));
      assert.equal((await readCard()).usedBalance, '2300.00');
      ok(await cycles.PATCH(request({ id: cycle.id, action: 'UNMARK_AS_PAID' })));
      assert.equal((await readCard()).usedBalance, '3800.00');
    });
    await t.test('una nueva MSI consume el total y su eliminación lo revierte', async () => {
      const purchase = ok(await purchases.POST(request({ cardId: card.id, purchaseDate: today, concept: 'Nueva MSI', totalAmount: 1200, months: 12, categoryId: category.id }))).purchase;
      assert.equal((await readCard()).usedBalance, '5000.00');
      ok(await purchases.PATCH(request({ id: purchase.id, cardId: card.id, purchaseDate: today, concept: purchase.concept, totalAmount: 1200, months: 12, initialPaymentsMade: 12, categoryId: category.id })));
      assert.equal((await readCard()).usedBalance, '5000.00');
      ok(await purchases.DELETE(request({}, `id=${purchase.id}`)));
      assert.equal((await readCard()).usedBalance, '3800.00');
    });
    await t.test('reconciliar absorbe diferencias; repetir la petición no borra cargos posteriores', async () => {
      const capture = await reconcile(card.id, '3799.99');
      const operation = { ...expenseBody, operationId: randomUUID(), amount: '10.01', cashContributionAmount: 0 };
      ok(await expenses.POST(request(operation)));
      assert.equal((await readCard()).usedBalance, '3810.00');
      ok(await cards.PATCH(request(capture)));
      assert.equal((await readCard()).usedBalance, '3810.00');
      const next = await reconcile(card.id, 4000);
      assert.equal((await cards.PATCH(request(capture))).status, 409);
      assert.equal((await readCard()).usedBalance, '4000.00');
      assert.equal((await cards.PATCH(request({ ...next, usedBalance: 1 }))).status, 409);
    });
    await t.test('cargos simultáneos no pierden importes; rollback no modifica el saldo', async () => {
      const results = await Promise.all(Array.from({ length: 8 }, (_, i) => expenses.POST(request({ ...expenseBody, operationId: randomUUID(), concept: `Concurrente ${i}`, amount: '1.01', cashContributionAmount: 0 }))));
      assert.ok(results.every(result => result.status === 200));
      assert.equal((await readCard()).usedBalance, '4008.08');
      await assert.rejects(db.$transaction(async tx => { await tx.dailyExpense.create({ data: { userId: user.id, cardId: card.id, categoryId: category.id, date: now, paymentMethod: 'CARD', concept: 'Revertido', amount: 900 } }); throw new Error('rollback'); }));
      assert.equal((await readCard()).usedBalance, '4008.08');
    });
    await t.test('aislamiento y captura bancaria inicial conservada', async () => {
      actor = other.id;
      assert.deepEqual(ok(await cards.GET(request())).cards, []);
      actor = user.id;
      assert.equal((await db.card.findUnique({ where: { id: card.id } })).usedBalance.toFixed(2), '4000.00');
      assert.equal((await readCard()).bankUsedBalance, '4000');
    });
  } finally {
    await db.user.deleteMany({ where: { id: { in: [user.id, other.id] } } });
    await db.$disconnect();
  }
});
