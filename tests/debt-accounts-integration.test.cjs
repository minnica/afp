const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { sourceLoader } = require('./helpers/load-source.cjs');
const connectionString = process.env.AFP_TEST_DATABASE_URL;

for (const [kind, route, accounts, key, model] of [
  ['payable', 'expenses', 'payables', 'expense', 'dailyExpense'],
  ['receivable', 'incomes', 'receivables', 'income', 'income'],
]) {
  test(`PostgreSQL A05 ${kind}: abonos simultáneos, principal, cancelación y rollback`, { skip: !connectionString }, async () => {
    const url = new URL(connectionString);
    assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname.startsWith('/afp_test'), 'Solo permite una base local de prueba.');
    const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    const user = await db.user.create({ data: { email: `debt-${randomUUID()}@example.test` } });
    let failStatus = false;
    try {
      const person = await db.person.create({ data: { userId: user.id, name: 'Persona de prueba' } });
      const category = await db.category.create({ data: { userId: user.id, name: 'Prueba' } });
      const incomeType = await db.incomeType.create({ data: { userId: user.id, name: 'Prueba' } });
      const account = await db[`${kind}Account`].create({ data: { userId: user.id, personId: person.id, concept: 'Deuda de prueba', originType: 'MANUAL', originalAmount: 1, originDate: new Date('2026-10-17') } });
      // Solo inyecta el fallo final; todas las consultas, escrituras y rollback
      // anteriores se ejecutan realmente en PostgreSQL.
      const adapter = new Proxy(db, { get(target, property) {
        if (property === '$transaction') return (run, options) => db.$transaction(tx => run(new Proxy(tx, { get(transaction, name) {
          if (name === `${kind}Account`) return new Proxy(transaction[name], { get(delegate, method) {
            if (method === 'update') return args => {
              if (failStatus && args.data.status) throw new Error('Fallo del estado simulado');
              return delegate.update(args);
            };
            return delegate[method];
          } });
          return transaction[name];
        } })), options);
        return target[property];
      } });
      const load = sourceLoader({
        '@/lib/prisma': { prisma: adapter },
        'next/server': { NextResponse: { json: (body, options = {}) => ({ body: JSON.parse(JSON.stringify(body)), status: options.status || 200 }) } },
        '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async () => ({ data: { user } }) } }) },
      }, { console: { error() {} } });
      const call = (name, method, body = {}) => load(`src/app/api/${name}/route.js`)[method]({
        headers: new Headers({ authorization: 'Bearer test' }), url: `http://localhost/api/${name}?id=${body.id || ''}`, json: async () => body,
      });
      const ok = async (name, method, body) => {
        const response = await call(name, method, body);
        assert.equal(response.status, 200, JSON.stringify(response.body));
        return response.body;
      };
      const input = { date: '2026-10-17', concept: 'Abono', amount: 0.1,
        ...(kind === 'payable' ? { paymentMethod: 'CASH', categoryId: category.id, payableAccountId: account.id }
          : { incomeTypeId: incomeType.id, source: 'Prueba', receivableAccountId: account.id }) };
      const principal = { ...account, originDate: '2026-10-17' };
      const read = () => db[`${kind}Account`].findUnique({ where: { id: account.id } });
      // Las lecturas corrigen la clasificación histórica sin modificar la BD.
      await db[`${kind}Account`].update({ where: { id: account.id }, data: { status: 'PAID_OFF' } });
      assert.equal((await ok(accounts, 'GET'))[accounts][0].status, 'ACTIVE');
      assert.equal((await ok('gastos/bootstrap', 'GET'))[accounts][0].status, 'ACTIVE');
      if (kind === 'receivable') assert.equal((await ok('dashboard', 'GET')).activeReceivables[0].pendingBalance, 1);
      assert.equal((await read()).status, 'PAID_OFF');
      await db[`${kind}Account`].update({ where: { id: account.id }, data: { status: 'ACTIVE' } });
      const payments = await Promise.all(Array.from({ length: 10 }, () => ok(route, 'POST', input)));
      assert.equal((await read()).status, 'PAID_OFF');
      assert.equal((await ok(accounts, 'GET'))[accounts][0].pendingBalance, 0);
      await Promise.all(payments.map(row => ok(route, 'PATCH', { ...input, id: row[key].id, amount: 0.09 })));
      assert.equal((await read()).status, 'ACTIVE');
      assert.equal((await ok(accounts, 'GET'))[accounts][0].pendingBalance, 0.1);
      await Promise.all([
        ok(accounts, 'PATCH', { ...principal, originalAmount: 0.9 }),
        ok(route, 'PATCH', { ...input, id: payments[0][key].id, amount: 0.08 }),
      ]);
      assert.equal((await read()).status, 'ACTIVE');
      assert.equal((await ok(accounts, 'GET'))[accounts][0].pendingBalance, 0.01);
      const excess = (await ok(accounts, 'PATCH', { ...principal, originalAmount: 0.8 }))[kind];
      assert.equal(excess.status, 'PAID_OFF');
      assert.equal(excess.excessAmount, 0.09);
      // La cancelación se prepara como dato existente; no se añade una nueva acción de UI.
      await db[`${kind}Account`].update({ where: { id: account.id }, data: { status: 'CANCELLED' } });
      await Promise.all(payments.map(row => ok(route, 'DELETE', { id: row[key].id })));
      assert.equal((await read()).status, 'CANCELLED');
      assert.equal(await db[model].count({ where: { userId: user.id } }), 0);
      await db[`${kind}Account`].update({ where: { id: account.id }, data: { status: 'ACTIVE', originalAmount: 100 } });
      failStatus = true;
      assert.equal((await call(route, 'POST', { ...input, amount: 100 })).status, 500);
      assert.equal(await db[model].count({ where: { userId: user.id } }), 0);
      assert.equal((await read()).status, 'ACTIVE');
      failStatus = false;
      const paid = (await ok(route, 'POST', { ...input, amount: 100 }))[key];
      failStatus = true;
      for (const [name, method, body] of [
        [route, 'PATCH', { ...input, id: paid.id, amount: 50 }],
        [route, 'DELETE', { id: paid.id }],
        [accounts, 'PATCH', { ...principal, originalAmount: 200 }],
      ]) {
        assert.equal((await call(name, method, body)).status, 500);
        assert.equal((await read()).status, 'PAID_OFF');
        assert.equal(String((await read()).originalAmount), '100');
        assert.equal(String((await db[model].findUnique({ where: { id: paid.id } })).amount), '100');
      }
    } finally {
      await db.user.delete({ where: { id: user.id } });
      await db.$disconnect();
    }
  });
}
