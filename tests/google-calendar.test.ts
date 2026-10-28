import { plain,present,sparseCalculations,stringValue } from './helpers/financial-fixtures';

import type { CalendarDataFixture,IntegrationMocks } from './helpers/integration-fixtures';

import { record as objectValue } from './helpers/dynamic-values';

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { integrationLoader as sourceLoader } from './helpers/integration-fixtures';
const env = { GOOGLE_CALENDAR_CLIENT_ID: 'test-client', GOOGLE_CALENDAR_CLIENT_SECRET: 'test-secret', CALENDAR_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'), AFP_APP_ORIGIN: 'https://afp.example.test', CRON_SECRET: 'cron-test-secret' };
const globals = { process: { env }, URLSearchParams, AbortSignal };
const load = sourceLoader({}, globals);
const config = load('src/lib/calendar/config.ts');
const { buildCalendarEvents, googleEvent, mexicoDay } = sparseCalculations(load('src/lib/calendar/events.ts'));
const palette = sparseCalculations(load('src/lib/calendar/palette.ts')).CALENDAR_EVENT_PALETTE;
const empty = (): CalendarDataFixture => ({ cards: [], cycles: [], subscriptions: [], receivables: [], payables: [] });
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
  assert.equal(present(event).date, '2028-02-29');
  const payment = buildCalendarEvents(data, {}, new Date('2028-02-01T18:00:00Z')).events.find(e => e.key === 'card:card:2028-02:payment');
  assert.equal(present(payment).date, '2028-03-05');
  assert.equal(googleEvent(present(event), { id: 'c' }, env.AFP_APP_ORIGIN).end.date, '2028-03-01');
  assert.ok(!buildCalendarEvents(data, {}, now).events.some(e => e.key.includes('2026-09')));
});

test('calendar: corrección de fechas mantiene clave, saldo parcial y liquidación sin recordatorio', () => {
  const data = empty(); data.cards.push({ id: 'card', name: 'Tarjeta', usualCutDay: 25, usualDueDay: 10 });
  let event = buildCalendarEvents(data, {}, now).events.find(e => e.key === 'card:card:2026-10:payment');
  assert.equal(present(event).date, '2026-11-10'); assert.equal(present(event).amount, null);
  const cycle: CalendarDataFixture['cycles'][number] = { cardId: 'card', year: 2026, month: 10, cutDate: '2026-10-24', dueDate: '2026-11-09', statementAmount: 1000, paidAmount: 300, postCutCreditAmount: 100 };
  data.cycles.push(cycle);
  event = buildCalendarEvents(data, {}, now).events.find(e => e.key === present(event).key);
  assert.equal(present(event).date, '2026-11-09'); assert.equal(present(event).amount, 600); assert.match(present(event).title, /Pago parcial/);
  const hidden = googleEvent(present(event), { id: 'c' }, env.AFP_APP_ORIGIN);
  assert.ok(!hidden.description.includes('600')); assert.equal(hidden.reminders.overrides.length, 1);
  assert.match(googleEvent(present(event), { id: 'c', preferences: { showAmounts: true } }, env.AFP_APP_ORIGIN).description, /600/);
  cycle.paidAmount = 900;
  event = buildCalendarEvents(data, {}, now).events.find(e => e.key === present(event).key);
  assert.equal(present(event).settled, true); assert.match(present(event).title, /Pagado/);
  assert.equal(googleEvent(present(event), { id: 'c' }, env.AFP_APP_ORIGIN).reminders.overrides.length, 0);
  assert.equal(buildCalendarEvents(data, { types: [] }, now).events.length, 0);
});

test('calendar: corte verde requiere fechas confirmadas y monto, conserva pago independiente y acepta cero', () => {
  const data = empty();
  data.cards.push({ id: 'card', name: 'Tarjeta', usualCutDay: 25, usualDueDay: 10 });
  const cutKey = 'card:card:2026-10:cut', paymentKey = 'card:card:2026-10:payment';
  const eventAt = (key: string) => buildCalendarEvents(data, {}, now).events.find(event => event.key === key);
  const asGoogle = (event: import("./../src/lib/calendar/types").CalendarEvent | undefined) => googleEvent(present(event), { id: 'c' }, env.AFP_APP_ORIGIN);
  const projected = eventAt(cutKey);
  assert.equal(present(projected).reviewed, false);
  assert.equal(asGoogle(projected).eventLabelId, palette.informational.id);
  const cycle: CalendarDataFixture['cycles'][number] = { cardId: 'card', year: 2026, month: 10, cutDate: '2026-10-25', dueDate: '2026-11-10', statementAmount: 1000 };
  data.cycles.push(cycle);
  assert.equal(present(eventAt(cutKey)).reviewed, false, 'el monto y una fecha generada no bastan');
  cycle.datesConfirmedAt = '2026-10-21T17:00:00Z';
  const reviewed = eventAt(cutKey), pending = eventAt(paymentKey);
  assert.equal(present(reviewed).key, present(projected).key);
  assert.equal(present(reviewed).title, 'Corte revisado · Tarjeta');
  assert.equal(present(reviewed).settled, false); assert.equal(present(reviewed).informational, true);
  assert.equal(asGoogle(reviewed).eventLabelId, palette.completed.id);
  assert.equal(asGoogle(reviewed).reminders.overrides.length, 0);
  assert.equal(present(pending).settled, false); assert.equal(present(pending).amount, 1000);
  assert.equal(asGoogle(pending).eventLabelId, palette.pending.id);
  assert.equal(asGoogle(pending).reminders.overrides.length, 1);
  for (const statementAmount of [null, undefined] as const) {
    cycle.statementAmount = statementAmount;
    assert.equal(present(eventAt(cutKey)).reviewed, false, 'confirmar fechas sin monto conserva gris');
    assert.equal(asGoogle(eventAt(cutKey)).eventLabelId, palette.informational.id);
  }
  cycle.statementAmount = 0;
  assert.equal(present(eventAt(cutKey)).reviewed, true, 'un estado de cuenta en cero sí está capturado');
  cycle.statementAmount = 1000; cycle.paidAmount = 1000; cycle.datesConfirmedAt = null;
  assert.equal(present(eventAt(paymentKey)).settled, true);
  assert.equal(asGoogle(eventAt(cutKey)).eventLabelId, palette.informational.id, 'pagar no confirma las fechas');
  cycle.datesConfirmedAt = '2026-10-21T17:00:00Z'; cycle.paidAmount = 100;
  assert.equal(asGoogle(eventAt(paymentKey)).eventLabelId, palette.partial.id);
  const later = buildCalendarEvents(data, {}, new Date('2026-11-11T18:00:00Z')).events;
  cycle.paidAmount = 0;
  const overdue = buildCalendarEvents(data, {}, new Date('2026-11-11T18:00:00Z')).events;
  assert.equal(asGoogle(later.find(event => event.key === cutKey)).eventLabelId, palette.completed.id);
  assert.equal(asGoogle(overdue.find(event => event.key === paymentKey)).eventLabelId, palette.overdue.id);
});

test('calendar: cuentas cobradas, canceladas y con pago parcial respetan el saldo real', () => {
  const data = empty();
  data.receivables.push({ id: 'r', originalAmount: 1000, originDate: '2026-10-01', expectedMonthlyPayment: 300, expectedChargeDays: [15, 30], concept: 'Reembolso', incomes: [{ date: '2026-10-15', amount: 300 }], status: 'ACTIVE' });
  data.payables.push({ id: 'p', originalAmount: 500, expectedDate: '2026-10-25', concept: 'Deuda', dailyExpenses: [{ amount: 200 }], status: 'ACTIVE' });
  let events = buildCalendarEvents(data, {}, now).events;
  assert.equal(present(events.find(e => e.key === 'payable:p')).amount, 300);
  assert.equal(present(events.find(e => e.key === 'receivable:r:2026-10:0')).settled, true);
  assert.equal(present(events.find(e => e.key === 'receivable:r:2026-10:1')).settled, false);
  assert.ok(events.filter(e => e.key.startsWith('receivable:r:2026-11:')).every(e => !e.settled));
  present(data.payables[0]).status = 'CANCELLED'; present(present(data.receivables[0]).incomes).push({ date: '2026-10-20', amount: 700 });
  events = buildCalendarEvents(data, {}, now).events;
  assert.ok(!events.some(e => e.key === 'payable:p' || e.date > '2026-10-21'));
});

test('calendar: el color representa el estado en todos los tipos y los parciales conservan su aviso', () => {
  const types = ['cardPayments', 'subscriptions', 'receivables', 'payables'] as const;
  for (const type of types) {
    const base = { key: `${type}:test`, type, date: '2026-10-25', title: 'Evento', detail: '', route: '/tarjetas' };
    const completed = googleEvent({ ...base, settled: true, partial: true }, { id: 'c' }, env.AFP_APP_ORIGIN);
    assert.equal(completed.eventLabelId, palette.completed.id, `${type} completado debe ser verde, incluso si antes fue parcial`);
    assert.equal(completed.reminders.overrides.length, 0);
    assert.equal(googleEvent({ ...base, settled: false }, { id: 'c' }, env.AFP_APP_ORIGIN).eventLabelId,
      type === 'subscriptions' ? palette.subscription.id : palette.pending.id);
    const partial = googleEvent({ ...base, settled: false, partial: true }, { id: 'c' }, env.AFP_APP_ORIGIN);
    assert.equal(partial.eventLabelId, palette.partial.id); assert.equal(partial.reminders.overrides.length, 1);
  }
  assert.equal(googleEvent({ type: 'cuts', informational: true, date: '2026-10-25', title: 'Corte', detail: '', route: '/tarjetas' }, { id: 'c' }, env.AFP_APP_ORIGIN).eventLabelId, palette.informational.id);
});

test('calendar: abonos de cuentas usan naranja y texto parcial; al liquidar pasan a verde', () => {
  const data = empty();
  const receivable: CalendarDataFixture['receivables'][number] = { id: 'r', originalAmount: 1000, originDate: '2026-10-01', expectedMonthlyPayment: 300, expectedChargeDays: [15, 30], concept: 'Reembolso', incomes: [{ date: '2026-10-15', amount: 100 }], status: 'ACTIVE' };
  const payable: CalendarDataFixture['payables'][number] = { id: 'p', originalAmount: 500, expectedDate: '2026-10-25', concept: 'Deuda', dailyExpenses: [{ amount: 200 }], status: 'ACTIVE' };
  data.receivables.push(receivable); data.payables.push(payable);
  const colors = () => buildCalendarEvents(data, {}, now).events.map(event => googleEvent(event, { id: 'c' }, env.AFP_APP_ORIGIN));
  let events = colors();
  assert.equal(present(events.find(e => e.summary.startsWith('Cobro parcial'))).eventLabelId, palette.partial.id);
  assert.equal(present(events.find(e => e.summary.startsWith('Pago parcial'))).eventLabelId, palette.partial.id);
  assert.equal(present(events.find(e => e.summary.startsWith('Cobrar') && e.start.date.startsWith('2026-11'))).eventLabelId, palette.pending.id);
  present(receivable.incomes).push({ date: '2026-10-20', amount: 200 }); present(payable.dailyExpenses).push({ amount: 300 });
  events = colors();
  assert.equal(present(events.find(e => e.start.date === '2026-10-15')).eventLabelId, palette.completed.id);
  assert.equal(present(events.find(e => e.start.date === '2026-10-30')).eventLabelId, palette.pending.id);
  assert.equal(present(events.find(e => e.summary.startsWith('Pagado'))).reminders.overrides.length, 0);
});

test('calendar: un cobro quincenal no marca la siguiente fecha como cobrada, ni al llegar ese día', () => {
  const data = empty();
  const account: CalendarDataFixture['receivables'][number] = { id: 'r', originalAmount: 10000, originDate: '2026-09-01', expectedMonthlyPayment: 1730.89,
    expectedChargeDays: [15, 30], person: { name: 'Persona' }, concept: 'Préstamo', status: 'ACTIVE',
    incomes: [{ date: '2026-09-30', amount: 1750 }, { date: '2026-10-15', amount: 1750 }] };
  data.receivables.push(account);
  const eventAt = (day: string, date: string) => buildCalendarEvents(data, {}, new Date(`${day}T18:00:00Z`)).events.find(e => e.date === date);
  const paid = eventAt('2026-10-26', '2026-10-15');
  assert.equal(present(paid).title, 'Cobrado · Persona'); assert.equal(present(paid).amount, 0);
  assert.equal(googleEvent(present(paid), { id: 'c' }, env.AFP_APP_ORIGIN).eventLabelId, palette.completed.id);
  const pending = eventAt('2026-10-26', '2026-10-30');
  for (const day of ['2026-10-26', '2026-10-30', '2026-11-01'] as const) {
    const event = eventAt(day, '2026-10-30');
    assert.equal(present(event).title, 'Cobrar · Persona'); assert.equal(present(event).amount, 1730.89);
    assert.equal(present(event).settled, false); assert.equal(present(event).partial, false);
    assert.equal(present(event).key, present(pending).key);
    const google = googleEvent(present(event), { id: 'c' }, env.AFP_APP_ORIGIN);
    assert.equal(google.eventLabelId, day > '2026-10-30' ? palette.overdue.id : palette.pending.id);
    assert.equal(google.reminders.overrides.length, 1);
  }
  present(account.incomes).push({ date: '2026-10-30', amount: 500 });
  assert.equal(present(eventAt('2026-10-26', '2026-10-30')).settled, false, 'un ingreso futuro no confirma el cobro');
  const partial = eventAt('2026-10-30', '2026-10-30');
  assert.equal(present(partial).title, 'Cobro parcial · Persona'); assert.equal(present(partial).amount, 1230.89);
  assert.equal(googleEvent(present(partial), { id: 'c' }, env.AFP_APP_ORIGIN).eventLabelId, palette.partial.id);
  present(account.incomes).push({ date: '2026-11-01', amount: 1230.89 });
  assert.equal(present(eventAt('2026-10-30', '2026-10-30')).settled, false);
  const completed = eventAt('2026-11-01', '2026-10-30');
  assert.equal(present(completed).title, 'Cobrado · Persona'); assert.equal(present(completed).key, present(pending).key);
  assert.equal(googleEvent(present(completed), { id: 'c' }, env.AFP_APP_ORIGIN).reminders.overrides.length, 0);
  assert.equal(present(eventAt('2026-11-15', '2026-11-15')).title, 'Cobrar · Persona');
  present(account.incomes).pop();
  assert.equal(present(eventAt('2026-11-01', '2026-10-30')).title, 'Cobro parcial · Persona', 'borrar el ingreso restaura el pendiente');
});

test('calendar: abonos se suman a centavos y los días ajustados a fin de mes no duplican cobros', () => {
  const data = empty();
  data.receivables.push({ id: 'r', originalAmount: 1000, originDate: '2028-02-01', expectedMonthlyPayment: 0.30,
    expectedChargeDays: [29, 30, 31], concept: 'Reembolso', status: 'ACTIVE',
    incomes: [{ date: '2028-02-29', amount: 0.10 }, { date: '2028-03-01', amount: 0.20 }] });
  const events = buildCalendarEvents(data, {}, new Date('2028-03-02T18:00:00Z')).events;
  const february = events.filter(e => e.date === '2028-02-29');
  assert.equal(february.length, 1); assert.equal(present(february[0]).settled, true);
  assert.equal(present(february[0]).key, 'receivable:r:2028-02:0');
  assert.ok(events.filter(e => e.date.startsWith('2028-03')).every(e => !e.settled && !e.partial));
});

test('calendar: ingresos futuros no liquidan ni retiran los cobros previstos de una cuenta activa', () => {
  const data = empty();
  data.receivables.push({ id: 'r', originalAmount: 300, originDate: '2026-10-01', expectedMonthlyPayment: 300,
    expectedChargeDays: [30], concept: 'Reembolso', status: 'PAID_OFF', incomes: [{ date: '2026-10-30', amount: 300 }] });
  const before = buildCalendarEvents(data, {}, now).events.find(e => e.date === '2026-10-30');
  assert.equal(present(before).title, 'Cobrar · Reembolso'); assert.equal(present(before).amount, 300);
  const after = buildCalendarEvents(data, {}, new Date('2026-10-30T18:00:00Z')).events;
  assert.equal(present(after.find(e => e.date === '2026-10-30')).title, 'Cobrado · Reembolso');
  assert.ok(!after.some(e => e.date > '2026-10-30'));
});

test('calendar: cuotas y denegación no revelan respuestas de Google; reintento respeta Retry-After', async () => {
  const google = sourceLoader({}, { ...globals, fetch: async () => new Response(JSON.stringify({ error: { errors: [{ reason: 'rateLimitExceeded' }], message: 'private-provider-body' } }), { status: 403, headers: { 'retry-after': '300' } }) })('src/lib/calendar/google.ts');
  await assert.rejects(google.googleRequest('https://www.googleapis.com'), e => objectValue(e).code === 'RATE_LIMIT' && objectValue(e).retryAfter === 300000 && !stringValue(objectValue(e).message).includes('private'));
  const revoked = sourceLoader({}, { ...globals, fetch: async () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }) })('src/lib/calendar/google.ts');
  await assert.rejects(revoked.googleRequest('https://oauth2.googleapis.com/token'), e => objectValue(e).code === 'RECONNECT');
});

test('calendar: cron exige su secreto incluso cuando falta configuración y no expone usuarios', async () => {
  let calls = 0;
  const db = { calendarOAuthState: { deleteMany: async () => calls++ }, googleCalendarConnection: { fields: { syncedRevision: 'syncedRevision' }, findMany: async () => [{ userId: 'private-user' }] } };
  const mocks: IntegrationMocks = { '@/lib/prisma': { prisma: db }, '@/lib/apiAuth': { apiResponse: { json: (body: unknown, options = {}) => ({ body, status: options.status || 200 }) } }, '@/lib/calendar/worker': { runCalendarSync: async () => ({ status: 'SYNCED' }) } };
  const route = sourceLoader(mocks, globals)('src/app/api/cron/calendar-sync/route.ts');
  for (const authorization of ['', 'Bearer wrong', 'cron-test-secret'] as const) assert.equal((await route.GET({ headers: new Headers({ authorization }) })).status, 401);
  assert.equal(calls, 0);
  const response = await route.GET({ headers: new Headers({ authorization: `Bearer ${env.CRON_SECRET}` }) });
  assert.deepEqual(plain(response.body), { processed: 1, results: ['SYNCED'] });
  const missing = sourceLoader(mocks, { ...globals, process: { env: {} } })('src/app/api/cron/calendar-sync/route.ts');
  assert.equal((await missing.GET({ headers: new Headers({ authorization: 'Bearer undefined' }) })).status, 401);
});

test('calendar: callback usa origen fijo, borra cookie y no refleja mensajes del proveedor', async () => {
  const cookies: [string, string, { maxAge: number; httpOnly: boolean }][] = [];
  const mocks: IntegrationMocks = { 'next/server': { NextResponse: { redirect: (url, status) => ({ url, status, headers: new Headers(), cookies: { set: (...args: [string, string, { maxAge: number; httpOnly: boolean }]) => cookies.push(args) } }) } },
    '@/lib/calendar/service': { completeCalendarOAuth: async () => { throw new Error('provider-secret'); } }, '@/lib/calendar/schedule': { scheduleCalendarSync() { throw new Error('must not schedule'); } } };
  const route = sourceLoader(mocks, globals)('src/app/api/calendar/google/callback/route.ts');
  const response = await route.GET({ url: 'https://evil.example/callback?state=wrong&code=x', cookies: { get: () => ({ value: 'x' }) } });
  assert.equal(response.status, 303); assert.equal(new URL(present(response.url)).origin, env.AFP_APP_ORIGIN);
  assert.ok(!present(response.url).includes('provider-secret')); assert.equal(present(response.headers).get('referrer-policy'), 'no-referrer');
  assert.equal(present(cookies[0])[2].maxAge, 0); assert.equal(present(cookies[0])[2].httpOnly, true);
});

test('calendar: suscripciones omiten saltos, respetan frecuencia y desactivación, y retiran avisos al confirmar', () => {
  const data = empty();
  const subscription: CalendarDataFixture['subscriptions'][number] = { id: 's', name: 'Servicio', amount: 99, chargeDay: 31, frequencyMonths: 2, startYear: 2026, startMonth: 10, isActive: true, charges: [{ month: '2026-10', status: 'SKIPPED' }], dailyExpenses: [] };
  data.subscriptions.push(subscription);
  let events = buildCalendarEvents(data, {}, now).events;
  assert.ok(!events.some(e => e.key.includes('2026-10') || e.key.includes('2026-11')));
  assert.ok(events.some(e => e.key === 'subscription:s:2026-12' && !e.settled));
  subscription.charges = [{ month: '2026-10', status: 'CONFIRMED', expenseId: 'expense' }];
  present(subscription.dailyExpenses).push({ id: 'expense', date: '2026-10-31', amount: 105 });
  subscription.isActive = false; subscription.deactivatedAt = '2026-11-01';
  events = buildCalendarEvents(data, {}, now).events;
  assert.equal(events.length, 1); assert.equal(present(events[0]).amount, 105); assert.equal(present(events[0]).settled, true);
});

test('calendar: la API usa el propietario de sesión e impide preferencias y userId arbitrarios', async () => {
  const calls: string[] = [];
  const mocks: IntegrationMocks = { '@/lib/apiAuth': { requireApiUser: async () => ({ id: 'owner-a' }), apiAccessErrorResponse: () => null,
    apiResponse: { json: (body: unknown, options = {}) => ({ body, status: options.status || 200 }) } },
    '@/lib/calendar/service': { calendarStatus: async (id: string) => { calls.push(id); return { status: 'CONNECTED' }; }, updateCalendarPreferences: async (id: string) => calls.push(id) },
    '@/lib/calendar/schedule': { scheduleCalendarSync: id => calls.push(id) } };
  const api = sourceLoader(mocks, globals)('src/app/api/calendar/google/route.ts');
  const request = (body: unknown) => ({ url: 'https://afp.example.test/api/calendar/google?userId=owner-b', json: async () => body });
  await api.GET(request({}));
  assert.equal((await api.PATCH(request({ types: ['cuts'], showAmounts: false, reminders: true, userId: 'owner-b' }))).status, 400);
  assert.equal((await api.PATCH(request({ types: ['cuts'], showAmounts: false, reminders: true }))).status, 200);
  assert.ok(calls.length === 4 && calls.every(id => id === 'owner-a'));
});
