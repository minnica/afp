import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { array, record } from './helpers/dynamic-values';
import { present, financialLoader as sourceLoader, stringValue, testHandler, testReply } from './helpers/financial-fixtures';
import { debtAccounts, faultingTransactions } from './helpers/financial-persistence';
const connectionString = process.env.AFP_TEST_DATABASE_URL;

for (const [kind, route, accounts, key] of [
  ['payable', 'expenses', 'payables', 'expense', 'dailyExpense'],
  ['receivable', 'incomes', 'receivables', 'income', 'income'],
] as const) {
  test(`PostgreSQL A05 ${kind}: abonos simultáneos, principal, cancelación y rollback`, { skip: !connectionString }, async () => {
    assert.ok(connectionString);
  const url = new URL(connectionString);
    assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname.startsWith('/afp_test'), 'Solo permite una base local de prueba.');
    const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    const user = await db.user.create({ data: { email: `debt-${randomUUID()}@example.test` } });
    let failStatus = false;
    try {
      const person = await db.person.create({ data: { userId: user.id, name: 'Persona de prueba' } });
      const category = await db.category.create({ data: { userId: user.id, name: 'Prueba' } });
      const incomeType = await db.incomeType.create({ data: { userId: user.id, name: 'Prueba' } });
      const accountDb = debtAccounts(db, kind);
      const account = await accountDb.create({ data: { userId: user.id, personId: person.id, concept: 'Deuda de prueba', originType: 'MANUAL', originalAmount: 1, originDate: new Date('2026-10-17') } });
      // Solo inyecta el fallo final; todas las consultas, escrituras y rollback
      // anteriores se ejecutan realmente en PostgreSQL.
      const adapter = faultingTransactions(db, { before(model, method, args) {
        if (model === `${kind}Account` && method === 'update' && failStatus && record(record(args).data).status) throw new Error('Fallo del estado simulado');
      } });
      const load = sourceLoader({
        '@/lib/prisma': { prisma: adapter },
        'next/server': { NextResponse: { json: testReply } },
        '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async () => ({ data: { user } }) } }) },
      }, { console: { error() {} } });
      const call = (name: string, method: import('./helpers/financial-fixtures').TestMethod, body: Record<string, unknown> = {}) => testHandler(record(load(`src/app/api/${name}/route`))[method])({
        headers: new Headers({ authorization: 'Bearer test' }), url: `http://localhost/api/${name}?id=${body.id || ''}`, json: async () => body,
      });
      const ok = async (name: string, method: import('./helpers/financial-fixtures').TestMethod, body?: Record<string, unknown>) => {
        const response = await call(name, method, body);
        assert.equal(response.status, 200, JSON.stringify(response.body));
        return response.body;
      };
      const input = { date: '2026-10-17', concept: 'Abono', amount: 0.1,
        ...(kind === 'payable' ? { paymentMethod: 'CASH' as const, categoryId: category.id, payableAccountId: account.id }
          : { incomeTypeId: incomeType.id, source: 'Prueba', receivableAccountId: account.id }) };
      const principal = { ...account, originDate: '2026-10-17' };
      const read = () => accountDb.findUnique({ where: { id: account.id } });
      // Las lecturas corrigen la clasificación histórica sin modificar la BD.
      await accountDb.update({ where: { id: account.id }, data: { status: 'PAID_OFF' as const } });
      assert.equal(record(array((await ok(accounts, 'GET'))[accounts])[0]).status, 'ACTIVE');
      assert.equal(record(array((await ok('gastos/bootstrap', 'GET'))[accounts])[0]).status, 'ACTIVE');
      if (kind === 'receivable') assert.equal(record(array((await ok('dashboard', 'GET')).activeReceivables)[0]).pendingBalance, 1);
      assert.equal(present((await read())).status, 'PAID_OFF');
      await accountDb.update({ where: { id: account.id }, data: { status: 'ACTIVE' as const } });
      const payments = await Promise.all(Array.from({ length: 10 }, () => ok(route, 'POST', input)));
      assert.equal(present((await read())).status, 'PAID_OFF');
      assert.equal(record(array((await ok(accounts, 'GET'))[accounts])[0]).pendingBalance, 0);
      await Promise.all(payments.map(row => ok(route, 'PATCH', { ...input, id: record(row[key]).id, amount: 0.09 })));
      assert.equal(present((await read())).status, 'ACTIVE');
      assert.equal(record(array((await ok(accounts, 'GET'))[accounts])[0]).pendingBalance, 0.1);
      await Promise.all([
        ok(accounts, 'PATCH', { ...principal, originalAmount: 0.9 }),
        ok(route, 'PATCH', { ...input, id: record(present(payments[0])[key]).id, amount: 0.08 }),
      ]);
      assert.equal(present((await read())).status, 'ACTIVE');
      assert.equal(record(array((await ok(accounts, 'GET'))[accounts])[0]).pendingBalance, 0.01);
      const excess = (await ok(accounts, 'PATCH', { ...principal, originalAmount: 0.8 }))[kind];
      assert.equal(record(excess).status, 'PAID_OFF');
      assert.equal(record(excess).excessAmount, 0.09);
      // La cancelación se prepara como dato existente; no se añade una nueva acción de UI.
      await accountDb.update({ where: { id: account.id }, data: { status: 'CANCELLED' as const } });
      await Promise.all(payments.map(row => ok(route, 'DELETE', { id: record(row[key]).id })));
      assert.equal(present((await read())).status, 'CANCELLED');
      assert.equal(await (kind === 'payable' ? db.dailyExpense.count({ where: { userId: user.id } }) : db.income.count({ where: { userId: user.id } })), 0);
      await accountDb.update({ where: { id: account.id }, data: { status: 'ACTIVE' as const, originalAmount: 100 } });
      failStatus = true;
      assert.equal((await call(route, 'POST', { ...input, amount: 100 })).status, 500);
      assert.equal(await (kind === 'payable' ? db.dailyExpense.count({ where: { userId: user.id } }) : db.income.count({ where: { userId: user.id } })), 0);
      assert.equal(present((await read())).status, 'ACTIVE');
      failStatus = false;
      const paid = (await ok(route, 'POST', { ...input, amount: 100 }))[key];
      failStatus = true;
      for (const [name, method, body] of [
        [route, 'PATCH', { ...input, id: record(paid).id, amount: 50 }],
        [route, 'DELETE', { id: record(paid).id }],
        [accounts, 'PATCH', { ...principal, originalAmount: 200 }],
      ] as const) {
        assert.equal((await call(name, method, body)).status, 500);
        assert.equal(present((await read())).status, 'PAID_OFF');
        assert.equal(String(present((await read())).originalAmount), '100');
        assert.equal(String(present((await (kind === 'payable' ? db.dailyExpense.findUnique({ where: { id: stringValue(record(paid).id) } }) : db.income.findUnique({ where: { id: stringValue(record(paid).id) } })))).amount), '100');
      }
    } finally {
      await db.user.delete({ where: { id: user.id } });
      await db.$disconnect();
    }
  });
}
