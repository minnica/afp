const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { sourceLoader } = require('./helpers/load-source.cjs');
const connectionString = process.env.AFP_TEST_DATABASE_URL;

test('PostgreSQL: captura bancaria persiste sin modificar ciclos, pagos ni movimientos; actualización atómica', { skip: !connectionString }, async () => {
  const url = new URL(connectionString);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && /^\/afp_test[a-zA-Z0-9_]*$/.test(url.pathname) && !url.search);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const user = await db.user.create({ data: { email: `balance-${randomUUID()}@example.test` } });
  const other = await db.user.create({ data: { email: `balance-${randomUUID()}@example.test` } });
  let actor = user.id;
  const api = sourceLoader({
    '@/lib/prisma': { prisma: db },
    '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: actor } } }) } }) },
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body: JSON.parse(JSON.stringify(body)), status: options.status || 200 }) } },
  })('src/app/api/cards/route.js');
  const request = body => ({ url: 'http://localhost/api/cards', headers: new Headers({ authorization: 'Bearer test' }), json: async () => body });
  try {
    const card = await db.card.create({ data: { userId: user.id, name: 'Tarjeta prueba', usualCutDay: 10, usualDueDay: 30, notes: 'Referencia' } });
    assert.equal(card.usedBalance, null);
    const cycle = await db.cardCycle.create({ data: { userId: user.id, cardId: card.id, month: 1, year: 2026, startDate: new Date('2025-12-11'), cutDate: new Date('2026-01-10'), dueDate: new Date('2026-01-30'), statementAmount: '1000.50', paidAmount: '200.25' } });
    const update = { id: card.id, action: 'UPDATE_CREDIT_BALANCE', creditLimit: '15000.50', usedBalance: '13000.25', balanceAsOf: '2026-01-20' };
    assert.equal((await api.PATCH(request(update))).status, 200);
    assert.equal((await api.GET(request())).body.cards[0].usedBalance, '13000.25');
    assert.deepEqual(await db.cardCycle.findUnique({ where: { id: cycle.id } }), cycle);
    for (const model of ['dailyExpense', 'income', 'installmentPurchase']) assert.equal(await db[model].count({ where: { userId: user.id } }), 0);
    actor = other.id;
    assert.equal((await api.PATCH(request(update))).status, 404);
    assert.deepEqual((await api.GET(request())).body.cards, []);
    actor = user.id;
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => api.PATCH(request({ ...update, creditLimit: 1000 + i, usedBalance: i, balanceAsOf: `2026-01-${21 + i}` }))));
    assert.ok(results.every(result => result.status === 200));
    const saved = await db.card.findUnique({ where: { id: card.id } });
    const used = Number(saved.usedBalance);
    assert.equal(Number(saved.creditLimit), used + 1000);
    assert.equal(saved.balanceAsOf.getUTCDate(), used + 21);
    assert.equal(saved.name, card.name);
    assert.equal(saved.notes, card.notes);
    await assert.rejects(db.card.update({ where: { id: card.id }, data: { creditLimit: -1 } }));
    await assert.rejects(db.card.update({ where: { id: card.id }, data: { balanceAsOf: null } }));
    assert.deepEqual(await db.card.findUnique({ where: { id: card.id } }), saved);
    assert.equal((await api.PATCH(request({ ...update, usedBalance: '-50.25' }))).status, 200);
    assert.equal((await db.card.findUnique({ where: { id: card.id } })).usedBalance.toFixed(2), '-50.25');
  } finally {
    await db.user.deleteMany({ where: { id: { in: [user.id, other.id] } } });
    await db.$disconnect();
  }
});
