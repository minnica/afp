import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { array, record } from './helpers/dynamic-values';
import { fixedDate, financialLoader, testReply } from './helpers/financial-fixtures';
import { fixtureDatabase } from './helpers/fixture-database';

const connectionString = process.env.AFP_TEST_DATABASE_URL;

test('PostgreSQL A04: el estado guardado coincide con Tarjetas y Dashboard al cambiar día, mes y año en México', { skip: !connectionString }, async () => {
  assert.ok(connectionString);
  const db = await fixtureDatabase(connectionString);
  try {
    const user = await db.user.create({ data: { email: `a04-${randomUUID()}@example.test` } });
    try {
      const card = await db.card.create({ data: { userId: user.id, name: 'Tarjeta A04', usualCutDay: 10, usualDueDay: 15 } });
      const cycle = await db.cardCycle.create({ data: {
        userId: user.id, cardId: card.id, month: 10, year: 2026,
        startDate: new Date('2026-09-11'), cutDate: new Date('2026-10-10'),
        dueDate: new Date('2026-10-15'), statementAmount: '1000', status: 'OVERDUE',
      } });
      for (const dueDate of ['2026-10-15', '2026-10-31', '2026-12-31']) {
        await db.cardCycle.update({ where: { id: cycle.id }, data: { dueDate: new Date(dueDate) } });
        const followingDay = new Date(Date.parse(dueDate) + 86400000).toISOString().slice(0, 10);
        for (const [time, expected, group] of [
          ['00:01:00Z', 'PAYMENT_PENDING', 'today'],
          ['05:59:59.999Z', 'PAYMENT_PENDING', 'today'],
          ['06:00:00Z', 'OVERDUE', 'overdue'],
        ] as const) {
          const load = financialLoader({
            '@/lib/prisma': { prisma: db },
            '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: user.id } } }) } }) },
            'next/server': { NextResponse: { json: testReply } },
          }, { Date: fixedDate(new Date(`${followingDay}T${time}`)) });
          const request = (route: string, body?: Record<string, unknown>) => ({
            url: `http://localhost/api/${route}`, headers: new Headers({ authorization: 'Bearer test' }),
            json: async () => body,
          });
          const cycles = load('src/app/api/card-cycles/route.ts');
          const saved = await cycles.PATCH(request('card-cycles', { id: cycle.id, action: 'UPDATE_STATEMENT', statementAmount: 1000 }));
          assert.equal(saved.status, 200);
          assert.equal(record(saved.body.cycle).displayStatus, expected);
          assert.equal((await db.cardCycle.findUniqueOrThrow({ where: { id: cycle.id } })).status, expected);
          const listed = await cycles.GET(request('card-cycles'));
          assert.equal(listed.status, 200);
          assert.equal(record(array(listed.body.cycles)[0]).displayStatus, expected);
          const dashboard = await load('src/app/api/dashboard/route.ts').GET(request('dashboard'));
          assert.equal(dashboard.status, 200);
          assert.equal(record(array(dashboard.body.cycles)[0]).displayStatus, expected);
          const notice = array(dashboard.body.importantNotices).find(n => record(n).type === 'CARD_PAYMENT');
          assert.equal(record(notice).group, group);
        }
      }
    } finally {
      await db.user.delete({ where: { id: user.id } });
    }
  } finally {
    await db.$disconnect();
  }
});
