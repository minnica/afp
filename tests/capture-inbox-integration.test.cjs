const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomUUID } = require('node:crypto');
const { PrismaClient, Prisma } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { sourceLoader } = require('./helpers/load-source.cjs');
const connectionString = process.env.AFP_TEST_DATABASE_URL;

test('bandeja por tipo: filtros antes de paginar, contadores e independencia de propietario', { skip: !connectionString }, async t => {
  const url = new URL(connectionString);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && /^\/afp_test\w*$/.test(url.pathname) && !url.search);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const users = await Promise.all(['a', 'b'].map(name => db.user.create({ data: { email: `inbox-${name}-${randomUUID()}@example.test` } })));
  const [owner, other] = users;
  const cards = await Promise.all(users.map(user => db.card.create({ data: { userId: user.id, name: 'Ficticia', usualCutDay: 25, usualDueDay: 15 } })));
  const load = sourceLoader({ '@/lib/prisma': { prisma: db }, '@/lib/calendar/schedule': { scheduleCalendarSync() {} },
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body: JSON.parse(JSON.stringify(body)), status: options.status || 200 }) } },
    '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async token => ({ data: { user: token === 'owner' ? owner : token === 'other' ? other : null } }) } }) },
  });
  const route = load('src/app/api/captures/movements/route.ts');
  const request = (query, token = 'owner') => new Request(`http://localhost/api/captures/movements?${query}`, { headers: { authorization: `Bearer ${token}` } });
  const create = data => db.captureMovement.create({ data: { userId: owner.id, reason: 'UNKNOWN_FORMAT', proposal: {}, ...data } });
  try {
    // More than one page of nonfinancial notices must never hide a refund.
    const refund = await create({ parserKey: 'mercadopago.refund.es.v1', cardId: cards[0].id });
    await db.captureMovement.createMany({ data: Array.from({ length: 56 }, (_, i) => ({ userId: owner.id, reason: 'SERVICE_NOTICE_REVIEW', proposal: { merchant: `Aviso ${i}` } })) });
    const purchase = await create({ parserKey: 'wallet.bbva-purchase.es.v1', cardId: cards[0].id });
    const payment = await create({ parserKey: 'nu.card-payment.es.v1', proposal: { movementType: 'CARD_PAYMENT' } });
    const fixed = await create({ correction: { merchant: 'Compra corregida' } });
    await create({ correction: Prisma.JsonNull });
    await create({ parserKey: 'bbva.account-charge.es.v1' });
    const registered = await create({ parserKey: 'wallet.bbva-purchase.es.v1', status: 'REGISTERED' });
    const foreign = await create({ userId: other.id, parserKey: 'mercadopago.refund.es.v1', cardId: cards[1].id });

    await t.test('pendientes excluye avisos sin compra y separa pagos y devoluciones', async () => {
      const result = await route.GET(request('kind=PENDING'));
      assert.equal(result.status, 200);
      assert.deepEqual(new Set(result.body.movements.map(row => row.id)), new Set([refund.id, purchase.id, payment.id, fixed.id]));
      assert.deepEqual(result.body.pendingCounts, { EXPENSE: 2, PAYMENT: 1, REFUND: 1, MONEY: 0, OTHER: 58 });
      assert.equal(result.body.movements.find(row => row.id === refund.id).kind, 'REFUND');
    });
    await t.test('filtro de devoluciones se aplica antes del límite de 50 y respeta tarjeta', async () => {
      const result = await route.GET(request(`kind=REFUND&cardId=${cards[0].id}`));
      assert.deepEqual(result.body.movements.map(row => row.id), [refund.id]);
      assert.deepEqual(result.body.pendingCounts, { EXPENSE: 1, PAYMENT: 0, REFUND: 1, MONEY: 0, OTHER: 0 });
      assert.equal(result.body.nextCursor, null);
      assert.equal((await route.GET(request(`kind=REFUND&cardId=${cards[1].id}`))).status, 404);
    });
    await t.test('otros avisos tiene paginación estable, sin movimientos financieros', async () => {
      const first = await route.GET(request('kind=OTHER&status=REVIEW'));
      assert.equal(first.body.movements.length, 50);
      assert.ok(first.body.nextCursor);
      const second = await route.GET(request(`kind=OTHER&status=REVIEW&cursor=${first.body.nextCursor}`));
      assert.equal(second.body.movements.length, 8);
      assert.equal(second.body.nextCursor, null);
      assert.equal(new Set([...first.body.movements, ...second.body.movements].map(row => row.id)).size, 58);
      assert.ok([...first.body.movements, ...second.body.movements].every(row => row.kind === 'OTHER'));
    });
    await t.test('estados, autorización, cursor y tipos desconocidos no filtran datos ajenos', async () => {
      const result = await route.GET(request('kind=EXPENSE&status=REGISTERED'));
      assert.deepEqual(result.body.movements.map(row => row.id), [registered.id]);
      assert.equal((await route.GET(request(`kind=REFUND&cursor=${foreign.id}`))).status, 404);
      assert.equal((await route.GET(request('kind=INVALID'))).status, 400);
      assert.equal((await route.GET(request('kind=PENDING', 'expired'))).status, 401);
      assert.deepEqual((await route.GET(request('kind=PENDING', 'other'))).body.movements.map(row => row.id), [foreign.id]);
      // Legacy clients still receive all types unless they opt into a filter.
      assert.equal((await route.GET(request('status=REVIEW'))).body.movements.length, 50);
    });
  } finally {
    await db.user.deleteMany({ where: { id: { in: users.map(row => row.id) } } });
    await db.$disconnect();
  }
});
