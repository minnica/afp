const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomBytes, randomUUID } = require('node:crypto');
const { sourceLoader } = require('./helpers/load-source.ts');

test('calendar eventos: las mutaciones autenticadas disparan trabajo para el propietario; las lecturas no', async () => {
  const scheduled = [];
  const load = sourceLoader({
    '@/lib/calendar/schedule': { scheduleCalendarSync: id => scheduled.push(id) },
    'next/server': { NextResponse: { json: body => body } },
    '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async token => ({ data: { user: token === 'valid' ? { id: 'server-owner' } : null } }) } }) },
  });
  const { requireApiUser } = load('src/lib/apiAuth.ts');
  const request = (path, method, token = 'valid') => ({ method, url: `https://afp.example.test/api/${path}?userId=other`, headers: new Headers({ authorization: `Bearer ${token}` }) });
  for (const [path, method] of [['card-cycles', 'PATCH'], ['incomes', 'POST'], ['expenses', 'POST'], ['payables', 'PATCH'], ['receivables', 'DELETE'], ['subscriptions', 'PATCH']]) {
    await requireApiUser(request(path, method));
  }
  assert.deepEqual(scheduled, Array(6).fill('server-owner'));
  await requireApiUser(request('card-cycles', 'GET'));
  await requireApiUser(request('calendar/google/sync', 'POST'));
  await assert.rejects(requireApiUser(request('incomes', 'POST', 'invalid')));
  assert.equal(scheduled.length, 6);
});

test('calendar eventos: captura nativa solicita sincronización después del commit y usa al dueño autenticado', async () => {
  const scheduled = [];
  let committed = false, fail = false;
  class ApiAccessError extends Error {}
  const load = sourceLoader({
    '@/lib/prisma': { prisma: { $transaction: fn => fn({}) } },
    '@/lib/apiAuth': { ApiAccessError, apiResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } },
    '@/lib/captureService': {
      lockedCaptureDevice: async () => ({ userId: 'device-owner' }), limitCaptureAttempts: async () => {},
      receiveCaptureEvent: async () => { if (fail) throw new Error('rollback'); committed = true; return { event: { status: 'RECEIVED' } }; },
    },
    '@/lib/calendar/schedule': { scheduleCalendarSync: id => { assert.equal(committed, true); scheduled.push(id); } },
  });
  const { captureRequest } = load('src/lib/captureApi.ts');
  const event = { contractVersion: 1, eventId: randomUUID(), sourcePackage: 'com.bancomer.mbanking', notificationKeyHash: 'b'.repeat(64),
    postedAt: '2026-10-21T01:00:00Z', receivedAt: '2026-10-21T01:00:01Z', fields: { 'android.title': 'Prueba', 'android.text': 'Aviso ficticio $12.34' } };
  const request = () => new Request('https://afp.example.test/api/captures/events?userId=other', { method: 'POST',
    headers: { authorization: `Capture ${randomUUID()}.${randomBytes(32).toString('base64url')}`, 'content-type': 'application/json' }, body: JSON.stringify(event) });
  assert.equal((await captureRequest(request(), 'event')).status, 200);
  assert.deepEqual(scheduled, ['device-owner']);
  fail = true; committed = false;
  assert.equal((await captureRequest(request(), 'event')).status, 500);
  assert.equal(scheduled.length, 1);
});

test('calendar eventos: consume lotes y cambios concurrentes; termina al quedar al día', async () => {
  let ticks = 0, calls = 0;
  const current = { status: 'CONNECTED', revision: 2, syncedRevision: 1, nextAttemptAt: new Date(0), lastSyncedAt: new Date(100000) };
  const db = { googleCalendarConnection: { findUnique: async () => current } };
  const { runCalendarSync } = sourceLoader({ '@/lib/prisma': { prisma: db } })('src/lib/calendar/worker.ts');
  const result = await runCalendarSync('owner', { db, clock: () => ticks, wait: async ms => { ticks += ms; }, sync: async (_id, options) => {
    assert.ok(options.budgetMs <= 210000); calls++;
    if (calls === 1) { current.nextAttemptAt = new Date(10000); return { status: 'PENDING' }; }
    if (calls === 2) { current.nextAttemptAt = new Date(ticks); current.revision++; return { status: 'SYNCED' }; }
    current.syncedRevision = current.revision; return { status: 'SYNCED' };
  } });
  assert.equal(result.status, 'SYNCED'); assert.equal(calls, 3); assert.equal(ticks, 10000);
});

test('calendar eventos: no mantiene temporizadores ante errores, bloqueos, cuotas o agotamiento de tiempo', async () => {
  const db = { googleCalendarConnection: { findUnique: async () => ({ nextAttemptAt: new Date(600000) }) } };
  const { runCalendarSync } = sourceLoader({ '@/lib/prisma': { prisma: db } })('src/lib/calendar/worker.ts');
  const noWait = async () => { throw new Error('No debe esperar'); };
  for (const status of ['ERROR', 'BUSY', 'SKIPPED', 'UNCONFIGURED', 'DISCONNECTED']) {
    let calls = 0;
    assert.equal((await runCalendarSync('owner', { db, wait: noWait, sync: async () => { calls++; return { status }; } })).status, status);
    assert.equal(calls, 1);
  }
  assert.equal((await runCalendarSync('owner', { db, wait: noWait, clock: () => 0, sync: async () => ({ status: 'PENDING' }) })).status, 'PENDING');
  assert.equal((await runCalendarSync('owner', { db, wait: noWait, budgetMs: 10000, sync: async () => { throw new Error('Sin tiempo'); } })).status, 'PENDING');
});
