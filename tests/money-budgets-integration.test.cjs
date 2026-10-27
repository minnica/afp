const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { sourceLoader } = require('./helpers/load-source.cjs');
const connectionString = process.env.AFP_TEST_DATABASE_URL;

test('presupuesto mixto: API real, persistencia, propietario, reintentos y conservación de movimientos', { skip: !connectionString }, async t => {
  const url = new URL(connectionString);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && /^\/afp_test[a-zA-Z0-9_]*$/.test(url.pathname) && !url.search);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const owner = await db.user.create({ data: { email: `budget-${randomUUID()}@example.test` } });
  const other = await db.user.create({ data: { email: `budget-${randomUUID()}@example.test` } });
  let actor = owner.id;
  const load = sourceLoader({ '@/lib/prisma': { prisma: db }, '@/lib/calendar/schedule': { scheduleCalendarSync: () => {} }, '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async token => ({ data: { user: token === 'test' ? { id: actor } : null } }) } }) }, 'next/server': { NextResponse: { json: (body, options = {}) => ({ body: JSON.parse(JSON.stringify(body)), status: options.status || 200, headers: new Headers(options.headers) }) } } });
  const route = load('src/app/api/money/route.js');
  const request = body => ({ url: 'http://localhost/api/money', headers: new Headers({ authorization: 'Bearer test' }), json: async () => body });
  const write = body => route.POST(request({ operationId: randomUUID(), ...body }));
  const ok = response => { assert.equal(response.status, 200, JSON.stringify(response.body)); return response.body; };
  try {
    const account = ok(await write({ action: 'CREATE_ACCOUNT', name: 'Cuenta QA', kind: 'BANK', openingBalance: 10000, reservedAmount: 0, asOf: '2026-10-01' }));
    ok(await write({ action: 'ROUTE', key: 'default:expense', accountId: account.id, excluded: false }));
    ok(await write({ action: 'ROUTE', key: 'default:card', accountId: account.id, excluded: false }));
    const category = await db.category.create({ data: { userId: owner.id, name: 'Comida QA' } });
    const foreignCategory = await db.category.create({ data: { userId: other.id, name: 'Ajena' } });
    const card = await db.card.create({ data: { userId: owner.id, name: 'Crédito QA', usualCutDay: 31, usualDueDay: 10 } });
    const foreignCard = await db.card.create({ data: { userId: other.id, name: 'Ajena', usualCutDay: 31, usualDueDay: 10 } });
    await db.dailyExpense.createMany({ data: [
      { userId: owner.id, categoryId: category.id, concept: 'Mayo', amount: 75, date: new Date('2026-05-10T12:00:00Z'), paymentMethod: 'CASH' },
      { userId: owner.id, categoryId: category.id, concept: 'Junio', amount: 25, date: new Date('2026-06-10T12:00:00Z'), paymentMethod: 'CARD', cardId: card.id },
      { userId: other.id, categoryId: foreignCategory.id, concept: 'No pertenece a la muestra', amount: 9999, date: new Date('2026-06-10T12:00:00Z'), paymentMethod: 'CARD', cardId: foreignCard.id },
    ] });
    const originalExpenses = await db.dailyExpense.findMany({ where: { userId: owner.id }, orderBy: { id: 'asc' } });
    const payload = { action: 'SAVE_PLAN', name: 'Comida QA', kind: 'VARIABLE', amount: 3100, accountId: account.id, categoryId: category.id, startDate: '2026-10-01', endDate: '2026-11-30', frequencyMonths: 1, days: [], isActive: true, useHistoricalPayments: true, referenceMonths: ['2026-05', '2026-06'] };
    let id;
    await t.test('crea una previsión y un recibo aunque lleguen reintentos concurrentes', async () => {
      const operationId = randomUUID(), body = { ...payload, operationId };
      const responses = await Promise.all([route.POST(request(body)), route.POST(request(body))]);
      id = ok(responses[0]).id; assert.equal(ok(responses[1]).id, id);
      assert.equal(await db.moneyPlan.count({ where: { userId: owner.id } }), 1);
      const saved = await db.moneyPlan.findUnique({ where: { id } });
      assert.equal(saved.paymentMix.cashWeight, 7500); assert.equal(saved.paymentMix.cards[0].weight, 2500);
      assert.equal(saved.paymentMix.cards[0].cardId, card.id);
      assert.equal(saved.paymentMix.sampleCount, 2);
      assert.deepEqual(saved.paymentMix.referenceMonths, ['2026-05', '2026-06']);
    });
    await t.test('preserva el historial al editar el importe, valida versiones y permite volver a cuenta fija', async () => {
      const current = await db.moneyPlan.findUnique({ where: { id } });
      // Un cliente anterior que no envía la opción no borra la estimación existente.
      const { useHistoricalPayments, referenceMonths, ...legacy } = payload;
      ok(await write({ ...legacy, id, version: current.version, amount: 3200 }));
      const changed = await db.moneyPlan.findUnique({ where: { id } });
      assert.deepEqual(changed.paymentMix, current.paymentMix);
      assert.equal((await write({ ...payload, id, version: current.version })).status, 409);
      ok(await write({ ...payload, id, version: changed.version, useHistoricalPayments: false }));
      assert.equal((await db.moneyPlan.findUnique({ where: { id } })).paymentMix, null);
    });
    await t.test('valida meses completos, categoría, tarjeta fija y referencias de otro propietario', async () => {
      const current = await db.moneyPlan.findUnique({ where: { id } });
      const edit = { ...payload, id, version: current.version };
      for (const extra of [{ referenceMonths: ['2099-01'] }, { cardId: card.id }, { referenceMonths: ['2026-99'] }]) assert.equal((await write({ ...edit, ...extra })).status, 400);
      assert.equal((await write({ ...edit, categoryId: foreignCategory.id })).status, 404);
      actor = other.id;
      assert.equal((await write(edit)).status, 404);
      actor = owner.id;
      assert.equal((await db.moneyPlan.findUnique({ where: { id } })).version, current.version);
    });
    await t.test('consulta y cálculo conservan gastos, saldos y filas financieras reales', async () => {
      const current = await db.moneyPlan.findUnique({ where: { id } });
      ok(await write({ ...payload, id, version: current.version }));
      const response = ok(await route.GET(request()));
      assert.equal(response.forecast.summary.balance, 10000);
      assert.equal(response.forecast.variableBudgets.length, 1);
      assert.equal(response.forecast.variableBudgets[0].monthlyAmount, 3100);
      assert.deepEqual(await db.dailyExpense.findMany({ where: { userId: owner.id }, orderBy: { id: 'asc' } }), originalExpenses);
      assert.equal(await db.income.count({ where: { userId: owner.id } }), 0);
      assert.equal(await db.moneyCardPayment.count({ where: { userId: owner.id } }), 0);
    });
    await t.test('la restricción de PostgreSQL rechaza configuraciones de otro tipo de previsión', async () => {
      await assert.rejects(db.moneyPlan.update({ where: { id }, data: { kind: 'INCOME' } }), /constraint/i);
      await assert.rejects(db.moneyPlan.update({ where: { id }, data: { paymentMix: { version: 2 } } }), /constraint/i);
      assert.equal((await db.moneyPlan.findUnique({ where: { id } })).kind, 'VARIABLE');
    });
  } finally {
    await db.user.deleteMany({ where: { id: { in: [owner.id, other.id] } } });
    await db.$disconnect();
  }
});
