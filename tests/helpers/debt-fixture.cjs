const assert = require('node:assert/strict');
const { sourceLoader } = require('./load-source.ts');

// Persistencia aislada con rollback. El bloqueo se adquiere por el SQL real
// del servicio; las pruebas PostgreSQL comprueban su semántica en el motor.
function debtFixture() {
  let state = { payableAccount: [], receivableAccount: [], dailyExpense: [], income: [], expenseTombstone: [] };
  let tail = Promise.resolve(), sequence = 0, failure = false;
  const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => row[key] === value);
  function client(getState, transactional = false) {
    const db = {};
    const hydrate = (model, row) => {
      if (!row) return null;
      const result = structuredClone(row);
      if (model === 'payableAccount') {
        result.dailyExpenses = getState().dailyExpense.filter(item => item.payableAccountId === row.id);
        result.reimbursementReceivable = hydrate('receivableAccount', getState().receivableAccount.find(item => item.id === row.reimbursementReceivableId));
      }
      if (model === 'receivableAccount') result.incomes = getState().income.filter(item => item.receivableAccountId === row.id);
      if (model === 'income') result._count = { cardCycleCredits: 0 };
      return result;
    };
    for (const model of Object.keys(state)) {
      db[model] = {
        upsert: async ({ where, create, update }) => {
          assert.ok(transactional);
          let row = getState()[model].find(row => matches(row, where));
          if (row) Object.assign(row, update);
          else { row = { ...create }; getState()[model].push(row); }
          return hydrate(model, row);
        },
        findUnique: async ({ where }) => hydrate(model, getState()[model].find(row => matches(row, where))),
        findFirst: async ({ where }) => hydrate(model, getState()[model].find(row => matches(row, where))),
        findMany: async ({ where }) => getState()[model].filter(row => matches(row, where)).map(row => hydrate(model, row)),
        create: async ({ data }) => {
          assert.ok(transactional, 'Las escrituras deben usar la transacción');
          const row = { id: `movement-${++sequence}`, ...data };
          getState()[model].push(row);
          return hydrate(model, row);
        },
        update: async ({ where, data }) => {
          assert.ok(transactional);
          const row = getState()[model].find(row => matches(row, where));
          if (!row) throw Object.assign(new Error('Missing'), { code: 'P2025' });
          if (failure && Object.hasOwn(data, 'status')) throw new Error('Fallo al guardar el estado');
          Object.assign(row, data);
          return hydrate(model, row);
        },
        delete: async ({ where }) => {
          assert.ok(transactional);
          const index = getState()[model].findIndex(row => matches(row, where));
          if (index < 0) throw Object.assign(new Error('Missing'), { code: 'P2025' });
          return getState()[model].splice(index, 1)[0];
        },
      };
    }
    for (const model of ['person', 'category', 'incomeType']) {
      db[model] = { findFirst: async ({ where }) => where.id === `${model}-${where.userId}` ? { id: where.id } : null };
    }
    db.cardCycleCredit = { aggregate: async () => ({ _sum: { amount: 0 } }) };
    db.subscriptionCharge = { findUnique: async () => null };
    return db;
  }
  const db = client(() => state);
  db.$transaction = async (run, options) => {
    assert.equal(options.isolationLevel, 'ReadCommitted');
    let draft, release;
    const tx = client(() => { assert.ok(draft, 'Leer después de adquirir el bloqueo'); return draft; }, true);
    tx.$queryRaw = async (sql, key) => {
      assert.match(sql.join('?'), /pg_advisory_xact_lock\(hashtextextended/);
      assert.equal(key, 'afp:debt-accounts:a');
      const previous = tail;
      tail = new Promise(resolve => { release = resolve; });
      await previous;
      draft = structuredClone(state);
      return [{ locked: 1 }];
    };
    try {
      const result = await run(tx);
      state = draft;
      return result;
    } finally { release?.(); }
  };
  const load = sourceLoader({
    '@/lib/prisma': { prisma: db },
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body: JSON.parse(JSON.stringify(body)), status: options.status || 200 }) } },
    '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'a' } } }) } }) },
  }, { console: { error() {} } });
  const call = (route, method, body = {}) => load(`src/app/api/${route}/route`)[method]({
    headers: new Headers({ authorization: 'Bearer a' }), url: `http://localhost/api/${route}?id=${body.id || ''}`, json: async () => body,
  });
  const seed = (kind, values = {}) => {
    const row = { id: `${kind}-${++sequence}`, userId: 'a', personId: 'person-a', originalAmount: 100, status: 'ACTIVE', concept: 'Deuda', originDate: new Date('2026-10-17'), ...values };
    state[`${kind}Account`].push(row);
    return { ...row, originDate: '2026-10-17' };
  };
  return { call, seed, state: () => structuredClone(state), fail: value => { failure = value; } };
}
module.exports = { debtFixture };
