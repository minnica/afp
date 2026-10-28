import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { record } from './helpers/dynamic-values';
import { present, sparseCalculations } from './helpers/financial-fixtures';
import { sourceLoader } from './helpers/load-source.ts';
const connectionString = process.env.AFP_TEST_DATABASE_URL;
test('nómina hábil: guarda el plan sin duplicados, aplica abonos reales y evita ingresos simulados', { skip: !connectionString }, async () => {
  assert.ok(connectionString);
  const url = new URL(connectionString); assert.ok(['127.0.0.1','localhost'].includes(url.hostname) && /^\/afp_test[a-zA-Z0-9_]*$/.test(url.pathname) && !url.search);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const user = await db.user.create({ data: { email: `payroll-${randomUUID()}@example.test` } });
  const load = sourceLoader({ '@/lib/prisma': { prisma: db }, '@/lib/calendar/schedule': { scheduleCalendarSync: () => {} } });
  const { mutateMoney, loadMoneyData } = load('src/lib/money/service.ts'), { buildForecast } = sparseCalculations(load('src/lib/money/forecast.ts'));
  const write = (body: Record<string, unknown>) => mutateMoney(db, user.id, { operationId: randomUUID(), ...body }, '2026-10-24');
  const read = () => db.$transaction(async tx => { await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY'); return buildForecast(await loadMoneyData(tx,user.id),'2026-10-24'); }, { isolationLevel: 'RepeatableRead' });
  try {
    const account = await write({ action: 'CREATE_ACCOUNT', name: 'Banco nómina ficticio', kind: 'BANK' as const, openingBalance: 100, asOf: '2026-10-24', reservedAmount: 0 });
    const type = await db.incomeType.create({ data: { userId: user.id, name: 'Nómina ficticia' } });
    await write({ action: 'ROUTE', key: `incomeType:${type.id}`, accountId: account.id, excluded: false });
    const body = { action: 'SAVE_PLAN', operationId: randomUUID(), name: 'Nómina neta ficticia', kind: 'PAYROLL' as const, amount: 5000, accountId: account.id, incomeTypeId: type.id, startDate: '2026-10-24', frequencyMonths: 1, days: [15,31], payrollBusinessDays: true, isActive: true };
    const plan = await write(body); await write(body);
    assert.equal(await db.moneyPlan.count({ where: { userId: user.id } }),1);
    assert.equal(present((await db.moneyPlan.findUnique({ where: { id: plan.id } }))).payrollBusinessDays,true);
    let result = await read(); assert.equal(result.summary.balance,100);
    assert.equal(present(result.events.find(e => e.planId === plan.id)).date,'2026-10-30');
    assert.equal(await db.income.count({ where: { userId: user.id } }),0);
    const income = await db.income.create({ data: { userId: user.id, incomeTypeId: type.id, source: 'QA', concept: 'Nómina futura ficticia', amount: 5000, date: new Date('2026-10-30') } });
    result = await read(); assert.ok(!result.events.some(e => e.planId === plan.id && e.date === '2026-10-30'));
    assert.equal(present(result.events.find(e => e.key === `income:${income.id}`)).accountId,account.id);
    await write({ action: 'ROUTE', key: `income:${income.id}`, accountId: account.id, excluded: false, planId: plan.id, occurrenceDate: '2026-10-30' });
    result = await read(); assert.equal(present(result.planOccurrences.find(o => o.date === '2026-10-30')).status,'MATCHED');
    await assert.rejects(write({ action: 'ROUTE', key: `income:${income.id}`, accountId: account.id, excluded: false, planId: plan.id, occurrenceDate: '2026-10-31' }), e => record(e).status === 400);
  } finally { await db.user.delete({ where: { id: user.id } }); await db.$disconnect(); }
});
