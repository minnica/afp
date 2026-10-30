import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { array, record } from './helpers/dynamic-values';
import { present, financialLoader as sourceLoader, testHandler, testReply } from './helpers/financial-fixtures';
const connectionString = process.env.AFP_TEST_DATABASE_URL;

test('PostgreSQL: contratos JSON de todos los flujos financieros, variantes y pago parcial', { skip: !connectionString }, async () => {
  assert.ok(connectionString);
  const url = new URL(connectionString);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && /^\/afp_test\w*$/.test(url.pathname) && !url.search && !url.hash);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const user = await db.user.create({ data: { email: `ts4-${randomUUID()}@example.test` } });
  const load = sourceLoader({
    '@/lib/prisma': { prisma: db },
    '@/lib/calendar/schedule': { scheduleCalendarSync() {} },
    'next/server': { NextResponse: { json: testReply } },
    '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async () => ({ data: { user } }) } }) },
  });
  const { validateFinancialResponse, financialReadSchemas } = load('src/lib/financialResponses.ts');
  const { uiResponseSchemas } = load('src/lib/uiResponseSchemas.ts');
  async function call(resource: string, method: import('./helpers/financial-fixtures').TestMethod = 'GET', body?: unknown, params = '') {
    const response = await testHandler(record(load(`src/app/api/${resource}/route`))[method])({
      method, headers: new Headers({ authorization: 'Bearer fictitious' }),
      url: `http://localhost/api/${resource}?${params}`, json: async () => body,
    });
    assert.equal(response.status, 200, `${method} ${resource}: ${JSON.stringify(response.body)}`);
    validateFinancialResponse(`/api/${resource}`, method, response.body);
    if (method === 'GET' && resource in uiResponseSchemas) {
      const parsed = uiResponseSchemas[resource as keyof typeof uiResponseSchemas].parse(response.body);
      assert.deepEqual(JSON.parse(JSON.stringify(parsed)), response.body, `El contrato UI conserva ${resource}`);
    }
    return response.body;
  }
  try {
    const today = new Date().toISOString().slice(0, 10), month = today.slice(0, 7);
    const category = await db.category.create({ data: { userId: user.id, name: 'Categoría ficticia' } });
    const person = await db.person.create({ data: { userId: user.id, name: 'Persona ficticia' } });
    const incomeType = await db.incomeType.create({ data: { userId: user.id, name: 'Ingreso ficticio' } });
    const account = await db.moneyAccount.create({ data: { userId: user.id, name: 'Débito ficticio', kind: 'BANK' as const, openingBalance: 1000, baseline: {}, asOf: new Date('2020-01-01') } });
    const { card } = await call('cards', 'POST', { name: 'Tarjeta ficticia', usualCutDay: 10, usualDueDay: 25 });
    const generated = await call('card-cycles', 'POST', {});
    const cycle = array(generated.cycles)[0];
    await call('card-cycles', 'GET', undefined, `cycleId=${record(cycle).id}`);
    const zero = await call('card-cycles', 'PATCH', { id: record(cycle).id, action: 'UPDATE_STATEMENT', statementAmount: '0' });
    assert.equal(record(zero.cycle).pendingAmount, 0);
    assert.equal(record(zero.cycle).paymentStatus, 'NO_PAYMENT_DUE');
    await call('card-cycles', 'PATCH', { id: record(cycle).id, action: 'UPDATE_STATEMENT', statementAmount: '100.25' });
    const partial = await call('card-cycles', 'PATCH', { id: record(cycle).id, action: 'MARK_AS_PAID', paidAmount: '30.10', paidAt: today });
    assert.equal(record(partial.cycle).pendingAmount, 70.15);
    assert.equal(record(partial.cycle).paymentStatus, 'PARTIALLY_PAID');
    const { receivable } = await call('receivables', 'POST', { personId: person.id, concept: 'Cobro', originalAmount: '150.50', originDate: today, expectedChargeDays: '1, 15' });
    const { payable } = await call('payables', 'POST', { personId: person.id, concept: 'Deuda', originalAmount: '200.50', originDate: today, expectedDate: today });
    await call('incomes', 'POST', { date: today, incomeTypeId: incomeType.id, source: 'Persona', concept: 'Abono', amount: '20.25', receivableAccountId: record(receivable).id });
    const common = { date: today, categoryId: category.id, concept: 'Gasto', amount: '10.25' };
    const cash = { ...common, paymentMethod: 'CASH' as const, operationId: randomUUID(), payableAccountId: record(payable).id };
    const saved = await call('expenses', 'POST', cash);
    assert.equal(record((await call('expenses', 'POST', cash)).expense).id, record(saved.expense).id);
    const receipt = await db.expenseOperation.findUnique({ where: { userId_operationId: { userId: user.id, operationId: cash.operationId } } });
    const response = present(receipt).response;
    assert.ok(response && typeof response === 'object' && !Array.isArray(response));
    const priorExpense = response.expense;
    assert.ok(priorExpense && typeof priorExpense === 'object' && !Array.isArray(priorExpense));
    const legacy = { ...response, metadata: { version: 'historical' }, expense: { ...priorExpense } };
    delete legacy.expense.debitAccountId;
    delete legacy.expense.cashContributionAmount;
    await db.expenseOperation.update({ where: { userId_operationId: { userId: user.id, operationId: cash.operationId } }, data: { response: legacy } });
    assert.deepEqual(JSON.parse(JSON.stringify(await call('expenses', 'POST', cash))), legacy, 'El recibo histórico conserva campos omitidos y metadatos');
    await call('expenses', 'POST', { ...common, paymentMethod: 'CARD' as const, cardId: record(card).id, cashContributionAmount: '2.25' });
    await call('expenses', 'POST', { ...common, paymentMethod: 'DEBIT' as const, debitAccountId: account.id });
    const { subscription } = await call('subscriptions', 'POST', { name: 'Cobro mensual', amount: '25.10', paymentMethod: 'CASH' as const, categoryId: category.id, chargeDay: 1, startMonth: 1, startYear: 2020 });
    await call('subscription-charges', 'POST', { subscriptionId: record(subscription).id, action: 'confirm', month, today });
    const { purchase } = await call('installment-purchases', 'POST', { concept: 'Compra', cardId: record(card).id, categoryId: category.id, purchaseDate: today, totalAmount: '120.60', months: 6 });
    for (const resource of Object.keys(financialReadSchemas)) {
      await call(resource, 'GET', undefined, resource === 'subscription-charges' ? `month=${month}&today=${today}` : resource === 'notice-dismissals' ? `month=${month}` : resource === 'installment-purchases/payments' ? `purchaseId=${record(purchase).id}` : '');
    }
    // Reader validation must catch a truncated response before it reaches JSX.
    assert.throws(() => validateFinancialResponse('/api/expenses', 'GET', { expenses: [], total: 0 }));
  } finally {
    await db.user.delete({ where: { id: user.id } });
    await db.$disconnect();
  }
});
