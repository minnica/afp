import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { financialLoader, fixedDate, testReply } from './helpers/financial-fixtures';
import { faultingTransactions } from './helpers/financial-persistence';
import { record } from './helpers/dynamic-values';

const connectionString = process.env.AFP_TEST_DATABASE_URL;
test('PostgreSQL: estado y fechas atómicos, rollback, lectura histórica y propiedad', { skip: !connectionString }, async () => {
  assert.ok(connectionString);
  const url = new URL(connectionString);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname.startsWith('/afp_test') && !url.search);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const owner = await db.user.create({ data: { email: `statement-${randomUUID()}@example.test` } });
  const other = await db.user.create({ data: { email: `statement-${randomUUID()}@example.test` } });
  let actor = owner.id, fail = false;
  const adapter = faultingTransactions(db, { after(model, method) {
    if (model === 'cardCycle' && method === 'update' && fail) throw new Error('Fallo después de escritura real');
  } }, false);
  const route = financialLoader({
    '@/lib/prisma': { prisma: adapter },
    '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: actor } } }) } }) },
    'next/server': { NextResponse: { json: testReply } },
  }, { Date: fixedDate(new Date('2026-11-14T18:00:00Z')), console: { error() {} } })('src/app/api/card-cycles/route.ts');
  const request = (body?: Record<string, unknown>, query = '') => ({
    url: `http://localhost/api/card-cycles${query}`, headers: new Headers({ authorization: 'Bearer test' }), json: async () => body,
  });
  try {
    const card = await db.card.create({ data: { userId: owner.id, name: 'Tarjeta ficticia', usualCutDay: 14, usualDueDay: 4 } });
    const cycle = await db.cardCycle.create({ data: {
      userId: owner.id, cardId: card.id, year: 2025, month: 12,
      startDate: new Date('2025-11-15'), cutDate: new Date('2025-12-14'), dueDate: new Date('2026-01-04'),
    } });
    const query = `?cycleId=${cycle.id}&year=2026&page=99`;
    const loaded = await route.GET(request(undefined, query));
    assert.equal(record(loaded.body.cycle).id, cycle.id);
    assert.deepEqual(await db.cardCycle.findUnique({ where: { id: cycle.id } }), cycle, 'abrir no escribe');
    const command = { id: cycle.id, action: 'UPDATE_STATEMENT', statementAmount: '1200.25',
      startDate: '2025-11-16', cutDate: '2025-12-15', dueDate: '2026-01-05' };
    actor = other.id;
    assert.equal((await route.GET(request(undefined, query))).body.cycle, null);
    assert.equal((await route.PATCH(request(command))).status, 404);
    actor = owner.id;
    fail = true;
    assert.equal((await route.PATCH(request(command))).status, 500);
    assert.deepEqual(await db.cardCycle.findUnique({ where: { id: cycle.id } }), cycle);
    fail = false;
    for (let repeat = 0; repeat < 2; repeat++) assert.equal((await route.PATCH(request(command))).status, 200);
    const saved = await db.cardCycle.findUniqueOrThrow({ where: { id: cycle.id } });
    assert.equal(saved.statementAmount?.toFixed(2), '1200.25');
    assert.equal(saved.startDate.toISOString().slice(0, 10), command.startDate);
    assert.equal(saved.cutDate.toISOString().slice(0, 10), command.cutDate);
    assert.equal(saved.dueDate.toISOString().slice(0, 10), command.dueDate);
    assert.ok(saved.datesConfirmedAt);
    assert.equal(saved.paidAmount, null);
    assert.equal((await route.PATCH(request({ ...command, dueDate: command.cutDate }))).status, 400);
    assert.deepEqual(await db.cardCycle.findUnique({ where: { id: cycle.id } }), saved);
    assert.equal((await route.PATCH(request({ ...command, statementAmount: '0' }))).status, 200);
    assert.equal(record((await route.GET(request(undefined, query))).body.cycle).paymentStatus, 'NO_PAYMENT_DUE');
    assert.equal(await db.income.count({ where: { userId: owner.id } }), 0);
    assert.equal(await db.dailyExpense.count({ where: { userId: owner.id } }), 0);
  } finally {
    await db.user.deleteMany({ where: { id: { in: [owner.id, other.id] } } });
    await db.$disconnect();
  }
});
