// Referencia de comportamiento: PostgreSQL real, Auth ficticia y reloj fijo.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { sourceLoader } = require('../../../tests/helpers/load-source.cjs');

const connectionString = process.env.AFP_TEST_DATABASE_URL;
assert.ok(connectionString, 'Define AFP_TEST_DATABASE_URL para una base local desechable.');
const url = new URL(connectionString);
assert.ok(['localhost', '127.0.0.1'].includes(url.hostname)
  && /^\/afp_test[a-zA-Z0-9_]*$/.test(url.pathname) && !url.search && !url.hash);
const fixture = path.join(__dirname, 'transfers.expected.json');
const fixedDay = '2026-10-27';
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [`${fixedDay}T18:00:00.000Z`])); }
  static now() { return new Date(`${fixedDay}T18:00:00.000Z`).getTime(); }
}

async function main() {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const users = [], ids = new Map(), cases = [];
  const operationId = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  let actor;
  const load = sourceLoader({
    '@/lib/prisma': { prisma: db },
    '@/lib/calendar/schedule': { scheduleCalendarSync: () => {} },
    '@supabase/supabase-js': { createClient: () => ({ auth: {
      getUser: async () => ({ data: { user: { id: actor } } }),
    } }) },
    'next/server': { NextResponse: { json: (body, options = {}) => ({
      body: JSON.parse(JSON.stringify(body)), status: options.status || 200,
      headers: Object.fromEntries(new Headers(options.headers)),
    }) } },
  }, { Date: FixedDate });
  const route = load('src/app/api/money/route.js');
  const request = (body, method = 'POST') => ({ method,
    url: 'http://localhost/api/money', headers: new Headers({ authorization: 'Bearer fictitious' }),
    json: async () => body,
  });
  const write = body => route.POST(request(body));
  const read = () => route.GET(request({}, 'GET'));
  function save(name, response, status = 200) {
    assert.equal(response.status, status, JSON.stringify(response.body));
    cases.push({ name, response }); return response.body;
  }
  function checkBalances(response, expected) {
    assert.equal(response.body.forecast.summary.balance, expected.reduce((a, b) => a + b, 0));
    for (const [index, balance] of expected.entries()) {
      const account = response.body.forecast.accounts.find(a => ids.get(a.id) === `account-${index + 1}`);
      assert.equal(account.balance, balance);
    }
  }
  // Conserva importes, fechas de negocio, orden y estructura. Solo sustituye IDs
  // conocidos (también en claves compuestas) y timestamps de persistencia.
  function normalize(value, key = '') {
    if (value === null) return null;
    if (typeof value === 'string') {
      if (['createdAt', 'updatedAt'].includes(key) && /^\d{4}-\d{2}-\d{2}T/.test(value)) return '<database-timestamp>';
      for (const [id, label] of ids) value = value.replaceAll(id, `<${label}>`);
      return value;
    }
    if (Array.isArray(value)) return value.map(item => normalize(item));
    if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [normalize(k), normalize(v, k)]));
    return value;
  }
  try {
    for (let n = 1; n <= 2; n++) {
      const user = await db.user.create({ data: { email: `phase0-${randomUUID()}@example.test` } });
      users.push(user.id); ids.set(user.id, `user-${n}`);
    }
    actor = users[0];
    for (const [index, openingBalance] of ['1000.25', '100.10'].entries()) {
      const reply = await write({ action: 'CREATE_ACCOUNT', operationId: operationId(index + 1),
        name: `Cuenta ficticia ${index + 1}`, kind: index ? 'CASH' : 'BANK',
        openingBalance, reservedAmount: 0, asOf: fixedDay });
      const account = save(`create-account-${index + 1}`, reply); ids.set(account.id, `account-${index + 1}`);
    }
    const accountIds = [...ids].filter(([, name]) => name.startsWith('account-')).map(([id]) => id);
    let reply = await read(); save('balances-before-transfer', reply); checkBalances(reply, [1000.25, 100.10]);
    const transfer = { action: 'TRANSFER', operationId: operationId(3), fromAccountId: accountIds[0],
      toAccountId: accountIds[1], amount: '200.25', date: fixedDay, concept: 'Transferencia ficticia' };
    const created = save('create-transfer', await write(transfer)); ids.set(created.id, 'transfer-1');
    const repeated = save('repeat-transfer', await write(transfer)); assert.deepEqual(repeated, created);
    save('conflicting-retry', await write({ ...transfer, amount: '200.26' }), 409);
    assert.equal(await db.moneyTransfer.count({ where: { userId: actor } }), 1);
    reply = await read(); save('balances-after-transfer', reply); checkBalances(reply, [800, 300.35]);
    actor = users[1];
    reply = await read(); save('other-user-balances', reply);
    assert.equal(reply.body.forecast.accounts.length, 0);
    save('other-user-reversal', await write({ action: 'REVERSE_TRANSFER', operationId: operationId(4), id: created.id }), 404);
    actor = users[0];
    const reversal = { action: 'REVERSE_TRANSFER', operationId: operationId(5), id: created.id };
    save('reverse-transfer', await write(reversal)); save('repeat-reversal', await write(reversal));
    reply = await read(); save('balances-after-reversal', reply); checkBalances(reply, [1000.25, 100.10]);
    const stored = await db.moneyTransfer.findUniqueOrThrow({ where: { id: created.id } });
    assert.equal(stored.reversedAt.toISOString(), `${fixedDay}T18:00:00.000Z`);
    assert.equal(await db.moneyTransfer.count({ where: { userId: actor } }), 1);
    const actual = normalize({ fixedDay, cases });
    if (process.argv.includes('--record')) {
      fs.writeFileSync(fixture, `${JSON.stringify(actual, null, 2)}\n`);
      console.log(`Referencia registrada: ${cases.length} respuestas.`);
    } else {
      assert.deepEqual(actual, JSON.parse(fs.readFileSync(fixture, 'utf8')));
      console.log(`Referencia idéntica: ${cases.length} respuestas; alta, repetición, conflicto, aislamiento, reversión y saldos.`);
    }
  } finally {
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
