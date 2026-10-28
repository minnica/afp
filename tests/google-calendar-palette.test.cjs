const assert = require('node:assert/strict');
const { test } = require('node:test');
const { sourceLoader } = require('./helpers/load-source.ts');
const load = sourceLoader();
const { CALENDAR_EVENT_PALETTE: palette, calendarEventLabel, calendarLabelProperties, ensureCalendarPalette } = load('src/lib/calendar/palette.ts');
const plain = value => JSON.parse(JSON.stringify(value));
const custom = { id: '11111111-2222-4333-8444-555555555555', name: 'Personal', backgroundColor: '#663399' };

test('calendar palette: fechas de México separan vencidos, cobros de hoy y suscripciones futuras sin cambiar sus textos', () => {
  const { buildCalendarEvents } = load('src/lib/calendar/events.ts');
  const data = { cards:[], cycles:[], payables:[], receivables:[{ id:'r', originalAmount:1000, originDate:'2026-10-01',
    expectedMonthlyPayment:100, expectedChargeDays:[25,26,27], concept:'Reembolso', incomes:[], status:'ACTIVE' }],
    subscriptions:[25,28].map(chargeDay => ({ id:`s-${chargeDay}`, name:'Servicio', amount:99, chargeDay,
      frequencyMonths:1, startYear:2026, startMonth:10, isActive:true, dailyExpenses:[], charges:[] })) };
  const agenda = buildCalendarEvents(data, {}, new Date('2026-10-27T02:00:00Z'));
  assert.equal(agenda.today, '2026-10-26');
  const eventAt = (type,date) => agenda.events.find(event => event.type===type && event.date===date);
  const old = eventAt('receivables','2026-10-25'), current = eventAt('receivables','2026-10-26');
  assert.equal(calendarEventLabel(old).id, palette.overdue.id);
  assert.equal(calendarEventLabel(current).id, palette.pending.id);
  assert.equal(calendarEventLabel(eventAt('receivables','2026-10-27')).id, palette.pending.id);
  assert.equal(calendarEventLabel(eventAt('subscriptions','2026-10-25')).id, palette.overdue.id);
  assert.equal(calendarEventLabel(eventAt('subscriptions','2026-10-28')).id, palette.subscription.id);
  assert.equal(old.title,current.title); assert.equal(old.settled,false); assert.equal(current.settled,false);
});

test('calendar palette: seis roles con prioridad explícita, sin convertir cortes o parciales en vencidos', () => {
  assert.equal(calendarEventLabel({ settled:true, overdue:true, partial:true }).id, palette.completed.id);
  assert.equal(calendarEventLabel({ informational:true, overdue:true }).id, palette.informational.id);
  assert.equal(calendarEventLabel({ informational:true, reviewed:true, overdue:true }).id, palette.completed.id);
  assert.equal(calendarEventLabel({ type:'cardPayments', reviewed:true }).id, palette.pending.id, 'la revisión no liquida el pago');
  assert.equal(calendarEventLabel({ partial:true, overdue:true }).id, palette.partial.id);
  assert.equal(calendarEventLabel({ type:'subscriptions', overdue:true }).id, palette.overdue.id);
  assert.equal(calendarEventLabel({ type:'subscriptions' }).id, palette.subscription.id);
  assert.equal(calendarEventLabel({ type:'receivables' }).id, palette.pending.id);
  assert.equal(new Set(Object.values(palette).map(label => label.id)).size, 6);
  const rgb = key => palette[key].backgroundColor.match(/[a-f0-9]{2}/gi).map(value => parseInt(value,16));
  assert.equal(new Set(rgb('informational')).size, 1, 'el gris es neutro, sin el matiz azul anterior');
  const [red, green, blue] = rgb('pending');
  assert.ok(blue > 0 && blue >= green * 1.5 && red <= blue * .25, 'el azul tiene una separación cromática clara frente al gris');
});

test('calendar palette: conserva etiquetas personales y propiedades, actualiza solo sus seis colores y es idempotente', () => {
  const current = { extra: 'preserved', eventLabels: [custom, { ...palette.pending, backgroundColor: '#6e72c3' }] };
  const result = calendarLabelProperties(current);
  assert.equal(current.eventLabels.length, 2, 'no modifica el objeto recibido');
  assert.equal(result.extra, 'preserved'); assert.deepEqual(plain(result.eventLabels[0]), custom);
  assert.equal(result.eventLabels.length, 7);
  assert.equal(result.eventLabels.find(label => label.id === palette.pending.id).backgroundColor, palette.pending.backgroundColor);
  assert.equal(calendarLabelProperties(result), null, 'una paleta idéntica no necesita escrituras');
  const lowerCase = { eventLabels: Object.values(palette).map(label => ({ ...label, backgroundColor: label.backgroundColor.toLowerCase() })) };
  assert.equal(calendarLabelProperties(lowerCase), null);
});

test('calendar palette: respeta el máximo de 200 etiquetas sin borrar otras para hacer espacio', () => {
  const labels = Array.from({ length: 197 }, (_, i) => ({ ...custom, id: `custom-${i}` }));
  assert.throws(() => calendarLabelProperties({ eventLabels: labels }), error => error.code === 'LABEL_LIMIT');
  assert.equal(labels.length, 197);
  assert.equal(calendarLabelProperties({ eventLabels: labels.slice(0, 194) }).eventLabels.length, 200);
});

test('calendar palette: una edición concurrente en Google se recupera leyendo de nuevo y usando If-Match', async () => {
  const calls = []; let revision = 1;
  const client = { request: async (path, method = 'GET', body, headers) => {
    calls.push({ path, method, body, headers });
    if (method === 'GET') return { etag: `"${revision}"`, labelProperties: { eventLabels: revision === 1 ? [] : [custom] } };
    assert.equal(path, 'calendars/afp%40group.calendar.google.com');
    if (revision === 1) { revision++; throw Object.assign(new Error('changed'), { status: 412 }); }
    assert.equal(headers['If-Match'], '"2"');
    assert.deepEqual(Object.keys(body), ['labelProperties']);
    assert.deepEqual(plain(body.labelProperties.eventLabels[0]), custom);
    return body;
  } };
  assert.equal(await ensureCalendarPalette(client, 'afp@group.calendar.google.com'), true);
  assert.deepEqual(calls.map(call => call.method), ['GET', 'PATCH', 'GET', 'PATCH']);
});

test('calendar palette: no reescribe una paleta correcta ni escribe sin ETag; respeta cuotas', async () => {
  assert.equal(await ensureCalendarPalette({ request: async (_path, method = 'GET') => {
    assert.equal(method, 'GET'); return { labelProperties: { eventLabels: Object.values(palette) } };
  } }, 'afp'), false);
  let calls = 0;
  await assert.rejects(ensureCalendarPalette({ request: async () => { calls++; return {}; } }, 'afp'), /GOOGLE_UNAVAILABLE/);
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(ensureCalendarPalette({ request: async (_path, method = 'GET') => {
    calls++; if (method === 'GET') return { etag: '"1"' };
    throw Object.assign(new Error('rate limit'), { status: 429 });
  } }, 'afp'), error => error.status === 429);
  assert.equal(calls, 2, 'no reintenta una cuota como si fuera una edición concurrente');
});

test('calendar palette: limita reintentos ante conflictos continuos', async () => {
  let writes = 0;
  await assert.rejects(ensureCalendarPalette({ request: async (_path, method = 'GET') => {
    if (method === 'GET') return { etag: `"${writes}"` };
    writes++; throw Object.assign(new Error('changed'), { status: 412 });
  } }, 'afp'), error => error.status === 412);
  assert.equal(writes, 3);
});

test('calendar client: envía If-Match conservando autorización y codificación JSON', async () => {
  const requests = [];
  const env = { GOOGLE_CALENDAR_CLIENT_ID: 'test', GOOGLE_CALENDAR_CLIENT_SECRET: 'test', CALENDAR_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') };
  const google = sourceLoader({}, { process: { env }, URLSearchParams, AbortSignal, fetch: async (url, options) => {
    requests.push({ url, options });
    return new Response(JSON.stringify(url.includes('oauth2') ? { access_token: 'test-access' } : {}), { status: 200 });
  } })('src/lib/calendar/google.ts');
  const client = await google.calendarClient('test-refresh');
  await client.request('calendars/afp', 'PATCH', { labelProperties: {} }, { 'If-Match': '"revision"' });
  assert.equal(requests[1].options.headers['If-Match'], '"revision"');
  assert.equal(requests[1].options.headers.Authorization, 'Bearer test-access');
  assert.equal(requests[1].options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(requests[1].options.body), { labelProperties: {} });
});
