import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { array, record } from './helpers/dynamic-values';
import { fixedDate, present, financialLoader as sourceLoader, testReply } from './helpers/financial-fixtures';
import { faultingTransactions } from './helpers/financial-persistence';
const connectionString = process.env.AFP_TEST_DATABASE_URL;

test('PostgreSQL: devoluciones y pagos concurrentes, aislamiento, rollback y avisos', { skip: !connectionString }, async () => {
  assert.ok(connectionString);
  const url = new URL(connectionString);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname.startsWith('/afp_test') && !url.search);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const user = await db.user.create({ data: { email: `credits-${randomUUID()}@example.test` } });
  const another = await db.user.create({ data: { email: `credits-${randomUUID()}@example.test` } });
  let actor = user.id, fail = false;
  const adapter = faultingTransactions(db, { after(model, method) {
    if (model === 'cardCycle' && method === 'update' && fail) throw new Error('Fallo después de la escritura real');
  } }, false);
  const load = sourceLoader({
    '@/lib/prisma': { prisma: adapter },
    '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: actor } } }) } }) },
    'next/server': { NextResponse: { json: testReply } },
  }, { Date: fixedDate(new Date('2026-10-17T18:00:00Z')), console: { error() {} } });
  const route = load('src/app/api/card-cycles/route.ts');
  const request = (body?: Record<string, unknown>) => ({ url: 'http://localhost/api/test', headers: new Headers({ authorization: 'Bearer test' }), json: async () => body });
  try {
    const card = await db.card.create({ data: { userId: user.id, name: 'BBVA prueba', usualCutDay: 21, usualDueDay: 12 } });
    const cycle = await db.cardCycle.create({ data: {
      userId: user.id, cardId: card.id, month: 9, year: 2026,
      startDate: new Date('2026-08-22'), cutDate: new Date('2026-09-21'), dueDate: new Date('2026-10-12'), statementAmount: '8355.21',
    } });
    const refund = { id: cycle.id, action: 'UPDATE_POST_CUT_CREDIT', postCutCreditAmount: '1499.50', postCutCreditDate: '2026-10-05', postCutCreditNotes: 'Devolución confirmada de prueba' };
    const payment = { id: cycle.id, action: 'MARK_AS_PAID', paidAmount: '6855.71', paidAt: '2026-10-12' };
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => route.PATCH(request(i % 2 ? refund : payment))));
    assert.ok(results.every(result => result.status === 200));
    const saved = await db.cardCycle.findUnique({ where: { id: cycle.id } });
    assert.equal(present(saved).postCutCreditAmount.toFixed(2), '1499.50');
    assert.equal(present(present(saved).paidAmount).toFixed(2), '6855.71');
    assert.equal(present(present(saved).statementAmount).toFixed(2), '8355.21');
    assert.equal(present(saved).status, 'PAID');
    assert.equal(await db.income.count({ where: { userId: user.id } }), 0);
    assert.equal(await db.dailyExpense.count({ where: { userId: user.id } }), 0);
    const dashboard = await load('src/app/api/dashboard/route.ts').GET(request());
    assert.equal(dashboard.status, 200);
    assert.equal(record(array(dashboard.body.cycles)[0]).pendingAmount, 0);
    assert.equal(array(dashboard.body.importantNotices).some(n => record(n).type === 'CARD_PAYMENT'), false);
    actor = another.id;
    assert.equal((await route.PATCH(request(refund))).status, 404);
    actor = user.id;
    fail = true;
    assert.equal((await route.PATCH(request({ ...refund, postCutCreditAmount: 0 }))).status, 500);
    assert.deepEqual(await db.cardCycle.findUnique({ where: { id: cycle.id } }), saved);
    fail = false;
    assert.equal(record((await route.PATCH(request({ ...refund, postCutCreditAmount: '1499.49' }))).body.cycle).pendingAmount, 0.01);
    const reopened = await load('src/app/api/dashboard/route.ts').GET(request());
    assert.equal(record(array(reopened.body.importantNotices).find(n => record(n).type === 'CARD_PAYMENT')).amount, 0.01);
  } finally {
    await db.user.deleteMany({ where: { id: { in: [user.id, another.id] } } });
    await db.$disconnect();
  }
});
