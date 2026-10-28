const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomUUID, randomBytes } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { sourceLoader } = require('./helpers/load-source.cjs');
const fixture = require('./fixtures/captures/wallet-didi-purchase.es.v1.json');
const connectionString = process.env.AFP_TEST_DATABASE_URL;

test('Wallet DiDi real: API, observación, política de fecha, activación y gasto único', { skip: !connectionString }, async t => {
  const url = new URL(connectionString);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && /^\/afp_test\w*$/.test(url.pathname) && !url.search);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const users = await Promise.all(['owner', 'other'].map(name => db.user.create({ data: { email: `wallet-didi-${name}-${randomUUID()}@example.test` } })));
  const [user, other] = users, sessions = new Map([['owner', user], ['other', other]]);
  const mocks = {
    '@/lib/prisma': { prisma: db }, '@/lib/calendar/schedule': { scheduleCalendarSync: () => {} },
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body: JSON.parse(JSON.stringify(body)), status: options.status || 200, headers: new Headers(options.headers) }) } },
    '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async token => ({ data: { user: sessions.get(token) }, error: sessions.has(token) ? null : new Error('expired') }) } }) },
  };
  const load = sourceLoader(mocks), protocol = load('src/lib/captureProtocol.ts');
  const processing = load('src/lib/captureProcessing.ts'), configuration = load('src/lib/captureConfiguration.ts');
  const reconciliation = load('src/lib/captureReconciliation.ts'), service = load('src/lib/captureService.ts');
  const routes = { events: load('src/app/api/captures/events/route.ts'), movements: load('src/app/api/captures/movements/route.ts'), expenses: load('src/app/api/expenses/route.ts') };
  const card = await db.card.create({ data: { userId: user.id, name: 'Nombre personal de tarjeta', usualCutDay: 25, usualDueDay: 15 } });
  const sibling = await db.card.create({ data: { userId: user.id, name: 'Otra DiDi', usualCutDay: 25, usualDueDay: 15 } });
  const banamex = await db.card.create({ data: { userId: user.id, name: 'Otra marca con mismas cifras', usualCutDay: 25, usualDueDay: 15 } });
  const otherCard = await db.card.create({ data: { userId: other.id, name: 'DiDi ajena', usualCutDay: 25, usualDueDay: 15 } });
  const category = await db.category.create({ data: { userId: user.id, name: 'Compras ficticias DiDi' } });
  const secret = randomBytes(32).toString('base64url');
  const device = await db.captureDevice.create({ data: { userId: user.id, approvedAt: new Date(), secretHash: protocol.captureHash(secret), name: 'Wallet DiDi ficticio' } });
  const credential = { id: device.id, secretHash: device.secretHash }, authorization = `Capture ${device.id}.${secret}`;
  const parserKey = 'wallet.didi-purchase.es.v1';
  const mode = (value, datePolicy) => configuration.configureCapture(db, user.id, { action: 'automation', cardId: card.id, parserKey, mode: value, ...(datePolicy ? { datePolicy } : {}) });
  const event = (amount = '123.45', suffix = '0123') => protocol.validateCaptureEvent({ ...fixture.event, contractVersion: 1,
    eventId: randomUUID(), notificationKeyHash: protocol.captureHash(randomUUID()),
    fields: Object.fromEntries(Object.entries(fixture.event.fields).map(([key, value]) => [key, value.replaceAll('123.45', amount).replaceAll('0123', suffix)])) });
  const read = input => db.captureEvent.findUnique({ where: { deviceId_eventId: { deviceId: device.id, eventId: input.eventId } }, include: { movement: true } });
  const post = (input, auth = authorization) => routes.events.POST(new Request('http://localhost/api/captures/events', {
    method: 'POST', headers: { authorization: auth, 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  }));
  const send = async input => { assert.equal((await post(input)).status, 200); return (await read(input)).movement; };
  const resolve = (input, token = 'owner') => routes.movements.PATCH(new Request('http://localhost/api/captures/movements', {
    method: 'PATCH', headers: { authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  }));
  const count = () => db.dailyExpense.count({ where: { userId: user.id } });
  const readiness = async () => (await configuration.captureConfiguration(db, user.id)).rollout.find(row => row.cardId === card.id)
    .sources.find(row => row.sourcePackage === fixture.event.sourcePackage).formats.find(format => format.parserKey === parserKey);
  const correct = (movement, overrides = {}) => resolve({ id: movement.id, action: 'correct', expectedCorrection: 'null', correction: {
    cardId: movement.proposal.cardId, amount: movement.proposal.amount, date: movement.proposal.date, currency: movement.proposal.currency,
    merchant: movement.proposal.merchant, categoryId: category.id, ...overrides,
  } });
  let original, pilotId;
  try {
    for (const [userId, ownCard, sourcePackage, kind, value] of [
      [user.id, card, 'com.didiglobal.cashloan', 'DIGITAL', '0123'],
      [user.id, card, 'com.didiglobal.cashloan', 'PHYSICAL', '1010'],
      [user.id, card, fixture.event.sourcePackage, 'WALLET', '4242'],
      [user.id, sibling, 'com.didiglobal.cashloan', 'PHYSICAL', '0456'],
      [user.id, banamex, 'com.citibanamex.banamexmobile', 'DIGITAL', '0123'],
      [other.id, otherCard, 'com.didiglobal.cashloan', 'DIGITAL', '0123'],
    ]) await configuration.configureCapture(db, userId, { action: 'alias', cardId: ownCard.id, sourcePackage, kind, value, verified: true, evidence: 'Terminación ficticia de pruebas' });

    await t.test('un modo forzado sin aceptar el día del aviso queda por revisar sin gasto ni automatización anunciada', async () => {
      await db.captureAutomation.create({ data: { userId: user.id, cardId: card.id, parserKey, mode: 'AUTOMATIC' } });
      const movement = await send(event('100.01'));
      assert.equal(movement.reason, 'DATE_POLICY_REQUIRED'); assert.equal(movement.status, 'REVIEW');
      assert.equal((await service.getCaptureDevice(db, credential)).configuration.automaticExpenses, false);
      assert.equal(await count(), 0); await mode('OBSERVATION');
    });

    await t.test('recibo desconocido anterior se conserva al reenviar; interpretar explícitamente añade un análisis sin crear gasto', async () => {
      const parsers = load('src/lib/captureParsers.ts');
      const previous = sourceLoader({ ...mocks, '@/lib/captureParsers': { ...parsers, interpretCapture: () => ({ reason: 'UNKNOWN_FORMAT', proposal: {} }) } })('src/lib/captureService.ts');
      original = event(); const receipt = await previous.receiveCaptureEvent(db, credential, original), before = await read(original);
      assert.deepEqual((await post(original)).body, JSON.parse(JSON.stringify(receipt))); assert.deepEqual(await read(original), before);
      const results = await Promise.all(Array.from({ length: 4 }, () => resolve({ id: before.movementId, action: 'reinterpret' })));
      for (const result of results) assert.equal(result.status, 200);
      const after = await read(original), movement = after.movement;
      assert.equal(movement.status, 'OBSERVED'); assert.equal(movement.reason, 'OBSERVATION');
      assert.equal(movement.proposal.cardId, card.id); assert.equal(movement.proposal.alias.kind, 'DIGITAL');
      assert.equal(movement.proposal.alias.value, '0123'); assert.equal(movement.proposal.date, '2026-10-20');
      assert.equal(movement.proposal.dateSource, 'NOTIFICATION_POSTED_AT'); assert.equal(movement.proposal.operationAt, undefined);
      assert.equal(movement.analysisHistory.length, 1); assert.equal(movement.analysisHistory[0].previous.reason, 'UNKNOWN_FORMAT');
      for (const key of ['id', 'eventId', 'requestHash', 'fields', 'interpretation', 'createdAt', 'receivedAt']) assert.deepEqual(after[key], before[key]);
      assert.equal((await db.captureCardAlias.findFirst({ where: { cardId: card.id, kind: 'WALLET' } })).value, '4242');
      assert.equal(await count(), 0); assert.equal((await readiness()).canEnable, false);
      await assert.rejects(mode('AUTOMATIC', 'NOTIFICATION_POSTED_AT'), error => error.status === 409);
    });

    await t.test('revisión y cotejo permiten habilitar solo la tarjeta/formato con aceptación explícita de fecha', async () => {
      const movement = (await read(original)).movement;
      assert.equal((await correct(movement)).status, 200);
      const registered = await resolve({ id: movement.id, action: 'register' });
      assert.equal(registered.status, 200); pilotId = registered.body.movement.expenseId;
      assert.equal(await count(), 1); assert.equal((await db.dailyExpense.findUnique({ where: { id: pilotId } })).reconciliationStatus, 'PENDING');
      await assert.rejects(mode('AUTOMATIC', 'NOTIFICATION_POSTED_AT'), error => error.status === 409);
      const period = { cardId: card.id, startDate: '2026-10-20', endDate: '2026-10-20' };
      const record = (await reconciliation.captureStatement(db, user.id, period)).records.find(row => row.id === pilotId);
      await reconciliation.reconcileCaptureStatement(db, user.id, { ...period, action: 'confirm', type: record.type, recordId: record.id, fingerprint: record.fingerprint });
      assert.equal((await readiness()).canEnable, true);
      for (const policy of [undefined, 'BANK_OPERATION']) await assert.rejects(mode('AUTOMATIC', policy), error => error.status === 409);
      await mode('AUTOMATIC', 'NOTIFICATION_POSTED_AT');
      assert.equal((await service.getCaptureDevice(db, credential)).configuration.automaticExpenses, true);
      await assert.rejects(configuration.configureCapture(db, user.id, { action: 'automation', cardId: sibling.id, parserKey, mode: 'AUTOMATIC', datePolicy: 'NOTIFICATION_POSTED_AT' }), error => error.status === 409);
    });

    await t.test('ocho entregas API y una respuesta perdida guardan un recibo y un gasto por conciliar en el día México', async () => {
      const input = event('201.25'), before = await count();
      const results = await Promise.all(Array.from({ length: 8 }, () => post(input)));
      for (const result of results) { assert.equal(result.status, 200); assert.deepEqual(result.body, results[0].body); }
      assert.deepEqual((await post(input)).body, results[0].body); assert.equal(await count(), before + 1);
      const movement = (await read(input)).movement, expense = await db.dailyExpense.findUnique({ where: { id: movement.expenseId } });
      assert.equal(movement.status, 'REGISTERED'); assert.equal(expense.reconciliationStatus, 'PENDING');
      assert.equal(expense.date.toISOString(), '2026-10-20T12:00:00.000Z'); assert.equal(String(expense.amount), '201.25');
      assert.equal(expense.cardId, card.id);
    });

    await t.test('otro teléfono de la misma cuenta no duplica la compra ni fusiona sus eventos sin referencia', async () => {
      const input = event('202.25'), first = await send(input), before = await count();
      const device2 = await db.captureDevice.create({ data: { userId: user.id, approvedAt: new Date(), secretHash: protocol.captureHash(randomBytes(32).toString('base64url')), name: 'Segundo teléfono ficticio' } });
      await service.receiveCaptureEvent(db, { id: device2.id, secretHash: device2.secretHash }, input);
      const second = await db.captureEvent.findUnique({ where: { deviceId_eventId: { deviceId: device2.id, eventId: input.eventId } }, include: { movement: true } });
      assert.equal(second.movement.reason, 'POSSIBLE_DUPLICATE'); assert.notEqual(second.movementId, first.id);
      assert.equal(await count(), before);
    });

    await t.test('dos compras iguales requieren decisión explícita y conservan multiplicidad', async () => {
      const first = await send(event('301.25')), second = await send(event('301.25'));
      assert.equal(first.status, 'REGISTERED'); assert.equal(second.reason, 'POSSIBLE_DUPLICATE');
      const response = await resolve({ id: second.id, action: 'distinct' });
      assert.equal(response.status, 200); assert.notEqual(response.body.movement.expenseId, first.expenseId);
    });

    await t.test('coincidencias manuales se vinculan sin sobrescribir concepto, notas o aportaciones', async () => {
      const expense = await db.dailyExpense.create({ data: { userId: user.id, cardId: card.id, categoryId: category.id, amount: '302.25',
        date: new Date('2026-10-20T12:00:00Z'), paymentMethod: 'CARD', concept: 'Concepto personal', notes: 'Nota conservada', cashContributionAmount: '2.25' } });
      const before = await count(), movement = await send(event('302.25'));
      assert.equal(movement.reason, 'POSSIBLE_DUPLICATE'); assert.equal(await count(), before);
      assert.equal((await resolve({ id: movement.id, action: 'link', expenseId: expense.id })).status, 200);
      assert.deepEqual(await db.dailyExpense.findUnique({ where: { id: expense.id } }), expense);
    });

    await t.test('una actualización de notificación conserva revisión y no crea otra compra', async () => {
      const original = event('303.25'); await send(original);
      const updated = event('304.25'); updated.notificationKeyHash = original.notificationKeyHash;
      const before = await count(); assert.equal((await send(updated)).reason, 'NOTIFICATION_REVISION'); assert.equal(await count(), before);
    });

    await t.test('colisiones entre tipos DiDi, alias no verificados, desconocidos y token NFC bloquean el alta', async () => {
      const before = await count();
      const collision = await db.captureCardAlias.create({ data: { userId: user.id, cardId: sibling.id, sourcePackage: 'com.didiglobal.cashloan', kind: 'PHYSICAL', value: '0123' } });
      assert.equal((await send(event('401.25'))).reason, 'AMBIGUOUS_CARD'); assert.equal((await readiness()).canEnable, false);
      await db.captureCardAlias.delete({ where: { id: collision.id } });
      const unverified = await db.captureCardAlias.create({ data: { userId: user.id, cardId: card.id, sourcePackage: 'com.didiglobal.cashloan', kind: 'DIGITAL', value: '8888' } });
      assert.equal((await send(event('402.25', '8888'))).reason, 'UNVERIFIED_ALIAS');
      for (const suffix of ['9999', '4242']) assert.equal((await send(event('403.25', suffix))).reason, 'UNKNOWN_CARD');
      assert.equal(await count(), before); await db.captureCardAlias.delete({ where: { id: unverified.id } });
    });

    await t.test('misma terminación en Banamex y otro propietario no elige tarjeta; otra DiDi no hereda automatización', async () => {
      const movement = await send(event('501.25'));
      assert.equal(movement.status, 'REGISTERED'); assert.equal(movement.cardId, card.id);
      const otherDidi = await send(event('502.25', '0456'));
      assert.equal(otherDidi.status, 'OBSERVED'); assert.equal(otherDidi.cardId, sibling.id);
      assert.equal((await resolve({ id: otherDidi.id, action: 'reinterpret' }, 'other')).status, 404);
      for (const auth of ['Bearer owner', `Capture ${device.id}.${randomBytes(32).toString('base64url')}`]) assert.equal((await post(event(), auth)).status, 401);
      assert.equal((await post({ ...event(), userId: other.id })).status, 400);
      assert.equal(await db.dailyExpense.count({ where: { userId: other.id } }), 0);
    });

    await t.test('DiDi no habilita Banamex, Santander, formatos nuevos ni avisos emitidos por la app DiDi', async () => {
      const before = await count();
      const b = event('503.25'); b.fields['android.text'] = b.fields['android.text'].replace('DIDI Credit Card', 'Joy Banamex');
      assert.equal((await send(b)).status, 'OBSERVED'); assert.equal((await read(b)).movement.cardId, banamex.id);
      const s = event('504.25'); s.fields['android.text'] = s.fields['android.text'].replace('DIDI Credit Card', 'Santander LikeU');
      assert.notEqual((await send(s)).status, 'REGISTERED');
      const changed = event('505.25'); changed.fields['android.text'] += ' NUEVO FORMATO';
      assert.equal((await send(changed)).reason, 'UNKNOWN_FORMAT');
      const ownApp = event('506.25'); ownApp.sourcePackage = 'com.didiglobal.cashloan';
      assert.equal((await send(ownApp)).reason, 'UNKNOWN_FORMAT'); assert.equal(await count(), before);
    });

    await t.test('otra moneda y correcciones personales conservan revisión y el análisis original', async () => {
      const before = await count(), foreign = event('601.25'); foreign.fields['android.text'] = foreign.fields['android.text'].replace('MXN', 'USD');
      assert.equal((await send(foreign)).reason, 'FOREIGN_CURRENCY'); assert.equal(await count(), before);
      const movement = await send(event('602.25', '0456'));
      assert.equal((await correct(movement, { merchant: 'Nombre personal', date: '2026-10-19', amount: '600.00' })).status, 200);
      const saved = await db.captureMovement.findUnique({ where: { id: movement.id } });
      assert.equal((await resolve({ id: movement.id, action: 'reinterpret' })).status, 409);
      assert.deepEqual(await db.captureMovement.findUnique({ where: { id: movement.id } }), saved);
    });

    await t.test('borrar un gasto conserva su recibo y huella para que un aviso tardío no lo recree', async () => {
      const input = event('701.25'), movement = await send(input);
      const response = await routes.expenses.DELETE(new Request(`http://localhost/api/expenses?id=${movement.expenseId}`, { method: 'DELETE', headers: { authorization: 'Bearer owner' } }));
      assert.equal(response.status, 200); const before = await count();
      await post(input); assert.equal(await count(), before);
      const late = await send(event('701.25')); assert.equal(late.reason, 'POSSIBLE_DUPLICATE');
      assert.ok(late.proposal.candidates.some(c => c.type === 'DELETED')); assert.equal(await count(), before);
    });

    await t.test('volver a observación detiene nuevas altas y conserva el piloto y las identidades', async () => {
      await mode('OBSERVATION'); const before = await count();
      assert.equal((await send(event('801.25'))).status, 'OBSERVED'); assert.equal(await count(), before);
      const saved = await read(original); assert.equal((await resolve({ id: saved.movementId, action: 'reinterpret' })).status, 409);
      await post(original); assert.deepEqual(await read(original), saved); assert.equal(saved.movement.expenseId, pilotId);
      assert.equal(saved.interpretation.reason, 'UNKNOWN_FORMAT'); assert.equal(saved.movement.analysisHistory.length, 1);
      assert.equal((await db.captureCardAlias.findFirst({ where: { cardId: card.id, kind: 'WALLET' } })).value, '4242');
    });
  } finally {
    for (const owner of users) await db.user.delete({ where: { id: owner.id } });
    await db.$disconnect();
  }
});
