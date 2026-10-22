const assert = require('node:assert/strict');
const { test } = require('node:test');
const { sourceLoader } = require('./helpers/load-source.cjs');
const env = { GOOGLE_CALENDAR_CLIENT_ID: 'test-client', GOOGLE_CALENDAR_CLIENT_SECRET: 'test-secret', CALENDAR_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'), AFP_APP_ORIGIN: 'https://afp.example.test', CRON_SECRET: 'cron-test-secret' };
const globals = { process: { env }, URLSearchParams, AbortSignal };
const plain = value => JSON.parse(JSON.stringify(value));
const load = sourceLoader({}, globals);
const config = load('src/lib/calendar/config.js');
const { buildCalendarEvents, googleEvent, mexicoDay } = load('src/lib/calendar/events.js');
const empty = () => ({ cards: [], cycles: [], subscriptions: [], receivables: [], payables: [] });
const now = new Date('2026-10-21T18:00:00Z');

test('calendar: credenciales cifradas ligadas al propietario, autenticadas y no deterministas', () => {
  const encrypted = config.encryptSecret('refresh-private', 'a');
  assert.notEqual(encrypted, config.encryptSecret('refresh-private', 'a'));
  assert.equal(config.decryptSecret(encrypted, 'a'), 'refresh-private');
  assert.throws(() => config.decryptSecret(encrypted, 'b'), /CREDENTIALS_UNAVAILABLE/);
  const pieces = encrypted.split('.'); pieces[3] = Buffer.from('tampered').toString('base64url');
  assert.throws(() => config.decryptSecret(pieces.join('.'), 'a'), /CREDENTIALS_UNAVAILABLE/);
  assert.equal(config.equalSecret('a', 'aa'), false);
  assert.equal(config.equalSecret(null, ''), false);
});

test('calendar: conserva el día bancario, ajusta febrero bisiesto y usa fin exclusivo', () => {
  assert.equal(mexicoDay(new Date('2026-10-22T04:30:00Z')), '2026-10-21');
  const data = empty(); data.cards.push({ id: 'card', name: 'Tarjeta', usualCutDay: 31, usualDueDay: 5 });
  const event = buildCalendarEvents(data, {}, new Date('2028-02-01T18:00:00Z')).events.find(e => e.key === 'card:card:2028-02:cut');
  assert.equal(event.date, '2028-02-29');
  const payment = buildCalendarEvents(data, {}, new Date('2028-02-01T18:00:00Z')).events.find(e => e.key === 'card:card:2028-02:payment');
  assert.equal(payment.date, '2028-03-05');
  assert.equal(googleEvent(event, { id: 'c' }, env.AFP_APP_ORIGIN).end.date, '2028-03-01');
  assert.ok(!buildCalendarEvents(data, {}, now).events.some(e => e.key.includes('2026-09')));
});

test('calendar: corrección de fechas mantiene clave, saldo parcial y liquidación sin recordatorio', () => {
  const data = empty(); data.cards.push({ id: 'card', name: 'Tarjeta', usualCutDay: 25, usualDueDay: 10 });
  let event = buildCalendarEvents(data, {}, now).events.find(e => e.key === 'card:card:2026-10:payment');
  assert.equal(event.date, '2026-11-10'); assert.equal(event.amount, null);
  const cycle = { cardId: 'card', year: 2026, month: 10, cutDate: '2026-10-24', dueDate: '2026-11-09', statementAmount: 1000, paidAmount: 300, postCutCreditAmount: 100 };
  data.cycles.push(cycle);
  event = buildCalendarEvents(data, {}, now).events.find(e => e.key === event.key);
  assert.equal(event.date, '2026-11-09'); assert.equal(event.amount, 600); assert.match(event.title, /Pago parcial/);
  const hidden = googleEvent(event, { id: 'c' }, env.AFP_APP_ORIGIN);
  assert.ok(!hidden.description.includes('600')); assert.equal(hidden.reminders.overrides.length, 1);
  assert.match(googleEvent(event, { id: 'c', preferences: { showAmounts: true } }, env.AFP_APP_ORIGIN).description, /600/);
  cycle.paidAmount = 900;
  event = buildCalendarEvents(data, {}, now).events.find(e => e.key === event.key);
  assert.equal(event.settled, true); assert.match(event.title, /Pagado/);
  assert.equal(googleEvent(event, { id: 'c' }, env.AFP_APP_ORIGIN).reminders.overrides.length, 0);
  assert.equal(buildCalendarEvents(data, { types: [] }, now).events.length, 0);
});

test('calendar: cuentas cobradas, canceladas y con pago parcial respetan el saldo real', () => {
  const data = empty();
  data.receivables.push({ id: 'r', originalAmount: 1000, originDate: '2026-10-01', expectedMonthlyPayment: 300, expectedChargeDays: [15, 30], concept: 'Reembolso', incomes: [{ date: '2026-10-10', amount: 300 }], status: 'ACTIVE' });
  data.payables.push({ id: 'p', originalAmount: 500, expectedDate: '2026-10-25', concept: 'Deuda', dailyExpenses: [{ amount: 200 }], status: 'ACTIVE' });
  let events = buildCalendarEvents(data, {}, now).events;
  assert.equal(events.find(e => e.key === 'payable:p').amount, 300);
  assert.ok(events.filter(e => e.key.startsWith('receivable:r:2026-10:')).every(e => e.settled));
  assert.ok(events.filter(e => e.key.startsWith('receivable:r:2026-11:')).every(e => !e.settled));
  data.payables[0].status = 'CANCELLED'; data.receivables[0].incomes.push({ date: '2026-10-20', amount: 700 });
  events = buildCalendarEvents(data, {}, now).events;
  assert.ok(!events.some(e => e.key === 'payable:p' || e.date > '2026-10-21'));
});

test('calendar: el color representa el estado en todos los tipos y los parciales conservan su aviso', () => {
  const types = ['cardPayments', 'subscriptions', 'receivables', 'payables'];
  for (const type of types) {
    const base = { key: `${type}:test`, type, date: '2026-10-25', title: 'Evento', detail: '', route: '/tarjetas' };
    const completed = googleEvent({ ...base, settled: true, partial: true }, { id: 'c' }, env.AFP_APP_ORIGIN);
    assert.equal(completed.colorId, '10', `${type} completado debe ser verde, incluso si antes fue parcial`);
    assert.equal(completed.reminders.overrides.length, 0);
    assert.equal(googleEvent({ ...base, settled: false }, { id: 'c' }, env.AFP_APP_ORIGIN).colorId, '9');
    const partial = googleEvent({ ...base, settled: false, partial: true }, { id: 'c' }, env.AFP_APP_ORIGIN);
    assert.equal(partial.colorId, '6'); assert.equal(partial.reminders.overrides.length, 1);
  }
  assert.equal(googleEvent({ type: 'cuts', informational: true, date: '2026-10-25', title: 'Corte', detail: '', route: '/tarjetas' }, { id: 'c' }, env.AFP_APP_ORIGIN).colorId, '8');
});

test('calendar: abonos de cuentas usan naranja y texto parcial; al liquidar pasan a verde', () => {
  const data = empty();
  const receivable = { id: 'r', originalAmount: 1000, originDate: '2026-10-01', expectedMonthlyPayment: 300, expectedChargeDays: [15, 30], concept: 'Reembolso', incomes: [{ date: '2026-10-10', amount: 100 }], status: 'ACTIVE' };
  const payable = { id: 'p', originalAmount: 500, expectedDate: '2026-10-25', concept: 'Deuda', dailyExpenses: [{ amount: 200 }], status: 'ACTIVE' };
  data.receivables.push(receivable); data.payables.push(payable);
  const colors = () => buildCalendarEvents(data, {}, now).events.map(event => googleEvent(event, { id: 'c' }, env.AFP_APP_ORIGIN));
  let events = colors();
  assert.equal(events.find(e => e.summary.startsWith('Cobro parcial')).colorId, '6');
  assert.equal(events.find(e => e.summary.startsWith('Pago parcial')).colorId, '6');
  assert.equal(events.find(e => e.summary.startsWith('Cobrar') && e.start.date.startsWith('2026-11')).colorId, '9');
  receivable.incomes.push({ date: '2026-10-20', amount: 200 }); payable.dailyExpenses.push({ amount: 300 });
  events = colors();
  assert.ok(events.filter(e => e.start.date.startsWith('2026-10')).every(e => e.colorId === '10' && e.reminders.overrides.length === 0));
});

test('calendar: cuotas y denegación no revelan respuestas de Google; reintento respeta Retry-After', async () => {
  const google = sourceLoader({}, { ...globals, fetch: async () => new Response(JSON.stringify({ error: { errors: [{ reason: 'rateLimitExceeded' }], message: 'private-provider-body' } }), { status: 403, headers: { 'retry-after': '300' } }) })('src/lib/calendar/google.js');
  await assert.rejects(google.googleRequest('https://www.googleapis.com'), e => e.code === 'RATE_LIMIT' && e.retryAfter === 300000 && !e.message.includes('private'));
  const revoked = sourceLoader({}, { ...globals, fetch: async () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }) })('src/lib/calendar/google.js');
  await assert.rejects(revoked.googleRequest('https://oauth2.googleapis.com/token'), e => e.code === 'RECONNECT');
});

test('calendar: cron exige su secreto incluso cuando falta configuración y no expone usuarios', async () => {
  let calls = 0;
  const db = { calendarOAuthState: { deleteMany: async () => calls++ }, googleCalendarConnection: { fields: { syncedRevision: 'syncedRevision' }, findMany: async () => [{ userId: 'private-user' }] } };
  const mocks = { '@/lib/prisma': { prisma: db }, '@/lib/apiAuth': { apiResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } }, '@/lib/calendar/worker': { runCalendarSync: async () => ({ status: 'SYNCED' }) } };
  const route = sourceLoader(mocks, globals)('src/app/api/cron/calendar-sync/route.js');
  for (const authorization of ['', 'Bearer wrong', 'cron-test-secret']) assert.equal((await route.GET({ headers: new Headers({ authorization }) })).status, 401);
  assert.equal(calls, 0);
  const response = await route.GET({ headers: new Headers({ authorization: `Bearer ${env.CRON_SECRET}` }) });
  assert.deepEqual(plain(response.body), { processed: 1, results: ['SYNCED'] });
  const missing = sourceLoader(mocks, { ...globals, process: { env: {} } })('src/app/api/cron/calendar-sync/route.js');
  assert.equal((await missing.GET({ headers: new Headers({ authorization: 'Bearer undefined' }) })).status, 401);
});

test('calendar: callback usa origen fijo, borra cookie y no refleja mensajes del proveedor', async () => {
  const cookies = [];
  const mocks = { 'next/server': { NextResponse: { redirect: (url, status) => ({ url, status, headers: new Headers(), cookies: { set: (...args) => cookies.push(args) } }) } },
    '@/lib/calendar/service': { completeCalendarOAuth: async () => { throw new Error('provider-secret'); } }, '@/lib/calendar/schedule': { scheduleCalendarSync() { throw new Error('must not schedule'); } } };
  const route = sourceLoader(mocks, globals)('src/app/api/calendar/google/callback/route.js');
  const response = await route.GET({ url: 'https://evil.example/callback?state=wrong&code=x', cookies: { get: () => ({ value: 'x' }) } });
  assert.equal(response.status, 303); assert.equal(new URL(response.url).origin, env.AFP_APP_ORIGIN);
  assert.ok(!response.url.includes('provider-secret')); assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(cookies[0][2].maxAge, 0); assert.equal(cookies[0][2].httpOnly, true);
});

test('calendar: suscripciones omiten saltos, respetan frecuencia y desactivación, y retiran avisos al confirmar', () => {
  const data = empty();
  const subscription = { id: 's', name: 'Servicio', amount: 99, chargeDay: 31, frequencyMonths: 2, startYear: 2026, startMonth: 10, isActive: true, charges: [{ month: '2026-10', status: 'SKIPPED' }], dailyExpenses: [] };
  data.subscriptions.push(subscription);
  let events = buildCalendarEvents(data, {}, now).events;
  assert.ok(!events.some(e => e.key.includes('2026-10') || e.key.includes('2026-11')));
  assert.ok(events.some(e => e.key === 'subscription:s:2026-12' && !e.settled));
  subscription.charges = [{ month: '2026-10', status: 'CONFIRMED', expenseId: 'expense' }];
  subscription.dailyExpenses.push({ id: 'expense', date: '2026-10-31', amount: 105 });
  subscription.isActive = false; subscription.deactivatedAt = '2026-11-01';
  events = buildCalendarEvents(data, {}, now).events;
  assert.equal(events.length, 1); assert.equal(events[0].amount, 105); assert.equal(events[0].settled, true);
});

test('calendar: la API usa el propietario de sesión e impide preferencias y userId arbitrarios', async () => {
  const calls = [];
  const mocks = { '@/lib/apiAuth': { requireApiUser: async () => ({ id: 'owner-a' }), apiAccessErrorResponse: () => null,
    apiResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } },
    '@/lib/calendar/service': { calendarStatus: async id => { calls.push(id); return { status: 'CONNECTED' }; }, updateCalendarPreferences: async id => calls.push(id) },
    '@/lib/calendar/schedule': { scheduleCalendarSync: id => calls.push(id) } };
  const api = sourceLoader(mocks, globals)('src/app/api/calendar/google/route.js');
  const request = body => ({ url: 'https://afp.example.test/api/calendar/google?userId=owner-b', json: async () => body });
  await api.GET(request({}));
  assert.equal((await api.PATCH(request({ types: ['cuts'], showAmounts: false, reminders: true, userId: 'owner-b' }))).status, 400);
  assert.equal((await api.PATCH(request({ types: ['cuts'], showAmounts: false, reminders: true }))).status, 200);
  assert.ok(calls.length === 4 && calls.every(id => id === 'owner-a'));
});
