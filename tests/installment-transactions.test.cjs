const assert = require('node:assert/strict');
const { test } = require('node:test');
const { sourceLoader } = require('./helpers/load-source.cjs');

function fixture() {
  let state = { purchases: [], accounts: [] }, failAt, sequence = 0;
  const references = [];
  const db = { $transaction: async (run, options) => {
    assert.equal(options.isolationLevel, 'ReadCommitted');
    const draft = structuredClone(state);
    let locked = false, writes = 0;
    const written = row => {
      assert.ok(locked);
      if (++writes === failAt) throw new Error('Fallo después de escribir');
      return structuredClone(row);
    };
    const tx = {
      $queryRaw: async () => { locked = true; return [{ locked: 1 }]; },
      receivableAccount: {
        create: async ({ data }) => {
          const row = { ...data, id: `account-${++sequence}` };
          draft.accounts.push(row);
          return written(row);
        },
        update: async ({ where, data }) => {
          const row = draft.accounts.find(row => row.id === where.id && row.userId === where.userId);
          assert.ok(row);
          Object.assign(row, data);
          return written(row);
        },
      },
      installmentPurchase: {
        findFirst: async ({ where }) => draft.purchases.find(row => row.id === where.id && row.userId === where.userId) || null,
        create: async ({ data }) => {
          const row = { ...data, id: `purchase-${++sequence}` };
          draft.purchases.push(row);
          return written(row);
        },
        update: async ({ where, data }) => {
          const row = draft.purchases.find(row => row.id === where.id && row.userId === where.userId);
          if (!row) throw Object.assign(new Error('Missing'), { code: 'P2025' });
          Object.assign(row, data);
          return written(row);
        },
      },
    };
    for (const model of ['card', 'category', 'person']) {
      tx[model] = { findFirst: async ({ where }) => {
        assert.ok(locked);
        assert.equal(writes, 0, 'Validar relaciones antes de escribir');
        references.push(model);
        return where.id === `${model}-${where.userId}` ? { id: where.id } : null;
      } };
    }
    const result = await run(tx);
    state = draft;
    return result;
  } };
  const route = sourceLoader({
    '@/lib/prisma': { prisma: db },
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body: JSON.parse(JSON.stringify(body)), status: options.status || 200 }) } },
    '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'a' } } }) } }) },
  }, { console: { error() {} } })('src/app/api/installment-purchases/route.ts');
  return {
    call: (method, body) => route[method]({ headers: new Headers({ authorization: 'Bearer a' }), json: async () => body }),
    state: () => structuredClone(state), fail: step => { failAt = step; }, references,
  };
}
const input = { cardId: 'card-a', categoryId: 'category-a', personId: 'person-a', purchaseDate: '2026-10-17',
  concept: 'Compra', totalAmount: 120, months: 12, initialPaymentsMade: 2, manualMonthlyPayment: 11 };

test('MSI: fallo después de cada escritura revierte cuenta, compra y origen; reintentar crea solo un par', async () => {
  for (const step of [1, 2, 3]) {
    const f = fixture();
    f.fail(step);
    assert.equal((await f.call('POST', input)).status, 500);
    assert.deepEqual(f.state(), { purchases: [], accounts: [] });
    f.fail(null);
    const response = await f.call('POST', input);
    assert.equal(response.status, 200);
    const { purchases, accounts } = f.state();
    assert.equal(purchases.length, 1);
    assert.equal(accounts.length, 1);
    assert.equal(accounts[0].originId, purchases[0].id);
    assert.equal(purchases[0].receivableAccountId, accounts[0].id);
    assert.equal(accounts[0].expectedMonthlyPayment, 11);
    assert.equal(accounts[0].originalAmount, 120);
  }
});

test('MSI: valida propietarios antes de escribir, ignora userId del cuerpo y admite compra propia sin cuenta', async () => {
  const f = fixture();
  for (const field of ['cardId', 'categoryId', 'personId']) {
    assert.equal((await f.call('POST', { ...input, [field]: 'other-user' })).status, 404);
    assert.deepEqual(f.state(), { purchases: [], accounts: [] });
  }
  assert.equal((await f.call('POST', null)).status, 400);
  assert.equal((await f.call('POST', { ...input, months: -1 })).status, 400);
  const response = await f.call('POST', { ...input, userId: 'forged', personId: null, manualMonthlyPayment: null });
  assert.equal(response.status, 200);
  assert.equal(response.body.purchase.userId, 'a');
  assert.equal(response.body.purchase.monthlyPaymentUsed, 10);
  assert.equal(response.body.purchase.receivableAccountId, null);
  assert.equal(f.state().accounts.length, 0);
});

test('MSI: editar valida en transacción y revierte el cambio ante un fallo', async () => {
  const f = fixture();
  const created = await f.call('POST', input);
  const body = { ...input, id: created.body.purchase.id, totalAmount: 240 };
  const before = f.state();
  f.fail(1);
  assert.equal((await f.call('PATCH', body)).status, 500);
  assert.deepEqual(f.state(), before);
  f.fail(null);
  assert.equal((await f.call('PATCH', { ...body, categoryId: 'foreign' })).status, 404);
  assert.deepEqual(f.state(), before);
  assert.equal((await f.call('PATCH', body)).status, 200);
  assert.equal(f.state().purchases[0].totalAmount, 240);
  // Editar la compra conserva el principal independiente de la cuenta existente.
  assert.deepEqual(f.state().accounts, before.accounts);
});
