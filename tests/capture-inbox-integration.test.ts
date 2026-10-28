import { array,record as objectValue } from './helpers/dynamic-values';
import { plain,present } from './helpers/financial-fixtures';

import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma,PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { integrationLoader as sourceLoader } from './helpers/integration-fixtures';
const connectionString = process.env.AFP_TEST_DATABASE_URL;

test('bandeja por tipo: filtros antes de paginar, contadores e independencia de propietario', { skip: !connectionString }, async t => {
  const url = new URL(present(connectionString));
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && /^\/afp_test\w*$/.test(url.pathname) && !url.search);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const users = await Promise.all(['a', 'b'].map(name => db.user.create({ data: { email: `inbox-${name}-${randomUUID()}@example.test` } })));
  const [owner, other] = users;
  const cards = await Promise.all(users.map(user => db.card.create({ data: { userId: user.id, name: 'Ficticia', usualCutDay: 25, usualDueDay: 15 } })));
  const load = sourceLoader({ '@/lib/prisma': { prisma: db }, '@/lib/calendar/schedule': { scheduleCalendarSync() {} },
    'next/server': { NextResponse: { json: (body: unknown, options = {}) => ({ body: plain(body), status: options.status || 200 }) } },
    '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async token => ({ data: { user: token === 'owner' ? owner : token === 'other' ? other : null } }) } }) },
  });
  const originalRoute = load('src/app/api/captures/movements/route.ts');
  const { uiResponseSchemas } = load('src/lib/uiResponseSchemas.ts');
  const route = { GET: async (request: Request) => {
    const result = await originalRoute.GET(request);
    if (result.status === 200) {
      const parsed = uiResponseSchemas['captures/movements'].parse(result.body);
      assert.deepEqual(plain(parsed), result.body);
    }
    return result;
  } };
  const request = (query: string, token = 'owner') => new Request(`http://localhost/api/captures/movements?${query}`, { headers: { authorization: `Bearer ${token}` } });
  const create = (data: Partial<import('@prisma/client').Prisma.CaptureMovementUncheckedCreateInput>) => db.captureMovement.create({ data: { userId: present(owner).id, reason: 'UNKNOWN_FORMAT', proposal: {}, ...data } });
  try {
    // More than one page of nonfinancial notices must never hide a refund.
    const refund = await create({ parserKey: 'mercadopago.refund.es.v1', cardId: present(cards[0]).id });
    await db.captureMovement.createMany({ data: Array.from({ length: 56 }, (_, i) => ({ userId: present(owner).id, reason: 'SERVICE_NOTICE_REVIEW', proposal: { merchant: `Aviso ${i}` } })) });
    const purchase = await create({ parserKey: 'wallet.bbva-purchase.es.v1', cardId: present(cards[0]).id });
    const payment = await create({ parserKey: 'nu.card-payment.es.v1', proposal: { movementType: 'CARD_PAYMENT' } });
    const fixed = await create({ correction: { merchant: 'Compra corregida' } });
    await create({ correction: Prisma.JsonNull });
    await create({ parserKey: 'bbva.account-charge.es.v1' });
    const registered = await create({ parserKey: 'wallet.bbva-purchase.es.v1', status: 'REGISTERED' });
    const foreign = await create({ userId: present(other).id, parserKey: 'mercadopago.refund.es.v1', cardId: present(cards[1]).id });

    await t.test('pendientes excluye avisos sin compra y separa pagos y devoluciones', async () => {
      const result = await route.GET(request('kind=PENDING'));
      assert.equal(result.status, 200);
      assert.deepEqual(new Set(array(result.body.movements).map(row => objectValue(row).id)), new Set([refund.id, purchase.id, payment.id, fixed.id]));
      assert.deepEqual(result.body.pendingCounts, { EXPENSE: 2, PAYMENT: 1, REFUND: 1, MONEY: 0, OTHER: 58 });
      assert.equal(objectValue(array(result.body.movements).find(row => objectValue(row).id === refund.id)).kind, 'REFUND');
    });
    await t.test('filtro de devoluciones se aplica antes del límite de 50 y respeta tarjeta', async () => {
      const result = await route.GET(request(`kind=REFUND&cardId=${present(cards[0]).id}`));
      assert.deepEqual(array(result.body.movements).map(row => objectValue(row).id), [refund.id]);
      assert.deepEqual(result.body.pendingCounts, { EXPENSE: 1, PAYMENT: 0, REFUND: 1, MONEY: 0, OTHER: 0 });
      assert.equal(result.body.nextCursor, null);
      assert.equal((await route.GET(request(`kind=REFUND&cardId=${present(cards[1]).id}`))).status, 404);
    });
    await t.test('otros avisos tiene paginación estable, sin movimientos financieros', async () => {
      const first = await route.GET(request('kind=OTHER&status=REVIEW'));
      assert.equal(array(first.body.movements).length, 50);
      assert.ok(first.body.nextCursor);
      const second = await route.GET(request(`kind=OTHER&status=REVIEW&cursor=${first.body.nextCursor}`));
      assert.equal(array(second.body.movements).length, 8);
      assert.equal(second.body.nextCursor, null);
      assert.equal(new Set([...array(first.body.movements), ...array(second.body.movements)].map(row => objectValue(row).id)).size, 58);
      assert.ok([...array(first.body.movements), ...array(second.body.movements)].every(row => objectValue(row).kind === 'OTHER'));
    });
    await t.test('estados, autorización, cursor y tipos desconocidos no filtran datos ajenos', async () => {
      const result = await route.GET(request('kind=EXPENSE&status=REGISTERED'));
      assert.deepEqual(array(result.body.movements).map(row => objectValue(row).id), [registered.id]);
      assert.equal((await route.GET(request(`kind=REFUND&cursor=${foreign.id}`))).status, 404);
      assert.equal((await route.GET(request('kind=INVALID'))).status, 400);
      assert.equal((await route.GET(request('kind=PENDING', 'expired'))).status, 401);
      assert.deepEqual(array((await route.GET(request('kind=PENDING', 'other'))).body.movements).map(row => objectValue(row).id), [foreign.id]);
      // Legacy clients still receive all types unless they opt into a filter.
      assert.equal(array((await route.GET(request('status=REVIEW'))).body.movements).length, 50);
    });
  } finally {
    await db.user.deleteMany({ where: { id: { in: users.map(row => row.id) } } });
    await db.$disconnect();
  }
});
