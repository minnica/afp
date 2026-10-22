const assert = require('node:assert/strict');
const { test } = require('node:test');
const { sourceLoader } = require('./helpers/load-source.cjs');
const { randomUUID } = require('node:crypto');
const { getCardBalance, summarizeCardBalances, creditBalanceSchema } = sourceLoader()('src/lib/cardBalances.js');
const plain = value => JSON.parse(JSON.stringify(value));
const snapshot = (creditLimit, usedBalance, balanceAsOf = '2026-10-21') => ({ creditLimit, usedBalance, balanceAsOf });

test('saldos: sin captura no es cero; una captura explícita de cero sí cuenta', () => {
  assert.equal(getCardBalance({}).hasBalance, false);
  assert.equal(getCardBalance({ creditLimit: 1000, usedBalance: null, balanceAsOf: '2026-10-21' }).hasBalance, false);
  assert.equal(summarizeCardBalances([{}]).debt, null);
  assert.equal(summarizeCardBalances([]).debt, null);
  const balance = getCardBalance(snapshot('1000.00', '0.00'));
  assert.equal(balance.hasBalance, true);
  assert.equal(balance.debt, 0);
  assert.equal(balance.availableCredit, 1000);
  const total = summarizeCardBalances([{}, snapshot(1000, 0)]);
  assert.equal(total.capturedCards, 1);
  assert.equal(total.missingCards, 1);
  assert.equal(total.debt, 0);
  assert.equal(total.creditLimit, 1000);
});

test('saldos: suma a centavos y calcula el disponible de cada tarjeta antes de sumar', () => {
  const total = summarizeCardBalances([
    snapshot('35000.00', '12500.25', '2026-10-20'),
    snapshot('20000.00', '20500.20'),
    snapshot('10000.00', '-300.10'),
    {},
  ]);
  assert.equal(total.debt, 33000.45);
  assert.equal(total.creditLimit, 65000);
  assert.equal(total.availableCredit, 32799.85);
  assert.equal(total.creditBalance, 300.10);
  assert.equal(total.oldestDate, '2026-10-20');
  assert.equal(total.newestDate, '2026-10-21');
  assert.equal(total.missingCards, 1);
  assert.equal(summarizeCardBalances([snapshot(1, 0.1), snapshot(1, 0.2)]).debt, 0.3);
});

test('saldos: límite cero, sobregiro y saldo a favor mantienen su significado', () => {
  const over = getCardBalance(snapshot(100, 120.01));
  assert.equal(over.availableCredit, 0);
  assert.equal(over.overLimit, 20.01);
  assert.equal(over.usedBalance, 120.01);
  assert.equal(getCardBalance(snapshot(0, 10)).utilization, null);
  const credit = getCardBalance(snapshot(100, -25));
  assert.equal(credit.debt, 0);
  assert.equal(credit.availableCredit, 125);
  assert.equal(credit.creditBalance, 25);
  assert.equal(getCardBalance(snapshot('NaN', 1)).hasBalance, false);
});

test('saldos: validación compartida rechaza importes inválidos y fechas imposibles o futuras', () => {
  const schema = creditBalanceSchema('2026-10-21');
  for (const value of ['', ' ', null, true, {}, '1,000', '1e3', '1.001', Infinity, NaN, 10000000000]) {
    assert.equal(schema.safeParse(snapshot(value, 0)).success, false, String(value));
    assert.equal(schema.safeParse(snapshot(100, value)).success, false, String(value));
  }
  assert.equal(schema.safeParse(snapshot(-1, 0)).success, false);
  assert.equal(schema.safeParse(snapshot(100, -10000000000)).success, false);
  for (const date of ['', '2026-10-22', '2026-02-29', '2026-02-30', '2026-13-01', '2026-1-1', '0000-01-01']) {
    assert.equal(schema.safeParse(snapshot(100, 1, date)).success, false, date);
  }
  assert.equal(schema.safeParse(snapshot('0', '-0.01', '2024-02-29')).success, true);
  assert.equal(schema.safeParse(snapshot('9999999999.99', '-9999999999.99')).success, true);
});

function apiFixture() {
  const row = { id: 'card-a', userId: 'a', name: 'Azul', usualCutDay: 10, usualDueDay: 30, notes: 'Conservar', ...snapshot(null, null, null) };
  const writes = [];
  const prisma = { card: {
    findMany: async ({ where }) => where.userId === row.userId ? [row] : [],
    findUnique: async ({ where }) => where.userId === row.userId && where.id === row.id ? row : null,
    update: async ({ where, data }) => {
      if (where.userId !== row.userId || where.id !== row.id) throw Object.assign(new Error('missing'), { code: 'P2025' });
      writes.push(plain(data)); Object.assign(row, data); return row;
    },
  } };
  for (const model of ['dailyExpense', 'installmentPurchase', 'cardCycle', 'cardCycleCredit']) prisma[model] = { findMany: async () => [] };
  prisma.$transaction = async operation => operation(prisma);
  const route = sourceLoader({
    '@/lib/prisma': { prisma },
    '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async token => ({ data: { user: ['a', 'b'].includes(token) ? { id: token } : null } }) } }) },
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body: plain(body), status: options.status || 200, headers: new Headers(options.headers) }) } },
  })('src/app/api/cards/route.js');
  const attempts = new Map();
  const request = (body, token = 'a') => {
    if (body?.action === 'UPDATE_CREDIT_BALANCE') {
      const key = JSON.stringify(body);
      if (!attempts.has(key)) attempts.set(key, randomUUID());
      body = { ...body, balanceCaptureId: attempts.get(key), expectedBalanceCaptureId: row.balanceTracking?.captureId ?? null };
    }
    return { url: 'http://localhost/api/cards?userId=b', headers: new Headers(token ? { authorization: `Bearer ${token}` } : {}), json: async () => body };
  };
  return { route, request, row, writes };
}

test('saldos API: exige identidad, propiedad e importes válidos antes de guardar', async () => {
  const { route, request, writes } = apiFixture();
  const body = { id: 'card-a', action: 'UPDATE_CREDIT_BALANCE', ...snapshot(10000, 3000, '2026-01-01') };
  for (const token of ['', 'expired']) assert.equal((await route.PATCH(request(body, token))).status, 401);
  assert.equal((await route.PATCH(request(body, 'b'))).status, 404);
  assert.equal((await route.PATCH(request({ ...body, id: 'missing' }))).status, 404);
  assert.equal((await route.PATCH(request({ ...body, id: { not: '' } }))).status, 400);
  assert.equal((await route.PATCH(request({ ...body, usedBalance: '1.001' }))).status, 400);
  assert.equal((await route.PATCH(request({ ...body, balanceAsOf: '2999-01-01' }))).status, 400);
  assert.equal((await route.PATCH(request({ ...body, creditLimit: null }))).status, 400);
  assert.equal(writes.length, 0);
});

test('saldos API: guardar sustituye la captura; editar la tarjeta conserva los saldos y las notas', async () => {
  const { route, request, row, writes } = apiFixture();
  const body = { id: row.id, action: 'UPDATE_CREDIT_BALANCE', userId: 'b', name: 'No autorizado en esta acción', ...snapshot('10000.50', '5000.25', '2026-01-01') };
  const saved = await route.PATCH(request(body));
  assert.equal(saved.status, 200);
  assert.equal(saved.headers.get('cache-control'), 'private, no-store');
  assert.equal(saved.body.card.userId, 'a');
  assert.equal(saved.body.card.name, 'Azul');
  assert.equal(saved.body.card.notes, 'Conservar');
  assert.deepEqual(Object.keys(writes[0]).sort(), ['balanceAsOf', 'balanceTracking', 'creditLimit', 'usedBalance']);
  assert.equal((await route.PATCH(request(body))).status, 200);
  assert.equal(row.usedBalance, 5000.25);
  assert.equal((await route.PATCH(request({ ...body, usedBalance: 0 }))).status, 200);
  assert.equal(row.usedBalance, 0);
  await route.PATCH(request({ id: row.id, name: 'Renombrada', usualCutDay: 15, usualDueDay: 25, notes: 'Nueva nota' }));
  assert.equal(row.usedBalance, 0);
  assert.equal(row.creditLimit, 10000.5);
  assert.equal(row.balanceAsOf.toISOString(), '2026-01-01T00:00:00.000Z');
  const read = await route.GET(request());
  assert.equal(read.body.cards[0].name, 'Renombrada');
  assert.equal(read.body.cards[0].creditLimit, 10000.5);
});
