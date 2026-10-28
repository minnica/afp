const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { sourceLoader } = require('./helpers/load-source.ts');
const connectionString = process.env.AFP_TEST_DATABASE_URL;

test('PostgreSQL: contratos JSON de todos los flujos financieros, variantes y pago parcial', { skip: !connectionString }, async () => {
  const url = new URL(connectionString);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && /^\/afp_test\w*$/.test(url.pathname) && !url.search && !url.hash);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const user = await db.user.create({ data: { email: `ts4-${randomUUID()}@example.test` } });
  const load = sourceLoader({
    '@/lib/prisma': { prisma: db },
    '@/lib/calendar/schedule': { scheduleCalendarSync() {} },
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body: JSON.parse(JSON.stringify(body)), status: init.status || 200 }) } },
    '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async () => ({ data: { user } }) } }) },
  });
  const { validateFinancialResponse, financialReadSchemas } = load('src/lib/financialResponses.ts');
  const { uiResponseSchemas } = load('src/lib/uiResponseSchemas.ts');
  async function call(resource, method = 'GET', body, params = '') {
    const response = await load(`src/app/api/${resource}/route`)[method]({
      method, headers: new Headers({ authorization: 'Bearer fictitious' }),
      url: `http://localhost/api/${resource}?${params}`, json: async () => body,
    });
    assert.equal(response.status, 200, `${method} ${resource}: ${JSON.stringify(response.body)}`);
    validateFinancialResponse(`/api/${resource}`, method, response.body);
    if (method === 'GET' && resource in uiResponseSchemas) {
      const parsed = uiResponseSchemas[resource].parse(response.body);
      assert.deepEqual(JSON.parse(JSON.stringify(parsed)), response.body, `El contrato UI conserva ${resource}`);
    }
    return response.body;
  }
  try {
    const today = new Date().toISOString().slice(0, 10), month = today.slice(0, 7);
    const category = await db.category.create({ data: { userId: user.id, name: 'Categoría ficticia' } });
    const person = await db.person.create({ data: { userId: user.id, name: 'Persona ficticia' } });
    const incomeType = await db.incomeType.create({ data: { userId: user.id, name: 'Ingreso ficticio' } });
    const account = await db.moneyAccount.create({ data: { userId: user.id, name: 'Débito ficticio', kind: 'BANK', openingBalance: 1000, baseline: {}, asOf: new Date('2020-01-01') } });
    const { card } = await call('cards', 'POST', { name: 'Tarjeta ficticia', usualCutDay: 10, usualDueDay: 25 });
    const generated = await call('card-cycles', 'POST', {});
    const cycle = generated.cycles[0];
    await call('card-cycles', 'GET', undefined, `cycleId=${cycle.id}`);
    const zero = await call('card-cycles', 'PATCH', { id: cycle.id, action: 'UPDATE_STATEMENT', statementAmount: '0' });
    assert.equal(zero.cycle.pendingAmount, 0);
    assert.equal(zero.cycle.paymentStatus, 'NO_PAYMENT_DUE');
    await call('card-cycles', 'PATCH', { id: cycle.id, action: 'UPDATE_STATEMENT', statementAmount: '100.25' });
    const partial = await call('card-cycles', 'PATCH', { id: cycle.id, action: 'MARK_AS_PAID', paidAmount: '30.10', paidAt: today });
    assert.equal(partial.cycle.pendingAmount, 70.15);
    assert.equal(partial.cycle.paymentStatus, 'PARTIALLY_PAID');
    const { receivable } = await call('receivables', 'POST', { personId: person.id, concept: 'Cobro', originalAmount: '150.50', originDate: today, expectedChargeDays: '1, 15' });
    const { payable } = await call('payables', 'POST', { personId: person.id, concept: 'Deuda', originalAmount: '200.50', originDate: today, expectedDate: today });
    await call('incomes', 'POST', { date: today, incomeTypeId: incomeType.id, source: 'Persona', concept: 'Abono', amount: '20.25', receivableAccountId: receivable.id });
    const common = { date: today, categoryId: category.id, concept: 'Gasto', amount: '10.25' };
    const cash = { ...common, paymentMethod: 'CASH', operationId: randomUUID(), payableAccountId: payable.id };
    const saved = await call('expenses', 'POST', cash);
    assert.equal((await call('expenses', 'POST', cash)).expense.id, saved.expense.id);
    const receipt = await db.expenseOperation.findUnique({ where: { userId_operationId: { userId: user.id, operationId: cash.operationId } } });
    const legacy = { ...receipt.response, metadata: { version: 'historical' }, expense: { ...receipt.response.expense } };
    delete legacy.expense.debitAccountId;
    delete legacy.expense.cashContributionAmount;
    await db.expenseOperation.update({ where: { userId_operationId: { userId: user.id, operationId: cash.operationId } }, data: { response: legacy } });
    assert.deepEqual(JSON.parse(JSON.stringify(await call('expenses', 'POST', cash))), legacy, 'El recibo histórico conserva campos omitidos y metadatos');
    await call('expenses', 'POST', { ...common, paymentMethod: 'CARD', cardId: card.id, cashContributionAmount: '2.25' });
    await call('expenses', 'POST', { ...common, paymentMethod: 'DEBIT', debitAccountId: account.id });
    const { subscription } = await call('subscriptions', 'POST', { name: 'Cobro mensual', amount: '25.10', paymentMethod: 'CASH', categoryId: category.id, chargeDay: 1, startMonth: 1, startYear: 2020 });
    await call('subscription-charges', 'POST', { subscriptionId: subscription.id, action: 'confirm', month, today });
    await call('installment-purchases', 'POST', { concept: 'Compra', cardId: card.id, categoryId: category.id, purchaseDate: today, totalAmount: '120.60', months: 6 });
    for (const resource of Object.keys(financialReadSchemas)) {
      await call(resource, 'GET', undefined, resource === 'subscription-charges' ? `month=${month}&today=${today}` : resource === 'notice-dismissals' ? `month=${month}` : '');
    }
    // Reader validation must catch a truncated response before it reaches JSX.
    assert.throws(() => validateFinancialResponse('/api/expenses', 'GET', { expenses: [], total: 0 }));
  } finally {
    await db.user.delete({ where: { id: user.id } });
    await db.$disconnect();
  }
});
