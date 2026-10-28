import { present,sparseCalculations,stringValue,uncheckedFixture } from './helpers/financial-fixtures';
import { parseJson,routeHandlers,integrationLoader as sourceLoader } from './helpers/integration-fixtures';

import { record as objectValue } from './helpers/dynamic-values';

import type { CalendarClient,GoogleResource } from '../src/lib/calendar/types';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

const env = { GOOGLE_CALENDAR_CLIENT_ID: 'test-client', GOOGLE_CALENDAR_CLIENT_SECRET: 'test-secret', CALENDAR_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'), AFP_APP_ORIGIN: 'https://afp.example.test' };
const url = process.env.AFP_TEST_DATABASE_URL;

async function fixture() {
  const parsed = new URL(present(url));
  assert.ok(['localhost', '127.0.0.1'].includes(parsed.hostname) && parsed.pathname.startsWith('/afp_test'), 'Solo se permite PostgreSQL local de pruebas');
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const load = sourceLoader({ '@/lib/prisma': { prisma: db } }, { process: { env }, URLSearchParams, AbortSignal });
  const config = load('src/lib/calendar/config.ts');
  const service = load('src/lib/calendar/service.ts');
  const sync = load('src/lib/calendar/sync.ts');
  const userId = `calendar-${randomUUID()}`;
  await db.user.create({ data: { id: userId, email: `${userId}@example.test` } });
  const connection = await db.googleCalendarConnection.create({ data: { userId, status: 'CONNECTED', refreshToken: config.encryptSecret('private-refresh', userId), googleSubject: 'subject-test' } });
  const remote = new Map<string, GoogleResource>(), calendars: GoogleResource[] = [], calls: { path: string; method: string; body?: unknown; headers?: Record<string, string> }[] = [];
  let failNextPost = false;
  const client: CalendarClient = { all: async path => { calls.push({ path, method: 'GET' }); return path.startsWith('users/') ? calendars : [...remote.values()]; }, request: async (path, method = 'GET', body: unknown, headers) => {
    calls.push({ path, method, body, headers });
    if (path === 'calendars') { const created = { ...objectValue(body), id: 'afp-owned-calendar' }; calendars.push(created); return created; }
    if (path === 'calendars/afp-owned-calendar') {
      const calendar = present(calendars.find(c => c.id === 'afp-owned-calendar'));
      calendar.etag ||= '"calendar-0"';
      if (method === 'GET') return { ...calendar };
      assert.equal(method, 'PATCH'); assert.equal(present(headers)['If-Match'], calendar.etag);
      Object.assign(calendar, body, { etag: `"calendar-${calls.length}"` }); return { ...calendar };
    }
    assert.ok(path.startsWith('calendars/afp-owned-calendar/events'));
    const id = present(path.split('?')[0]).split('/')[3];
    if (method === 'POST') {
      assert.ok(path.includes('eventLabelVersion=1'));
      if (remote.has(stringValue(objectValue(body).id))) throw new config.CalendarError('GOOGLE_UNAVAILABLE', 409);
      remote.set(stringValue(objectValue(body).id), { ...objectValue(body), status: 'confirmed' });
      if (failNextPost) { failNextPost = false; throw new config.CalendarError('GOOGLE_UNAVAILABLE'); }
      return present(remote.get(stringValue(objectValue(body).id)));
    }
    if (method === 'GET') { if (!remote.has(present(id))) throw new config.CalendarError('GOOGLE_UNAVAILABLE', 404); return present(remote.get(present(id))); }
    if (method === 'PATCH') { assert.ok(path.includes('eventLabelVersion=1')); assert.ok(remote.has(present(id))); remote.set(present(id), { ...remote.get(present(id)), ...objectValue(body) }); return present(remote.get(present(id))); }
    if (method === 'DELETE') { remote.set(present(id), { id, status: 'cancelled' }); return {}; }
    throw new Error('unexpected method');
  } };
  const now = new Date('2026-10-21T18:00:00Z');
  const perform = async (options: Parameters<typeof sync.syncGoogleCalendar>[1] = {}) => {
    await db.googleCalendarConnection.update({ where: { userId }, data: { nextAttemptAt: new Date(0) } });
    return sync.syncGoogleCalendar(userId, { db, clientFactory: async () => client, now, ...options });
  };
  try {
    const { uiResponseSchemas } = load('src/lib/uiResponseSchemas.ts');
    uiResponseSchemas['calendar/google'].parse(parseJson(JSON.stringify(await service.calendarStatus(userId, db))));
    return { db, load, config, service, sync, userId, connection, client, remote, calendars, calls, perform, losePost: () => { failNextPost = true; } }; }
  catch (error) { await db.user.delete({ where: { id: userId } }); await db.$disconnect(); throw error; }
}
const integration = (name: string, run: (context: Awaited<ReturnType<typeof fixture>>) => Promise<void>) => test(name, { skip: !url }, async () => { const context = await fixture(); try { await run(context); } finally { await context.db.user.delete({ where: { id: context.userId } }); await context.db.$disconnect(); } });

integration('calendar DB: OAuth vinculado al navegador, expiración, un solo uso y cuenta estable', async ({ db, service, config, userId }) => {
  let exchanges = 0;
  const exchange = async () => { exchanges++; return { subject: 'subject-test', email: 'calendar@example.test', refreshToken: 'new-refresh' }; };
  const begin = await service.beginCalendarOAuth(userId, db);
  const oauthUrl = new URL(begin.url); const state = oauthUrl.searchParams.get('state');
  assert.equal(oauthUrl.searchParams.get('access_type'), 'offline'); assert.equal(oauthUrl.searchParams.get('code_challenge_method'), 'S256');
  const record = await db.calendarOAuthState.findUnique({ where: { stateHash: config.hash(present(state)) } });
  assert.notEqual(present(record).verifier, oauthUrl.searchParams.get('code_challenge'));
  await assert.rejects(service.completeCalendarOAuth({ state, browser: 'other-browser', code: 'code' }, { db, exchange }), /OAUTH_EXPIRED/);
  assert.equal(exchanges, 0);
  await service.completeCalendarOAuth({ state, browser: begin.browser, code: 'code' }, { db, exchange });
  await assert.rejects(service.completeCalendarOAuth({ state, browser: begin.browser, code: 'code' }, { db, exchange }), /OAUTH_EXPIRED/);
  assert.equal(exchanges, 1);
  assert.equal(config.decryptSecret(present(present((await db.googleCalendarConnection.findUnique({ where: { userId } }))).refreshToken), userId), 'new-refresh');
  const next = await service.beginCalendarOAuth(userId, db); const nextState = new URL(next.url).searchParams.get('state');
  await assert.rejects(uncheckedFixture(service.completeCalendarOAuth, { state: nextState, browser: next.browser, code: 'code' }, { db, exchange: async () => ({ subject: 'other-account', refreshToken: 'bad' }) }), /ACCOUNT_MISMATCH/);
  const last = await service.beginCalendarOAuth(userId, db); const lastState = new URL(last.url).searchParams.get('state');
  await db.calendarOAuthState.update({ where: { stateHash: config.hash(present(lastState)) }, data: { expiresAt: new Date(0) } });
  await assert.rejects(service.completeCalendarOAuth({ state: lastState, browser: last.browser, code: 'code' }, { db, exchange }), /OAUTH_EXPIRED/);
});

integration('calendar DB: sincronización idempotente, fecha corregida, pago parcial/liquidado y borrado', async ({ db, userId, perform, remote, calls, connection }) => {
  const card = await db.card.create({ data: { userId, name: 'Test card', usualCutDay: 25, usualDueDay: 10 } });
  const cycle = await db.cardCycle.create({ data: { userId, cardId: card.id, month: 10, year: 2026, startDate: new Date('2026-09-26'), cutDate: new Date('2026-10-25'), dueDate: new Date('2026-11-10'), statementAmount: 1000, paidAmount: 200 } });
  assert.equal((await perform()).status, 'SYNCED');
  const key = `card:${card.id}:2026-10:payment`;
  const mapping = await db.googleCalendarEvent.findUnique({ where: { connectionId_sourceKey: { connectionId: connection.id, sourceKey: key } } });
  assert.match(present(present(remote.get(present(mapping).eventId)).summary), /Pago parcial/);
  const writes = calls.filter(c => c.method !== 'GET').length;
  const reads = calls.length;
  assert.equal((await perform()).status, 'SKIPPED'); assert.equal(calls.length, reads);
  // Una sincronización manual pide otra revisión, sin reescribir eventos idénticos.
  await db.googleCalendarConnection.update({ where: { userId }, data: { revision: { increment: 1 } } });
  assert.equal(objectValue((await perform())).writes, 0); assert.equal(calls.filter(c => c.method !== 'GET').length, writes);
  const unchanged = await db.googleCalendarEvent.findUnique({ where: { connectionId_sourceKey: { connectionId: connection.id, sourceKey: key } } });
  assert.equal(present(unchanged).updatedAt.getTime(), present(mapping).updatedAt.getTime());
  await db.cardCycle.update({ where: { id: cycle.id }, data: { dueDate: new Date('2026-11-12'), paidAmount: 1000 } });
  await perform();
  assert.equal(present(present(remote.get(present(mapping).eventId)).start).date, '2026-11-12');
  assert.match(present(present(remote.get(present(mapping).eventId)).summary), /Pagado/); assert.equal(present(present(present(remote.get(present(mapping).eventId)).reminders).overrides).length, 0);
  await db.card.delete({ where: { id: card.id } });
  await perform(); assert.ok([...remote.values()].every(e => e.status === 'cancelled'));
});

integration('calendar DB: corrige un cobro futuro marcado como cobrado en Google sin duplicar eventos ni ingresos', async ({ db, load, userId, perform, remote, calls, connection }) => {
  const person = await db.person.create({ data: { userId, name: 'Persona de prueba' } });
  const incomeType = await db.incomeType.create({ data: { userId, name: 'Cobro' } });
  const account = await db.receivableAccount.create({ data: { userId, personId: person.id, concept: 'Préstamo', originalAmount: 10000,
    expectedMonthlyPayment: 1730.89, expectedChargeDays: [15, 30], originDate: new Date('2026-10-01'), originType: 'MANUAL' } });
  await db.income.create({ data: { userId, incomeTypeId: incomeType.id, receivableAccountId: account.id,
    date: new Date('2026-10-15'), source: 'Prueba', concept: 'Primer cobro', amount: 1750 } });
  assert.equal((await perform()).status, 'SYNCED');
  const mappings = await db.googleCalendarEvent.findMany({ where: { connectionId: connection.id } });
  const mapping = mappings.find(m => m.sourceKey === `receivable:${account.id}:2026-10:1`);
  const event = remote.get(present(mapping).eventId);
  // Reproduce el evento que dejó la versión anterior en el calendario existente.
  remote.set(present(mapping).eventId, { ...event, summary: 'Cobrado · Persona de prueba', colorId: '10', eventLabelId: '',
    reminders: { useDefault: false, overrides: [] } });
  await db.googleCalendarConnection.update({ where: { userId }, data: { revision: { increment: 1 } } });
  const start = calls.length;
  assert.equal((await perform()).status, 'SYNCED');
  const changed = calls.slice(start).filter(c => c.method !== 'GET');
  assert.equal(changed.length, 1); assert.equal(present(changed[0]).method, 'PATCH');
  assert.ok(present(changed[0]).path.includes(present(mapping).eventId));
  const fixed = remote.get(present(mapping).eventId);
  assert.equal(present(fixed).summary, 'Cobrar · Persona de prueba');
  assert.equal(present(fixed).eventLabelId, sparseCalculations(load('src/lib/calendar/palette.ts')).CALENDAR_EVENT_PALETTE.pending.id);
  assert.equal(present(present(fixed).start).date, '2026-10-30'); assert.equal(present(present(present(fixed).reminders).overrides).length, 1);
  assert.equal(await db.googleCalendarEvent.count({ where: { connectionId: connection.id } }), mappings.length);
  assert.equal(await db.income.count({ where: { userId } }), 1);
  assert.equal(present((await db.receivableAccount.findUnique({ where: { id: account.id } }))).status, 'ACTIVE');
});

integration('calendar eventos DB: fechas y pagos de tarjeta, cobros y gastos vinculados actualizan Google al guardar', async ({ db, load, userId, perform, remote, client }) => {
  const person = await db.person.create({ data: { userId, name: 'Persona de prueba' } });
  const type = await db.incomeType.create({ data: { userId, name: 'Cobro de prueba' } });
  const category = await db.category.create({ data: { userId, name: 'Pago de prueba' } });
  const receivable = await db.receivableAccount.create({ data: { userId, personId: person.id, concept: 'Cobrar', originalAmount: 100, expectedMonthlyPayment: 100,
    originDate: new Date('2026-10-01'), expectedChargeDays: [25], originType: 'MANUAL' } });
  const payable = await db.payableAccount.create({ data: { userId, personId: person.id, concept: 'Pagar', originalAmount: 100,
    originDate: new Date('2026-10-01'), expectedDate: new Date('2026-10-25'), originType: 'MANUAL' } });
  const card = await db.card.create({ data: { userId, name: 'Evento tarjeta', usualCutDay: 25, usualDueDay: 10 } });
  const cycle = await db.cardCycle.create({ data: { userId, cardId: card.id, month: 10, year: 2026, startDate: new Date('2026-09-26'),
    cutDate: new Date('2026-10-25'), dueDate: new Date('2026-11-10'), statementAmount: 100 } });
  await perform();
  const pending: (string)[] = [];
  const api = sourceLoader({ '@/lib/prisma': { prisma: db },
    '@/lib/calendar/schedule': { scheduleCalendarSync: owner => pending.push(owner) },
    'next/server': { NextResponse: { json: (body: unknown, options = {}) => ({ body, status: options.status || 200 }) } },
    '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: userId } } }) } }) },
  }, { process: { env }, URLSearchParams, AbortSignal });
  const worker = load('src/lib/calendar/worker.ts');
  const request = (path: string, method: string, body: unknown) => ({ method, url: `https://afp.example.test/api/${path}`, headers: new Headers({ authorization: 'Bearer valid' }), json: async () => body });
  const save = async (path: string, method: string, body: unknown) => {
    const response = await present(routeHandlers(api(`src/app/api/${path}/route`))[method])(request(path, method, body));
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(pending.length, 1); assert.equal(pending[0], userId);
    const connection = await db.googleCalendarConnection.findUnique({ where: { userId } });
    assert.ok(present(connection).revision > present(connection).syncedRevision, 'El dato confirmado marca la agenda pendiente');
    assert.equal((await worker.runCalendarSync(present(pending.shift()), { db, clientFactory: async () => client, now: new Date('2026-10-21T18:00:00Z') })).status, 'SYNCED');
  };
  const active = (key: string) => [...remote.values()].find(e => e.status !== 'cancelled' && e.extendedProperties?.private?.afpSource === key);
  const paymentKey = `card:${card.id}:2026-10:payment`;
  await save('card-cycles', 'PATCH', { id: cycle.id, action: 'UPDATE_DATES', startDate: '2026-09-26', cutDate: '2026-10-24', dueDate: '2026-11-12' });
  assert.equal(present(present(active(paymentKey)).start).date, '2026-11-12');
  await save('card-cycles', 'PATCH', { id: cycle.id, action: 'MARK_AS_PAID', paidAmount: 100, paidAt: '2026-10-21' });
  assert.match(present(present(active(paymentKey)).summary), /Pagado/); assert.equal(present(present(present(active(paymentKey)).reminders).overrides).length, 0);
  await save('incomes', 'POST', { date: '2026-10-21', incomeTypeId: type.id, source: 'Prueba', concept: 'Cobro liquidado', amount: 100, receivableAccountId: receivable.id });
  assert.ok(![...remote.values()].some(e => e.status !== 'cancelled' && present(present(e.start)?.date) > '2026-10-21' && e.extendedProperties?.private?.afpSource?.startsWith(`receivable:${receivable.id}:`)));
  await save('expenses', 'POST', { date: '2026-10-21', paymentMethod: 'CASH', categoryId: category.id, concept: 'Pago liquidado', amount: 100, payableAccountId: payable.id });
  assert.match(present(present(active(`payable:${payable.id}`)).summary), /Pagado/);
  assert.equal(present(present(present(active(`payable:${payable.id}`)).reminders).overrides).length, 0);
});

integration('calendar DB: revisar corte exige ambos guardados, conserva ID y no registra pagos', async ({ db, load, userId, perform, remote, connection }) => {
  const palette = sparseCalculations(load('src/lib/calendar/palette.ts')).CALENDAR_EVENT_PALETTE;
  const api = sourceLoader({ '@/lib/prisma': { prisma: db },
    '@/lib/calendar/schedule': { scheduleCalendarSync: () => {} },
    'next/server': { NextResponse: { json: (body: unknown, options = {}) => ({ body, status: options.status || 200 }) } },
    '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: userId } } }) } }) },
  }, { process: { env }, URLSearchParams, AbortSignal });
  const patch = async (body: unknown) => {
    const response = await api('src/app/api/card-cycles/route.ts').PATCH({ method: 'PATCH', url: 'https://afp.example.test/api/card-cycles',
      headers: new Headers({ authorization: 'Bearer valid' }), json: async () => body });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal((await perform()).status, 'SYNCED');
    return response.body.cycle;
  };
  for (const first of ['UPDATE_STATEMENT', 'UPDATE_DATES'] as const) {
    const card = await db.card.create({ data: { userId, name: first, usualCutDay: 25, usualDueDay: 10 } });
    const cycle = await db.cardCycle.create({ data: { userId, cardId: card.id, month: 10, year: 2026,
      startDate: new Date('2026-09-26T12:00:00Z'), cutDate: new Date('2026-10-25T12:00:00Z'), dueDate: new Date('2026-11-10T12:00:00Z') } });
    assert.equal(cycle.datesConfirmedAt, null, 'la migración no confirma filas por defecto');
    await perform();
    const sourceKey = `card:${card.id}:2026-10:cut`;
    const mapping = await db.googleCalendarEvent.findUnique({ where: { connectionId_sourceKey: { connectionId: connection.id, sourceKey } } });
    const before = remote.get(present(mapping).eventId);
    assert.equal(present(before).eventLabelId, palette.informational.id);
    const actions = {
      UPDATE_STATEMENT: { id: cycle.id, action: 'UPDATE_STATEMENT', statementAmount: 1000 },
      UPDATE_DATES: { id: cycle.id, action: 'UPDATE_DATES', startDate: '2026-09-26', cutDate: '2026-10-25', dueDate: '2026-11-10' },
    };
    await patch(actions[first]);
    assert.equal(present(remote.get(present(mapping).eventId)).eventLabelId, palette.informational.id, 'un solo dato deja el corte gris');
    await patch(actions[first === 'UPDATE_DATES' ? 'UPDATE_STATEMENT' : 'UPDATE_DATES']);
    const after = remote.get(present(mapping).eventId);
    assert.equal(present(after).eventLabelId, palette.completed.id);
    assert.match(present(present(after).summary), /^Corte revisado ·/);
    assert.equal(present(present(after).start).date, present(present(before).start).date); assert.equal(present(present(after).end).date, present(present(before).end).date);
    assert.deepEqual(present(after).reminders, present(before).reminders);
    assert.equal(present(present(present(after).extendedProperties).private).afpSource, sourceKey);
    const payment = [...remote.values()].find(event => event.extendedProperties?.private?.afpSource === sourceKey.replace(/cut$/, 'payment'));
    assert.equal(present(payment).eventLabelId, palette.pending.id); assert.match(present(present(payment).summary), /^Pago ·/);
    assert.equal(present(present(present(payment).reminders).overrides).length, 1);
    const saved = await db.cardCycle.findUnique({ where: { id: cycle.id } });
    assert.ok(present(saved).datesConfirmedAt); assert.equal(present(saved).paidAt, null); assert.equal(present(saved).paidAmount, null);
    assert.equal(await db.cardCyclePayment.count({ where: { userId } }), 0);
    assert.equal(await db.dailyExpense.count({ where: { userId } }), 0);
    const stable = await db.googleCalendarEvent.findUnique({ where: { connectionId_sourceKey: { connectionId: connection.id, sourceKey } } });
    assert.equal(present(stable).eventId, present(mapping).eventId);
  }
});

integration('calendar DB: respuesta perdida y evento borrado en Google se recuperan sin duplicados activos', async ({ db, userId, perform, losePost, remote, connection }) => {
  const card = await db.card.create({ data: { userId, name: 'Recovery card', usualCutDay: 25, usualDueDay: 10 } });
  losePost(); assert.equal((await perform()).status, 'ERROR');
  assert.equal((await perform()).status, 'SYNCED');
  let mappings = await db.googleCalendarEvent.findMany({ where: { connectionId: connection.id } });
  assert.equal([...remote.values()].filter(e => e.status !== 'cancelled').length, mappings.length);
  const original = mappings[0]; remote.set(present(original).eventId, { id: present(original).eventId, status: 'cancelled' });
  // La revisión diaria repara cambios externos aunque AFP no haya cambiado.
  await db.googleCalendarConnection.update({ where: { userId }, data: { lastSyncedAt: new Date(Date.now() - 86400001) } });
  await perform(); mappings = await db.googleCalendarEvent.findMany({ where: { connectionId: connection.id } });
  const replacement = mappings.find(m => m.sourceKey === present(original).sourceKey);
  assert.notEqual(present(replacement).eventId, present(original).eventId); assert.equal(present(replacement).generation, 1);
  assert.equal([...remote.values()].filter(e => e.status !== 'cancelled').length, mappings.length);
  assert.ok(card.id);
});

integration('calendar DB: solo selecciona pendientes y revisión diaria; respeta esperas y desconexiones', async ({ db, load, userId, perform, connection, config }) => {
  const { calendarPendingWhere, calendarNeedsSync } = load('src/lib/calendar/pending.ts');
  const selected = async () => {
    const count = await db.googleCalendarConnection.count({ where: { AND: [{ userId }, calendarPendingWhere(db)] } });
    return count;
  };
  assert.equal(await selected(), 1); // Conexión nueva, sin primera sincronización.
  assert.equal((await perform()).status, 'SYNCED');
  await db.googleCalendarConnection.update({ where: { userId }, data: { nextAttemptAt: new Date(0) } });
  const clean = await db.googleCalendarConnection.findUnique({ where: { userId } });
  assert.equal(await selected(), 0);
  let googleCalls = 0;
  const failIfCalled = async () => { googleCalls++; throw new Error('No debe contactar Google'); };
  assert.equal((await perform({ clientFactory: failIfCalled })).status, 'SKIPPED');
  assert.equal(googleCalls, 0);
  assert.equal(calendarNeedsSync(clean, new Date(present(present(clean).lastSyncedAt).getTime() + 86400000 - 1)), false);
  assert.equal(calendarNeedsSync(clean, new Date(present(present(clean).lastSyncedAt).getTime() + 86400000)), true);
  await db.googleCalendarConnection.update({ where: { userId }, data: { lastSyncedAt: new Date(Date.now() - 86400001) } });
  assert.equal(await selected(), 1);
  assert.equal((await perform()).status, 'SYNCED');
  await db.card.create({ data: { userId, name: 'Pending trigger', usualCutDay: 25, usualDueDay: 10 } });
  assert.equal(await selected(), 1);
  await perform();
  // Un error en una revisión diaria conserva el reintento aunque las revisiones coincidan.
  await db.googleCalendarConnection.update({ where: { userId }, data: { lastError: 'GOOGLE_UNAVAILABLE', nextAttemptAt: new Date(0) } });
  assert.equal(await selected(), 1);
  assert.equal(objectValue((await perform({ clientFactory: async () => { throw new config.CalendarError('RATE_LIMIT', 429, 600000); } }))).code, 'RATE_LIMIT');
  assert.equal(await selected(), 0);
  const waiting = await db.googleCalendarConnection.findUnique({ where: { userId } });
  assert.equal(calendarNeedsSync(waiting), false);
  await db.googleCalendarConnection.update({ where: { userId }, data: { status: 'DISCONNECTING', nextAttemptAt: new Date(0), lastError: null } });
  assert.equal(await selected(), 1);
  await perform(); assert.equal(await selected(), 0);
  await db.googleCalendarConnection.update({ where: { userId }, data: { status: 'RECONNECT_REQUIRED', revision: connection.revision + 100, nextAttemptAt: new Date(0) } });
  assert.equal(await selected(), 0);
});

integration('calendar DB: termina lotes interrumpidos y conserva cambios recibidos durante la sincronización', async ({ db, userId, perform, calls, client }) => {
  await db.card.createMany({ data: Array.from({ length: 20 }, (_, i) => ({ userId, name: `Batch ${i}`, usualCutDay: 25, usualDueDay: 10 })) });
  assert.equal((await perform()).status, 'PENDING'); // Límite de 150 escrituras por ejecución.
  const pending = await db.googleCalendarConnection.findUnique({ where: { userId } });
  assert.ok(present(pending).revision > present(pending).syncedRevision);
  assert.equal((await perform()).status, 'SYNCED');
  const count = calls.length;
  assert.equal((await perform()).status, 'SKIPPED'); assert.equal(calls.length, count);
  await db.googleCalendarConnection.update({ where: { userId }, data: { revision: { increment: 1 } } });
  // El trigger se activa después de reclamar la conexión y antes de leer la agenda.
  assert.equal((await perform({ clientFactory: async () => {
    await db.card.create({ data: { userId, name: 'Arrived while syncing', usualCutDay: 25, usualDueDay: 10 } });
    return client;
  } })).status, 'SYNCED');
  const changed = await db.googleCalendarConnection.findUnique({ where: { userId } });
  assert.ok(present(changed).revision > present(changed).syncedRevision);
  assert.equal((await perform()).status, 'SYNCED');
});

integration('calendar DB: exclusión mutua, expiración del bloqueo, pausa por cuota y revocación', async ({ db, userId, sync, perform, config }) => {
  const claimed = await sync.claimConnection(db, userId);
  await assert.rejects(sync.claimConnection(db, userId), /BUSY/);
  await sync.releaseConnection(db, userId, 'wrong-token'); assert.equal((await perform()).status, 'BUSY');
  await sync.releaseConnection(db, userId, claimed.token);
  await db.googleCalendarConnection.update({ where: { userId }, data: { lockUntil: new Date(0), lockToken: 'stale' } });
  const before = Date.now();
  assert.equal(objectValue((await perform({ clientFactory: async () => { throw new config.CalendarError('RATE_LIMIT', 429, 600000); } }))).code, 'RATE_LIMIT');
  let current = await db.googleCalendarConnection.findUnique({ where: { userId } });
  assert.ok(present(current).nextAttemptAt.getTime() >= before + 600000); assert.equal(present(current).lockToken, null);
  await db.card.create({ data: { userId, name: 'Rate limit trigger', usualCutDay: 25, usualDueDay: 10 } });
  assert.equal(present((await db.googleCalendarConnection.findUnique({ where: { userId } }))).nextAttemptAt.getTime(), present(current).nextAttemptAt.getTime());
  assert.equal(objectValue((await perform({ clientFactory: async () => { throw new config.CalendarError('RECONNECT', 401); } }))).code, 'RECONNECT');
  current = await db.googleCalendarConnection.findUnique({ where: { userId } }); assert.equal(present(current).status, 'RECONNECT_REQUIRED');
});

integration('calendar DB: triggers atómicos por propietario y desconexión limpia sin borrar historial', async ({ db, userId, perform, service, remote }) => {
  const before = await db.googleCalendarConnection.findUnique({ where: { userId } });
  await assert.rejects(db.$transaction(async tx => { await tx.card.create({ data: { userId, name: 'Rollback card', usualCutDay: 10, usualDueDay: 20 } }); throw new Error('rollback'); }), /rollback/);
  assert.equal(present((await db.googleCalendarConnection.findUnique({ where: { userId } }))).revision, present(before).revision);
  const card = await db.card.create({ data: { userId, name: 'Disconnect card', usualCutDay: 25, usualDueDay: 10 } });
  await db.cardCycle.create({ data: { userId, cardId: card.id, month: 9, year: 2026, startDate: new Date('2026-08-26'), cutDate: new Date('2026-09-25'), dueDate: new Date('2026-10-10'), statementAmount: 100, paidAmount: 100 } });
  await perform();
  const past = [...remote.values()].filter(e => present(present(e.start)?.date) < '2026-10-21').map(e => e.id);
  assert.ok(past.length);
  await service.disconnectCalendar(userId, db); assert.equal((await perform()).status, 'DISCONNECTED');
  const current = await db.googleCalendarConnection.findUnique({ where: { userId } }); assert.equal(present(current).refreshToken, null);
  assert.ok([...remote.values()].filter(e => !past.includes(e.id)).every(e => e.status === 'cancelled'));
  assert.ok(past.every(id => present(remote.get(present(id))).status !== 'cancelled'));
  assert.equal(await db.card.count({ where: { userId } }), 1);
});

integration('calendar DB: recupera la creación del calendario y conserva cambios concurrentes pendientes', async ({ db, userId, connection, perform, calendars, calls }) => {
  calendars.push({ id: 'afp-owned-calendar', description: `Agenda de AFP. Referencia: ${connection.calendarMarker}` });
  const card = await db.card.create({ data: { userId, name: 'Concurrent card', usualCutDay: 25, usualDueDay: 10 } });
  await perform(); assert.ok(!calls.some(call => call.path === 'calendars' && call.method === 'POST'));
  const before = await db.googleCalendarConnection.findUnique({ where: { userId } });
  const pending = await db.$transaction(async tx => {
    await tx.card.update({ where: { id: card.id }, data: { usualDueDay: 12 } });
    return tx.googleCalendarConnection.findUnique({ where: { userId } });
  });
  assert.equal(present(pending).revision, present(before).revision + 1); assert.ok(present(pending).revision > present(pending).syncedRevision);
  const otherId = `calendar-other-${randomUUID()}`;
  try {
    await db.user.create({ data: { id: otherId, email: `${otherId}@example.test` } });
    await db.card.create({ data: { userId: otherId, name: 'Other owner', usualCutDay: 25, usualDueDay: 10 } });
    assert.equal(present((await db.googleCalendarConnection.findUnique({ where: { userId } }))).revision, present(pending).revision);
  } finally { await db.user.delete({ where: { id: otherId } }); }
});
