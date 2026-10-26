const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { sourceLoader } = require('./helpers/load-source.cjs');
const connectionString = process.env.AFP_TEST_DATABASE_URL;

test('Mi dinero: API, PostgreSQL, aislamiento, cuentas, abonos, conciliación y proyección', { skip: !connectionString }, async t => {
  const url = new URL(connectionString); assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && /^\/afp_test[a-zA-Z0-9_]*$/.test(url.pathname) && !url.search);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const user = await db.user.create({ data: { email: `money-${randomUUID()}@example.test` } });
  const other = await db.user.create({ data: { email: `money-${randomUUID()}@example.test` } });
  let actor = user.id;
  const load = sourceLoader({ '@/lib/prisma': { prisma: db }, '@/lib/calendar/schedule': { scheduleCalendarSync: () => {} }, '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async token => ({ data: { user: token === 'test' ? { id: actor } : null } }) } }) }, 'next/server': { NextResponse: { json: (body, options = {}) => ({ body: JSON.parse(JSON.stringify(body)), status: options.status || 200, headers: new Headers(options.headers) }) } } });
  const route = load('src/app/api/money/route.js'), today = load('src/lib/money/dates.js').todayInMexico(), yesterday = load('src/lib/money/dates.js').addDays(today, -1);
  const request = (body = {}, query = '', token = 'test') => ({ method: 'POST', url: `http://localhost/api/money?${query}`, headers: new Headers(token ? { authorization: `Bearer ${token}` } : {}), json: async () => body });
  const ok = response => { assert.equal(response.status, 200, JSON.stringify(response.body)); return response.body; };
  const write = body => route.POST(request({ operationId: randomUUID(), ...body }));
  const read = async (query = '') => ok(await route.GET(request({}, query)));
  let account, second, cycle, type, category;
  try {
    await t.test('rechaza anónimos y tokens inválidos sin consultar datos', async () => { assert.equal((await route.GET(request({}, '', ''))).status, 401); assert.equal((await route.POST(request({}, '', 'bad'))).status, 401); });
    type = await db.incomeType.create({ data: { userId: user.id, name: 'Nómina QA' } }); category = await db.category.create({ data: { userId: user.id, name: 'Comida QA' } });
    await t.test('captura inicial y reintentos conservan una sola cuenta', async () => {
      const body = { action: 'CREATE_ACCOUNT', operationId: randomUUID(), name: 'Nómina', kind: 'BANK', openingBalance: '10000.25', asOf: today, reservedAmount: 1000, annualYield: 10, yieldIncomeTypeId: type.id };
      const replies = await Promise.all(Array.from({ length: 4 }, () => route.POST(request(body)))); account = ok(replies[0]).id; for (const reply of replies) assert.equal(ok(reply).id, account);
      assert.equal(await db.moneyAccount.count({ where: { userId: user.id } }), 1);
      assert.equal((await route.POST(request({ ...body, name: 'Distinta' }))).status, 409);
      assert.equal((await read()).forecast.summary.balance, 10000.25);
      second = ok(await write({ action: 'CREATE_ACCOUNT', name: 'Efectivo', kind: 'CASH', openingBalance: 0, asOf: today, reservedAmount: 0 })).id;
    });
    await t.test('reglas, ingresos y gastos reales actualizan saldo sin duplicar', async () => {
      ok(await write({ action: 'ROUTE', key: 'default:income', accountId: account, excluded: false })); ok(await write({ action: 'ROUTE', key: 'default:expense', accountId: account, excluded: false }));
      await db.income.create({ data: { userId: user.id, incomeTypeId: type.id, source: 'QA', concept: 'Nómina', date: new Date(today), amount: 1000 } });
      const expense = await db.dailyExpense.create({ data: { userId: user.id, categoryId: category.id, concept: 'Compra', date: new Date(today), amount: 10.10, paymentMethod: 'CASH' } });
      assert.equal((await read()).forecast.summary.balance, 10990.15);
      await db.dailyExpense.update({ where: { id: expense.id }, data: { amount: 20.20 } }); assert.equal((await read()).forecast.summary.balance, 10980.05);
      await db.dailyExpense.delete({ where: { id: expense.id } }); assert.equal((await read()).forecast.summary.balance, 11000.25);
    });
    await t.test('transferencias atómicas e idempotentes conservan el total; se pueden revertir', async () => {
      const body = { action: 'TRANSFER', operationId: randomUUID(), fromAccountId: account, toAccountId: second, date: today, concept: 'Retiro', amount: '200.25' };
      const transfer = ok(await route.POST(request(body))); ok(await route.POST(request(body)));
      const value = (await read()).forecast; assert.equal(value.summary.balance, 11000.25); assert.equal(value.accounts.find(a => a.id === second).balance, 200.25);
      ok(await write({ action: 'REVERSE_TRANSFER', id: transfer.id })); assert.equal((await read()).forecast.accounts.find(a => a.id === second).balance, 0);
    });
    await t.test('más de 100 ingresos se agregan completos', async () => {
      await db.income.createMany({ data: Array.from({ length: 105 }, (_, n) => ({ userId: user.id, incomeTypeId: type.id, source: 'QA', concept: `Ingreso ${n}`, date: new Date(today), amount: 1 })) });
      assert.equal((await read()).forecast.summary.balance, 11105.25);
    });
    await t.test('conciliar no crea ingreso; conserva historial y detecta ediciones concurrentes', async () => {
      const count = await db.income.count({ where: { userId: user.id } }); const a = (await read()).forecast.accounts.find(a => a.id === account);
      const body = { action: 'RECONCILE', operationId: randomUUID(), accountId: account, version: a.version, bankBalance: '12000', reason: 'Saldo del banco QA' };
      ok(await route.POST(request(body))); assert.equal((await read()).forecast.summary.balance, 12000);
      await db.income.create({ data: { userId: user.id, incomeTypeId: type.id, source: 'QA', concept: 'Después de conciliación', date: new Date(today), amount: 2.25 } });
      ok(await route.POST(request(body))); assert.equal((await read()).forecast.summary.balance, 12002.25);
      assert.equal((await write({ ...body, operationId: randomUUID() })).status, 409); assert.equal(await db.moneyReconciliation.count({ where: { accountId: account } }), 1); assert.equal(await db.income.count({ where: { userId: user.id } }), count + 1);
    });
    await t.test('un abono nuevo modifica corte y cuenta una vez; reversión conserva historial', async () => {
      const card = await db.card.create({ data: { userId: user.id, name: 'Crédito QA', usualCutDay: 10, usualDueDay: 30 } });
      cycle = await db.cardCycle.create({ data: { userId: user.id, cardId: card.id, month: Number(today.slice(5, 7)), year: Number(today.slice(0, 4)), startDate: new Date(`${today.slice(0, 7)}-01`), cutDate: new Date(yesterday), dueDate: new Date(today), statementAmount: 1000 } });
      const count = await db.dailyExpense.count({ where: { userId: user.id } });
      const body = { action: 'CARD_PAYMENT', operationId: randomUUID(), cycleId: cycle.id, accountId: account, amount: 250.25, date: today, additional: true };
      const payment = ok(await route.POST(request(body))); ok(await route.POST(request(body)));
      assert.equal((await read()).forecast.summary.balance, 11752); assert.equal(Number((await db.cardCycle.findUnique({ where: { id: cycle.id } })).paidAmount), 250.25);
      assert.equal(await db.dailyExpense.count({ where: { userId: user.id } }), count);
      await assert.rejects(db.cardCycle.update({ where: { id: cycle.id }, data: { paidAmount: 0 } }), error => {
        assert.equal(load('src/lib/apiAuth.js').apiAccessErrorResponse(error)?.status, 409); return true;
      });
      assert.equal((await write({ ...body, operationId: randomUUID(), amount: 900 })).status, 409);
      ok(await write({ action: 'REVERSE_PAYMENT', id: payment.id })); assert.equal((await read()).forecast.summary.balance, 12002.25);
      assert.ok((await db.moneyCardPayment.findUnique({ where: { id: payment.id } })).reversedAt);
    });
    await t.test('previsiones, ocurrencias y escenarios no generan movimientos reales', async () => {
      const before = await db.income.count({ where: { userId: user.id } });
      const plan = ok(await write({ action: 'SAVE_PLAN', name: 'Nómina futura', kind: 'PAYROLL', amount: 1000, accountId: account, frequencyMonths: 1, days: [15, 31], startDate: today, endDate: '', isActive: true }));
      let result = await read(); assert.ok(result.forecast.events.some(e => e.planId === plan.id));
      const occurrence = result.forecast.planOccurrences.find(o => o.planId === plan.id);
      ok(await write({ action: 'OCCURRENCE', planId: plan.id, date: occurrence.date, status: 'SKIPPED' })); result = await read(); assert.ok(!result.forecast.events.some(e => e.key === `plan:${plan.id}:${occurrence.date}`));
      const scenario = await read(`stopPayrollDate=${today}&collectionDelay=10&variablePercent=80`); assert.ok(scenario.simulated); assert.ok(!scenario.simulated.events.some(e => e.kind === 'PAYROLL')); assert.equal(await db.income.count({ where: { userId: user.id } }), before);
      assert.ok(scenario.forecast.events.some(e => e.kind === 'YIELD')); assert.ok(scenario.forecast.events.filter(e => e.kind === 'YIELD').every(e => e.status === 'ESTIMATED'));
    });
    await t.test('aislamiento entre usuarios, referencias ajenas y sin filtración por userId', async () => {
      actor = other.id; assert.equal((await read(`userId=${user.id}`)).forecast.accounts.length, 0);
      for (const payload of [{ action: 'RECONCILE', accountId: account, version: 1, bankBalance: 1, reason: 'Ataque' }, { action: 'UPDATE_ACCOUNT', id: account, version: 1, openingBalance: 1 }, { action: 'ROUTE', key: 'default:income', accountId: account, excluded: false }, { action: 'CARD_PAYMENT', cycleId: cycle.id, accountId: account, amount: 1, date: today, additional: true }]) assert.equal((await write(payload)).status, 404);
      assert.equal((await write({ action: 'CREATE_ACCOUNT', name: 'Ajena', kind: 'BANK', openingBalance: 1, reservedAmount: 0, asOf: today, yieldIncomeTypeId: type.id })).status, 404);
      actor = user.id; assert.equal((await read()).forecast.accounts.length, 2);
    });
    await t.test('RLS y lecturas sin escritura', async () => {
      const rows = await db.$queryRaw`SELECT relname, relrowsecurity FROM pg_class WHERE relname LIKE 'money_%' AND relkind = 'r'`;
      assert.equal(rows.length, 9); assert.ok(rows.every(r => r.relrowsecurity));
      const before = await db.moneyAccount.findMany({ where: { userId: user.id } }); await read(); await read(); assert.deepEqual(await db.moneyAccount.findMany({ where: { userId: user.id } }), before);
      const headers = (await route.GET(request())).headers; assert.equal(headers.get('Cache-Control'), 'private, no-store');
    });
    await t.test('editar el saldo de referencia conserva movimientos, historial, versiones y reintentos', async () => {
      const before = (await read()).forecast.accounts.find(a => a.id === account);
      const incomeCount = await db.income.count({ where: { userId: user.id } });
      const expenseCount = await db.dailyExpense.count({ where: { userId: user.id } });
      const historyCount = await db.moneyReconciliation.count({ where: { accountId: account } });
      const body = { action: 'UPDATE_ACCOUNT', operationId: randomUUID(), id: account, version: before.version, openingBalance: '11000.10' };
      ok(await route.POST(request(body))); ok(await route.POST(request(body)));
      let after = (await read()).forecast.accounts.find(a => a.id === account);
      assert.equal(Number(after.openingBalance), 11000.10); assert.equal(after.balance, 11002.35);
      assert.equal(after.delta, before.delta); assert.deepEqual(after.baseline, before.baseline); assert.equal(after.asOf, before.asOf);
      assert.equal(after.version, before.version + 1);
      assert.equal(await db.income.count({ where: { userId: user.id } }), incomeCount);
      assert.equal(await db.dailyExpense.count({ where: { userId: user.id } }), expenseCount);
      assert.equal(await db.moneyReconciliation.count({ where: { accountId: account } }), historyCount + 1);
      const correction = after.reconciliations.find(r => r.reason.startsWith('Corrección del saldo de referencia'));
      assert.equal(Number(correction.previousBalance), before.balance); assert.equal(Number(correction.bankBalance), after.balance);
      assert.equal(Number(correction.snapshot.openingBalance), Number(before.openingBalance));
      assert.equal(correction.snapshot.reconciliations, undefined);
      assert.equal((await write({ ...body, operationId: randomUUID() })).status, 409);
      assert.equal((await write({ ...body, operationId: randomUUID(), version: after.version, openingBalance: 'no es dinero' })).status, 400);
      // La corrección y su historial se revierten juntos si falla otra parte de la edición.
      assert.equal((await write({ ...body, operationId: randomUUID(), version: after.version, openingBalance: 1, name: 'Efectivo' })).status, 409);
      after = (await read()).forecast.accounts.find(a => a.id === account);
      assert.equal(Number(after.openingBalance), 11000.10);
      assert.equal(await db.moneyReconciliation.count({ where: { accountId: account } }), historyCount + 1);
      ok(await write({ action: 'UPDATE_ACCOUNT', id: account, version: after.version, name: 'Nómina corregida' }));
      assert.equal(await db.moneyReconciliation.count({ where: { accountId: account } }), historyCount + 1);
    });
    await t.test('corregir una referencia anterior no repite ingresos ni transferencias posteriores', async () => {
      const backdated = ok(await write({ action: 'CREATE_ACCOUNT', name: 'Referencia anterior', kind: 'BANK', openingBalance: 100, asOf: yesterday, reservedAmount: 0 })).id;
      const deposit = await db.income.create({ data: { userId: user.id, incomeTypeId: type.id, source: 'QA', concept: 'Ingreso posterior a la referencia', date: new Date(today), amount: '7.89' } });
      ok(await write({ action: 'ROUTE', key: `income:${deposit.id}`, accountId: backdated, excluded: false }));
      ok(await write({ action: 'TRANSFER', fromAccountId: backdated, toAccountId: second, date: today, concept: 'Movimiento posterior', amount: 5 }));
      const before = (await read()).forecast.accounts.find(a => a.id === backdated);
      assert.equal(before.balance, 102.89);
      ok(await write({ action: 'UPDATE_ACCOUNT', id: backdated, version: before.version, openingBalance: '300.01', asOf: today }));
      const after = (await read()).forecast.accounts.find(a => a.id === backdated);
      assert.equal(after.balance, 302.90); assert.equal(after.delta, 2.89);
      assert.equal(after.asOf, before.asOf); assert.deepEqual(after.baseline, before.baseline);
      assert.equal(after.reconciliations.length, 1);
    });
  } finally { await db.user.deleteMany({ where: { id: { in: [user.id, other.id] } } }); await db.$disconnect(); }
});
