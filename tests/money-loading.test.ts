import type { Prisma } from '@prisma/client';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { array, call, record } from './helpers/dynamic-values';
import { present, financialLoader as sourceLoader, stringValue } from './helpers/financial-fixtures';
type ReadQuery = { where: Pick<Prisma.MoneyAccountWhereInput, 'userId'>; include?: Record<string, unknown> };

test('Mi dinero: las lecturas esperan la conexión única y conservan propietario y relaciones', async () => {
  const names = ['moneyAccount', 'moneyRoute', 'moneyPlan', 'moneyTransfer', 'moneyWithdrawal', 'card', 'cardCycle', 'income', 'dailyExpense', 'subscription', 'installmentPurchase', 'receivableAccount', 'payableAccount', 'incomeType', 'category'];
  let active = 0, peak = 0;
  const calls: { name: string; options: ReadQuery }[] = [];
  const db = Object.fromEntries(names.map(name => [name, { findMany: async (options: ReadQuery) => {
    active++; peak = Math.max(peak, active); calls.push({ name, options });
    await Promise.resolve(); active--;
    return [{ model: name }];
  } }]));
  const load = sourceLoader({ '@/lib/apiAuth': { ApiAccessError: class extends Error {} } });
  const data = record(await call(load('src/lib/money/service.ts').loadMoneyData, db, 'owner'));
  assert.equal(peak, 1); assert.equal(calls.length, 15);
  assert.ok(calls.every(call => call.options.where.userId === 'owner'));
  assert.equal(record(array(data.expenses)[0]).model, 'dailyExpense');
  assert.equal(record(array(data.cycles)[0]).model, 'cardCycle');
  assert.equal(present(present(calls.find(call => call.name === 'cardCycle')).options.include).payments, true);
  assert.equal(present(present(calls.find(call => call.name === 'moneyPlan')).options.include).occurrences, true);
});

function routeFixture(code?: string) {
  let active = false, reads = 0, builds = 0;
  const data = { categories: [], accounts: [], cards: [], cycles: [], plans: [], routes: [], incomeTypes: [] };
  const load = sourceLoader({
    '@/lib/apiAuth': {
      requireApiUser: async () => ({ id: 'owner' }), apiAccessErrorResponse: () => null,
      apiResponse: { json: (body: unknown, options: ResponseInit = {}) => { assert.equal(active, false, 'la respuesta ocurre después del commit'); return { body, status: options.status || 200 }; } },
    },
    '@/lib/prisma': { prisma: { $transaction: async <T>(operation: (tx: { marker: string }) => Promise<T>, options: { isolationLevel: string; timeout: number }) => {
      assert.equal(options.isolationLevel, 'RepeatableRead'); assert.equal(options.timeout, 20000);
      if (code) throw Object.assign(new Error('timeout'), { code });
      active = true;
      try { return await operation({ marker: 'transaction' }); } finally { active = false; }
    } } },
    '@/lib/money/service': {
      loadMoneyData: async (tx: { marker: string }, owner: string) => { assert.equal(active, true); assert.equal(tx.marker, 'transaction'); assert.equal(owner, 'owner'); reads++; return data; },
      routingOptions: () => [], mutateMoney: () => assert.fail('mutación en GET'),
    },
    '@/lib/money/forecast': { buildForecast: (input: unknown) => { assert.equal(active, false, 'el cálculo no retiene la conexión'); assert.equal(input, data); builds++; return { daily: [], monthly: [] }; } },
  }, { console: { error: () => {} } });
  return { route: load('src/app/api/money/route.ts'), counts: () => ({ reads, builds }) };
}

test('Mi dinero: libera la transacción antes de calcular y serializar ambos escenarios', async () => {
  const fixture = routeFixture();
  const response = await fixture.route.GET({ url: 'http://localhost/api/money?variablePercent=80' });
  assert.equal(response.status, 200);
  assert.ok(response.body.forecast); assert.ok(response.body.simulated);
  assert.deepEqual(fixture.counts(), { reads: 1, builds: 2 });
});

test('Mi dinero: saturación de conexión o transacción vencida devuelve un fallo recuperable', async () => {
  for (const code of ['P2028', 'P2024']) {
    const response = await routeFixture(code).route.GET({ url: 'http://localhost/api/money' });
    assert.equal(response.status, 503);
    assert.ok(!stringValue(response.body.error).includes(code));
  }
});
