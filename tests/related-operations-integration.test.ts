import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { record } from './helpers/dynamic-values';
import { plain, present, financialLoader as sourceLoader, stringValue, testHandler, testReply } from './helpers/financial-fixtures';
import { faultingTransactions } from './helpers/financial-persistence';
const connectionString = process.env.AFP_TEST_DATABASE_URL;

test('PostgreSQL A06: rollback de cada paso relacionado, reintentos y traslado de ingresos', { skip: !connectionString }, async () => {
  assert.ok(connectionString);
  const url = new URL(connectionString);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname.startsWith('/afp_test'), 'Solo permite una base local de prueba.');
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const user = await db.user.create({ data: { email: `a06-${randomUUID()}@example.test` } });
  let failAt: number | null | undefined, writes: string[] = [], reachedFailure = false;
  // Ejecuta la escritura real ANTES de lanzar el error: el rollback pertenece
  // a PostgreSQL, no al adaptador. Nunca intercepta lecturas ni simula saldos.
  const adapter = faultingTransactions(db, { after(model, method) {
    writes.push(`${model}.${method}`);
    if (writes.length === failAt) { reachedFailure = true; throw new Error(`Fallo inyectado después de ${model}.${method}`); }
  } });
  const load = sourceLoader({
    '@/lib/prisma': { prisma: adapter },
    'next/server': { NextResponse: { json: testReply } },
    '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async () => ({ data: { user } }) } }) },
  }, { console: { error() {} } });
  const call = (route: string, method: import('./helpers/financial-fixtures').TestMethod, body: Record<string, unknown>) => testHandler(record(load(`src/app/api/${route}/route`))[method])({
    headers: new Headers({ authorization: 'Bearer test' }), url: `http://localhost/api/${route}?id=${body.id || ''}`, json: async () => body,
  });
  const tables = { installmentPurchase: () => db.installmentPurchase.findMany({ where: { userId: user.id } }), receivableAccount: () => db.receivableAccount.findMany({ where: { userId: user.id } }), payableAccount: () => db.payableAccount.findMany({ where: { userId: user.id } }), dailyExpense: () => db.dailyExpense.findMany({ where: { userId: user.id } }), income: () => db.income.findMany({ where: { userId: user.id } }), expenseOperation: () => db.expenseOperation.findMany({ where: { userId: user.id } }), subscriptionCharge: () => db.subscriptionCharge.findMany({ where: { userId: user.id } }) };
  const snapshot = async () => {
    const result: Record<string, unknown> = {};
    for (const [table, read] of Object.entries(tables)) {
      const rows = plain(await read());
      result[table] = rows.sort((a, b) => String(record(a).id || record(a).operationId).localeCompare(String(record(b).id || record(b).operationId)));
    }
    return result;
  };
  const verify = async (route: string, method: import('./helpers/financial-fixtures').TestMethod, body: Record<string, unknown>, expectedWrites: string[]) => {
    const before = await snapshot();
    for (let step = 1; step <= expectedWrites.length; step++) {
      writes = []; failAt = step; reachedFailure = false;
      const response = await call(route, method, body);
      assert.equal(response.status, 500, `${route} ${method} paso ${step}`);
      assert.ok(reachedFailure, 'La prueba debe alcanzar el fallo previsto');
      assert.deepEqual(writes, expectedWrites.slice(0, step));
      assert.deepEqual(await snapshot(), before, `Rollback completo: ${route} ${method} paso ${step}`);
    }
    writes = []; failAt = null;
    const response = await call(route, method, body);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.deepEqual(writes, expectedWrites);
    return response.body;
  };
  try {
    const category = await db.category.create({ data: { userId: user.id, name: 'Prueba' } });
    const person = await db.person.create({ data: { userId: user.id, name: 'Prueba' } });
    const card = await db.card.create({ data: { userId: user.id, name: 'Prueba', usualCutDay: 20, usualDueDay: 10 } });
    const incomeType = await db.incomeType.create({ data: { userId: user.id, name: 'Prueba' } });
    const accountData = { userId: user.id, personId: person.id, concept: 'Deuda', originalAmount: 100, originDate: new Date('2026-10-17'), originType: 'MANUAL' as const };
    const payable = await db.payableAccount.create({ data: accountData });
    const origin = await db.receivableAccount.create({ data: accountData });
    const destination = await db.receivableAccount.create({ data: accountData });
    const subscription = await db.subscription.create({ data: { userId: user.id, name: 'Prueba', amount: 100, paymentMethod: 'CASH' as const, categoryId: category.id, chargeDay: 1, startMonth: 1, startYear: 2020 } });

    const purchaseInput = { cardId: card.id, categoryId: category.id, personId: person.id,
      purchaseDate: '2026-10-17', concept: 'Compra', totalAmount: 120, months: 12 };
    const { purchase } = await verify('installment-purchases', 'POST', purchaseInput,
      ['receivableAccount.create', 'installmentPurchase.create', 'receivableAccount.update']);
    assert.equal(present((await db.receivableAccount.findUnique({ where: { id: stringValue(record(purchase).receivableAccountId) } }))).originId, record(purchase).id);
    await verify('installment-purchases', 'POST', { ...purchaseInput, personId: null }, ['installmentPurchase.create']);
    await verify('installment-purchases', 'PATCH', { ...purchaseInput, id: record(purchase).id, totalAmount: 240 }, ['installmentPurchase.update']);

    const expenseInput = { operationId: randomUUID(), concept: 'Gasto', amount: 100, date: '2026-10-17',
      paymentMethod: 'CASH' as const, categoryId: category.id, personId: person.id, createReceivable: true, payableAccountId: payable.id };
    const expenseWrites = ['expenseOperation.createMany', 'receivableAccount.create', 'dailyExpense.create', 'payableAccount.update', 'expenseOperation.update'];
    const createdExpense = await verify('expenses', 'POST', expenseInput, expenseWrites);
    const committed = await snapshot();
    const retries = await Promise.all(Array.from({ length: 5 }, () => call('expenses', 'POST', expenseInput)));
    assert.ok(retries.every(response => response.status === 200));
    for (const response of retries) assert.deepEqual(response.body, createdExpense);
    assert.deepEqual(await snapshot(), committed);
    assert.equal((await call('expenses', 'POST', { ...expenseInput, amount: 50 })).status, 409);
    await verify('expenses', 'PATCH', { ...expenseInput, id: record(createdExpense.expense).id, amount: 50 }, ['dailyExpense.update', 'payableAccount.update']);

    // La confirmación de suscripción también comparte la transacción exterior.
    const charge = { ...expenseInput, operationId: randomUUID(), subscriptionId: subscription.id, payableAccountId: null, date: '2020-01-01' };
    const confirmed = await verify('expenses', 'POST', charge,
      ['expenseOperation.createMany', 'receivableAccount.create', 'dailyExpense.create', 'subscriptionCharge.upsert', 'expenseOperation.update']);
    assert.ok(record(confirmed.expense).id);

    const incomeInput = { date: '2026-10-17', concept: 'Abono', amount: 100, source: 'Prueba', incomeTypeId: incomeType.id, receivableAccountId: origin.id };
    const { income } = await verify('incomes', 'POST', incomeInput, ['income.create', 'receivableAccount.update']);
    // El fallo después del SEGUNDO saldo debe deshacer también el primero.
    await verify('incomes', 'PATCH', { ...incomeInput, id: record(income).id, receivableAccountId: destination.id },
      ['income.update', 'receivableAccount.update', 'receivableAccount.update']);
    assert.equal(present((await db.receivableAccount.findUnique({ where: { id: origin.id } }))).status, 'ACTIVE');
    assert.equal(present((await db.receivableAccount.findUnique({ where: { id: destination.id } }))).status, 'PAID_OFF');
    await verify('incomes', 'DELETE', { id: record(income).id }, ['income.delete', 'receivableAccount.update']);
  } finally {
    await db.user.delete({ where: { id: user.id } });
    await db.$disconnect();
  }
});
