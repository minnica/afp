const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { sourceLoader } = require('./helpers/load-source.cjs');
const connectionString = process.env.AFP_TEST_DATABASE_URL;
const plain = value => JSON.parse(JSON.stringify(value));

test('PostgreSQL A06: rollback de cada paso relacionado, reintentos y traslado de ingresos', { skip: !connectionString }, async () => {
  const url = new URL(connectionString);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname.startsWith('/afp_test'), 'Solo permite una base local de prueba.');
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const user = await db.user.create({ data: { email: `a06-${randomUUID()}@example.test` } });
  let failAt, writes = [], reachedFailure = false;
  // Ejecuta la escritura real ANTES de lanzar el error: el rollback pertenece
  // a PostgreSQL, no al adaptador. Nunca intercepta lecturas ni simula saldos.
  const adapter = new Proxy(db, { get(target, property) {
    if (property !== '$transaction') return target[property];
    return (run, options) => db.$transaction(tx => run(new Proxy(tx, { get(transaction, model) {
      const delegate = transaction[model];
      if (!delegate || typeof delegate !== 'object') return delegate;
      return new Proxy(delegate, { get(target, method) {
        if (!['create', 'createMany', 'update', 'delete', 'upsert'].includes(method)) return target[method];
        return async args => {
          const result = await target[method](args);
          writes.push(`${model}.${method}`);
          if (writes.length === failAt) {
            reachedFailure = true;
            throw new Error(`Fallo inyectado después de ${model}.${method}`);
          }
          return result;
        };
      } });
    } })), options);
  } });
  const load = sourceLoader({
    '@/lib/prisma': { prisma: adapter },
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body: plain(body), status: options.status || 200 }) } },
    '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async () => ({ data: { user } }) } }) },
  }, { console: { error() {} } });
  const call = (route, method, body) => load(`src/app/api/${route}/route`)[method]({
    headers: new Headers({ authorization: 'Bearer test' }), url: `http://localhost/api/${route}?id=${body.id || ''}`, json: async () => body,
  });
  const tables = ['installmentPurchase', 'receivableAccount', 'payableAccount', 'dailyExpense', 'income', 'expenseOperation', 'subscriptionCharge'];
  const snapshot = async () => {
    const result = {};
    for (const table of tables) {
      const rows = plain(await db[table].findMany({ where: { userId: user.id } }));
      result[table] = rows.sort((a, b) => (a.id || a.operationId).localeCompare(b.id || b.operationId));
    }
    return result;
  };
  const verify = async (route, method, body, expectedWrites) => {
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
    const accountData = { userId: user.id, personId: person.id, concept: 'Deuda', originalAmount: 100, originDate: new Date('2026-10-17'), originType: 'MANUAL' };
    const payable = await db.payableAccount.create({ data: accountData });
    const origin = await db.receivableAccount.create({ data: accountData });
    const destination = await db.receivableAccount.create({ data: accountData });
    const subscription = await db.subscription.create({ data: { userId: user.id, name: 'Prueba', amount: 100, paymentMethod: 'CASH', categoryId: category.id, chargeDay: 1, startMonth: 1, startYear: 2020 } });

    const purchaseInput = { cardId: card.id, categoryId: category.id, personId: person.id,
      purchaseDate: '2026-10-17', concept: 'Compra', totalAmount: 120, months: 12 };
    const { purchase } = await verify('installment-purchases', 'POST', purchaseInput,
      ['receivableAccount.create', 'installmentPurchase.create', 'receivableAccount.update']);
    assert.equal((await db.receivableAccount.findUnique({ where: { id: purchase.receivableAccountId } })).originId, purchase.id);
    await verify('installment-purchases', 'POST', { ...purchaseInput, personId: null }, ['installmentPurchase.create']);
    await verify('installment-purchases', 'PATCH', { ...purchaseInput, id: purchase.id, totalAmount: 240 }, ['installmentPurchase.update']);

    const expenseInput = { operationId: randomUUID(), concept: 'Gasto', amount: 100, date: '2026-10-17',
      paymentMethod: 'CASH', categoryId: category.id, personId: person.id, createReceivable: true, payableAccountId: payable.id };
    const expenseWrites = ['expenseOperation.createMany', 'receivableAccount.create', 'dailyExpense.create', 'payableAccount.update', 'expenseOperation.update'];
    const createdExpense = await verify('expenses', 'POST', expenseInput, expenseWrites);
    const committed = await snapshot();
    const retries = await Promise.all(Array.from({ length: 5 }, () => call('expenses', 'POST', expenseInput)));
    assert.ok(retries.every(response => response.status === 200));
    for (const response of retries) assert.deepEqual(response.body, createdExpense);
    assert.deepEqual(await snapshot(), committed);
    assert.equal((await call('expenses', 'POST', { ...expenseInput, amount: 50 })).status, 409);
    await verify('expenses', 'PATCH', { ...expenseInput, id: createdExpense.expense.id, amount: 50 }, ['dailyExpense.update', 'payableAccount.update']);

    // La confirmación de suscripción también comparte la transacción exterior.
    const charge = { ...expenseInput, operationId: randomUUID(), subscriptionId: subscription.id, payableAccountId: null, date: '2020-01-01' };
    const confirmed = await verify('expenses', 'POST', charge,
      ['expenseOperation.createMany', 'receivableAccount.create', 'dailyExpense.create', 'subscriptionCharge.upsert', 'expenseOperation.update']);
    assert.ok(confirmed.expense.id);

    const incomeInput = { date: '2026-10-17', concept: 'Abono', amount: 100, source: 'Prueba', incomeTypeId: incomeType.id, receivableAccountId: origin.id };
    const { income } = await verify('incomes', 'POST', incomeInput, ['income.create', 'receivableAccount.update']);
    // El fallo después del SEGUNDO saldo debe deshacer también el primero.
    await verify('incomes', 'PATCH', { ...incomeInput, id: income.id, receivableAccountId: destination.id },
      ['income.update', 'receivableAccount.update', 'receivableAccount.update']);
    assert.equal((await db.receivableAccount.findUnique({ where: { id: origin.id } })).status, 'ACTIVE');
    assert.equal((await db.receivableAccount.findUnique({ where: { id: destination.id } })).status, 'PAID_OFF');
    await verify('incomes', 'DELETE', { id: income.id }, ['income.delete', 'receivableAccount.update']);
  } finally {
    await db.user.delete({ where: { id: user.id } });
    await db.$disconnect();
  }
});
