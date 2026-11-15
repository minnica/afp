import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { dashboardReceivables } from '../src/lib/dashboardDebts';
import { buildReceivableNotices } from '../src/lib/importantNotices';
import { dynamicRoute, fixedDate, financialLoader, testReply } from './helpers/financial-fixtures';
import { fixtureDatabase } from './helpers/fixture-database';
import { array, record } from './helpers/dynamic-values';

const connection = process.env.AFP_TEST_DATABASE_URL;

test('PostgreSQL: registrar un cobro dos días antes retira el aviso sin alterar su fecha ni duplicar el abono', { skip: !connection }, async () => {
  assert.ok(connection);
  const db = await fixtureDatabase(connection);
  try {
    const user = await db.user.create({ data: { email: `early-collection-${randomUUID()}@example.test` } });
    try {
      const person = await db.person.create({ data: { userId: user.id, name: 'Persona ficticia' } });
      const type = await db.incomeType.create({ data: { userId: user.id, name: 'Pago recibido' } });
      for (const [chargeDay, incomeDay, today, days] of [
        ['2026-11-15', '2026-11-13', '2026-11-14', [15, 31]],
        ['2027-01-01', '2026-12-30', '2027-01-01', [1, 15]],
        ['2028-02-29', '2028-02-27', '2028-02-28', [15, 31]],
      ] as const) {
        const account = await db.receivableAccount.create({ data: { userId: user.id, personId: person.id,
          concept: 'Cobro ficticio', originalAmount: 5000, originType: 'MANUAL', originDate: new Date('2026-01-01T12:00:00Z'),
          expectedChargeDays: [...days], expectedMonthlyPayment: 100 } });
        const load = financialLoader({
          '@/lib/prisma': { prisma: db },
          '@/lib/calendar/schedule': { scheduleCalendarSync() {} },
          '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: user.id } } }) } }) },
          'next/server': { NextResponse: { json: testReply } },
        }, { Date: fixedDate(new Date(`${today}T12:00:00Z`)) });
        const request = (route: string, body?: Record<string, unknown>) => ({
          url: `http://localhost/api/${route}?clientDate=${today}`, headers: new Headers({ authorization: 'Bearer test' }), json: async () => body,
        });
        const route = dynamicRoute(load('src/app/api/incomes/route.ts'));
        const saved = await route.POST(request('incomes', { date: incomeDay, incomeTypeId: type.id, source: person.name,
          concept: account.concept, amount: 100, receivableAccountId: account.id, notes: 'Abono anticipado ficticio' }));
        assert.equal(saved.status, 200);
        const stored = await db.income.findMany({ where: { receivableAccountId: account.id } });
        assert.equal(stored.length, 1);
        assert.equal(stored[0]?.date.toISOString().slice(0, 10), incomeDay);
        assert.equal(stored[0]?.notes, 'Abono anticipado ficticio');
        assert.equal(Number(stored[0]?.amount), 100);
        const read = await dashboardReceivables(db, user.id, new Date(`${today}T12:00:00Z`));
        const current = read.find(item => item.id === account.id)!;
        assert.equal(current.incomes.length, 1, 'la consulta incluye anticipos del mes anterior');
        const hasTarget = (notices: unknown[]) => notices.some(item => record(item).receivableAccountId === account.id && String(record(item).date).slice(0, 10) === chargeDay);
        for (const path of ['dashboard', 'dashboard/summary'] as const) {
          const full = await dynamicRoute(load(`src/app/api/${path}/route.ts`)).GET(request(path));
          assert.equal(full.status, 200);
          assert.equal(hasTarget(array(full.body.importantNotices)), false, path);
        }
        await db.income.delete({ where: { id: stored[0]!.id } });
        const restored = await dashboardReceivables(db, user.id, new Date(`${today}T12:00:00Z`));
        assert.ok(buildReceivableNotices(restored, new Date(`${today}T12:00:00Z`)).some(notice => notice.receivableAccountId === account.id && new Date(notice.date).toISOString().slice(0, 10) === chargeDay));
      }
    } finally { await db.user.delete({ where: { id: user.id } }); }
  } finally { await db.$disconnect(); }
});
