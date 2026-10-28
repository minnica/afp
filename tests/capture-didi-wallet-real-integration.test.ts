import { array,record as objectValue } from './helpers/dynamic-values';

import { plain,present,sparseCalculations,stringValue } from './helpers/financial-fixtures';

import type { CaptureInput,IntegrationMocks } from './helpers/integration-fixtures';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { test } from 'node:test';
import fixture from './fixtures/captures/wallet-didi-purchase.es.v1.json';
import { integrationLoader as sourceLoader } from './helpers/integration-fixtures';
const connectionString = process.env.AFP_TEST_DATABASE_URL;

test('Wallet DiDi real: API, observación, política de fecha, activación y gasto único', { skip: !connectionString }, async t => {
  const url = new URL(present(connectionString));
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && /^\/afp_test\w*$/.test(url.pathname) && !url.search);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const users = await Promise.all(['owner', 'other'].map(name => db.user.create({ data: { email: `wallet-didi-${name}-${randomUUID()}@example.test` } })));
  const [user, other] = users, sessions = new Map([['owner', user], ['other', other]]);
  const mocks: IntegrationMocks = {
    '@/lib/prisma': { prisma: db }, '@/lib/calendar/schedule': { scheduleCalendarSync: () => {} },
    'next/server': { NextResponse: { json: (body: unknown, options = {}) => ({ body: plain(body), status: options.status || 200, headers: new Headers(options.headers) }) } },
    '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async token => ({ data: { user: sessions.get(token) }, error: sessions.has(token) ? null : new Error('expired') }) } }) },
  };
  const load = sourceLoader(mocks), protocol = sparseCalculations(load('src/lib/captureProtocol.ts'));
  load('src/lib/captureProcessing.ts');
const configuration = load('src/lib/captureConfiguration.ts');
  const reconciliation = load('src/lib/captureReconciliation.ts'), service = load('src/lib/captureService.ts');
  const routes = { events: load('src/app/api/captures/events/route.ts'), movements: load('src/app/api/captures/movements/route.ts'), expenses: load('src/app/api/expenses/route.ts') };
  const card = await db.card.create({ data: { userId: present(user).id, name: 'Nombre personal de tarjeta', usualCutDay: 25, usualDueDay: 15 } });
  const sibling = await db.card.create({ data: { userId: present(user).id, name: 'Otra DiDi', usualCutDay: 25, usualDueDay: 15 } });
  const banamex = await db.card.create({ data: { userId: present(user).id, name: 'Otra marca con mismas cifras', usualCutDay: 25, usualDueDay: 15 } });
  const otherCard = await db.card.create({ data: { userId: present(other).id, name: 'DiDi ajena', usualCutDay: 25, usualDueDay: 15 } });
  const category = await db.category.create({ data: { userId: present(user).id, name: 'Compras ficticias DiDi' } });
  const secret = randomBytes(32).toString('base64url');
  const device = await db.captureDevice.create({ data: { userId: present(user).id, approvedAt: new Date(), secretHash: protocol.captureHash(secret), name: 'Wallet DiDi ficticio' } });
  const credential = { id: device.id, secretHash: device.secretHash }, authorization = `Capture ${device.id}.${secret}`;
  const parserKey = 'wallet.didi-purchase.es.v1';
  const mode = (value: string, datePolicy?: string) => configuration.configureCapture(db, present(user).id, { action: 'automation', cardId: card.id, parserKey, mode: value, ...(datePolicy ? { datePolicy } : {}) });
  const event = (amount = '123.45', suffix = '0123') => protocol.validateCaptureEvent({ ...fixture.event, contractVersion: 1 as const,
    eventId: randomUUID(), notificationKeyHash: protocol.captureHash(randomUUID()),
    fields: Object.fromEntries(Object.entries(fixture.event.fields).map(([key, value]) => [key, value.replaceAll('123.45', amount).replaceAll('0123', suffix)])) });
  const read = (input: Pick<CaptureInput, 'eventId'>) => db.captureEvent.findUnique({ where: { deviceId_eventId: { deviceId: device.id, eventId: input.eventId } }, include: { movement: true } });
  const post = (input: unknown, auth = authorization) => routes.events.POST(new Request('http://localhost/api/captures/events', {
    method: 'POST', headers: { authorization: auth, 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  }));
  const send = async (input: CaptureInput) => { assert.equal((await post(input)).status, 200); return present((await read(input))).movement; };
  const resolve = (input: unknown, token = 'owner') => routes.movements.PATCH(new Request('http://localhost/api/captures/movements', {
    method: 'PATCH', headers: { authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  }));
  const count = () => db.dailyExpense.count({ where: { userId: present(user).id } });
  const readiness = async () => present(present((await configuration.captureConfiguration(db, present(user).id)).rollout.find(row => row.cardId === card.id))
    .sources.find(row => row.sourcePackage === fixture.event.sourcePackage)).formats.find(format => format.parserKey === parserKey);
  const correct = (movement: import('@prisma/client').CaptureMovement | null, overrides = {}) => resolve({ id: present(movement).id, action: 'correct', expectedCorrection: 'null', correction: {
    cardId: objectValue(present(present(movement).proposal)).cardId, amount: objectValue(present(present(movement).proposal)).amount, date: objectValue(present(present(movement).proposal)).date, currency: objectValue(present(present(movement).proposal)).currency,
    merchant: objectValue(present(present(movement).proposal)).merchant, categoryId: category.id, ...overrides,
  } });
  let original: CaptureInput, pilotId: string | undefined;
  try {
    for (const [userId, ownCard, sourcePackage, kind, value] of [
      [present(user).id, card, 'com.didiglobal.cashloan', 'DIGITAL', '0123'],
      [present(user).id, card, 'com.didiglobal.cashloan', 'PHYSICAL', '1010'],
      [present(user).id, card, fixture.event.sourcePackage, 'WALLET', '4242'],
      [present(user).id, sibling, 'com.didiglobal.cashloan', 'PHYSICAL', '0456'],
      [present(user).id, banamex, 'com.citibanamex.banamexmobile', 'DIGITAL', '0123'],
      [present(other).id, otherCard, 'com.didiglobal.cashloan', 'DIGITAL', '0123'],
    ] as const) await configuration.configureCapture(db, userId, { action: 'alias', cardId: ownCard.id, sourcePackage, kind, value, verified: true, evidence: 'Terminación ficticia de pruebas' });

    await t.test('un modo forzado sin aceptar el día del aviso queda por revisar sin gasto ni automatización anunciada', async () => {
      await db.captureAutomation.create({ data: { userId: present(user).id, cardId: card.id, parserKey, mode: 'AUTOMATIC' } });
      const movement = await send(event('100.01'));
      assert.equal(present(movement).reason, 'DATE_POLICY_REQUIRED'); assert.equal(present(movement).status, 'REVIEW');
      assert.equal((await service.getCaptureDevice(db, credential)).configuration.automaticExpenses, false);
      assert.equal(await count(), 0); await mode('OBSERVATION');
    });

    await t.test('recibo desconocido anterior se conserva al reenviar; interpretar explícitamente añade un análisis sin crear gasto', async () => {
      const parsers = sparseCalculations(load('src/lib/captureParsers.ts'));
      const previous = sourceLoader({ ...mocks, '@/lib/captureParsers': { ...parsers, interpretCapture: () => ({ reason: 'UNKNOWN_FORMAT', proposal: {} }) } })('src/lib/captureService.ts');
      original = event(); const receipt = await previous.receiveCaptureEvent(db, credential, original), before = await read(original);
      assert.deepEqual((await post(original)).body, plain(receipt)); assert.deepEqual(await read(original), before);
      const results = await Promise.all(Array.from({ length: 4 }, () => resolve({ id: present(before).movementId, action: 'reinterpret' })));
      for (const result of results) assert.equal(result.status, 200);
      const after = await read(original), movement = present(after).movement;
      assert.equal(present(movement).status, 'OBSERVED'); assert.equal(present(movement).reason, 'OBSERVATION');
      assert.equal(objectValue(present(present(movement).proposal)).cardId, card.id); assert.equal(objectValue(objectValue(present(present(movement).proposal)).alias).kind, 'DIGITAL');
      assert.equal(objectValue(objectValue(present(present(movement).proposal)).alias).value, '0123'); assert.equal(objectValue(present(present(movement).proposal)).date, '2026-10-20');
      assert.equal(objectValue(present(present(movement).proposal)).dateSource, 'NOTIFICATION_POSTED_AT'); assert.equal(objectValue(present(present(movement).proposal)).operationAt, undefined);
      assert.equal(array(present(present(movement).analysisHistory)).length, 1); assert.equal(objectValue(objectValue(array(present(present(movement).analysisHistory))[0]).previous).reason, 'UNKNOWN_FORMAT');
      for (const key of ['id', 'eventId', 'requestHash', 'fields', 'interpretation', 'createdAt', 'receivedAt'] as const) assert.deepEqual(present(after)[key], present(before)[key]);
      assert.equal(present((await db.captureCardAlias.findFirst({ where: { cardId: card.id, kind: 'WALLET' } }))).value, '4242');
      assert.equal(await count(), 0); assert.equal(present((await readiness())).canEnable, false);
      await assert.rejects(mode('AUTOMATIC', 'NOTIFICATION_POSTED_AT'), error => objectValue(error).status === 409);
    });

    await t.test('revisión y cotejo permiten habilitar solo la tarjeta/formato con aceptación explícita de fecha', async () => {
      const movement = present((await read(original))).movement;
      assert.equal((await correct(movement)).status, 200);
      const registered = await resolve({ id: present(movement).id, action: 'register' });
      assert.equal(registered.status, 200); pilotId = stringValue(objectValue(registered.body.movement).expenseId);
      assert.equal(await count(), 1); assert.equal(present((await db.dailyExpense.findUnique({ where: { id: stringValue(pilotId) } }))).reconciliationStatus, 'PENDING');
      await assert.rejects(mode('AUTOMATIC', 'NOTIFICATION_POSTED_AT'), error => objectValue(error).status === 409);
      const period = { cardId: card.id, startDate: '2026-10-20', endDate: '2026-10-20' };
      const record = (await reconciliation.captureStatement(db, present(user).id, period)).records.find(row => row.id === pilotId);
      await reconciliation.reconcileCaptureStatement(db, present(user).id, { ...period, action: 'confirm', type: present(record).type, recordId: present(record).id, fingerprint: present(record).fingerprint });
      assert.equal(present((await readiness())).canEnable, true);
      for (const policy of [undefined, 'BANK_OPERATION'] as const) await assert.rejects(mode('AUTOMATIC', policy), error => objectValue(error).status === 409);
      await mode('AUTOMATIC', 'NOTIFICATION_POSTED_AT');
      assert.equal((await service.getCaptureDevice(db, credential)).configuration.automaticExpenses, true);
      await assert.rejects(configuration.configureCapture(db, present(user).id, { action: 'automation', cardId: sibling.id, parserKey, mode: 'AUTOMATIC', datePolicy: 'NOTIFICATION_POSTED_AT' }), error => objectValue(error).status === 409);
    });

    await t.test('ocho entregas API y una respuesta perdida guardan un recibo y un gasto por conciliar en el día México', async () => {
      const input = event('201.25'), before = await count();
      const results = await Promise.all(Array.from({ length: 8 }, () => post(input)));
      for (const result of results) { assert.equal(result.status, 200); assert.deepEqual(result.body, present(results[0]).body); }
      assert.deepEqual((await post(input)).body, present(results[0]).body); assert.equal(await count(), before + 1);
      const movement = present((await read(input))).movement, expense = await db.dailyExpense.findUnique({ where: { id: present(present(movement).expenseId) } });
      assert.equal(present(movement).status, 'REGISTERED'); assert.equal(present(expense).reconciliationStatus, 'PENDING');
      assert.equal(present(expense).date.toISOString(), '2026-10-20T12:00:00.000Z'); assert.equal(String(present(expense).amount), '201.25');
      assert.equal(present(expense).cardId, card.id);
    });

    await t.test('otro teléfono de la misma cuenta no duplica la compra ni fusiona sus eventos sin referencia', async () => {
      const input = event('202.25'), first = await send(input), before = await count();
      const device2 = await db.captureDevice.create({ data: { userId: present(user).id, approvedAt: new Date(), secretHash: protocol.captureHash(randomBytes(32).toString('base64url')), name: 'Segundo teléfono ficticio' } });
      await service.receiveCaptureEvent(db, { id: device2.id, secretHash: device2.secretHash }, input);
      const second = await db.captureEvent.findUnique({ where: { deviceId_eventId: { deviceId: device2.id, eventId: input.eventId } }, include: { movement: true } });
      assert.equal(present(present(second).movement).reason, 'POSSIBLE_DUPLICATE'); assert.notEqual(present(second).movementId, present(first).id);
      assert.equal(await count(), before);
    });

    await t.test('dos compras iguales requieren decisión explícita y conservan multiplicidad', async () => {
      const first = await send(event('301.25')), second = await send(event('301.25'));
      assert.equal(present(first).status, 'REGISTERED'); assert.equal(present(second).reason, 'POSSIBLE_DUPLICATE');
      const response = await resolve({ id: present(second).id, action: 'distinct' });
      assert.equal(response.status, 200); assert.notEqual(objectValue(response.body.movement).expenseId, present(first).expenseId);
    });

    await t.test('coincidencias manuales se vinculan sin sobrescribir concepto, notas o aportaciones', async () => {
      const expense = await db.dailyExpense.create({ data: { userId: present(user).id, cardId: card.id, categoryId: category.id, amount: '302.25',
        date: new Date('2026-10-20T12:00:00Z'), paymentMethod: 'CARD', concept: 'Concepto personal', notes: 'Nota conservada', cashContributionAmount: '2.25' } });
      const before = await count(), movement = await send(event('302.25'));
      assert.equal(present(movement).reason, 'POSSIBLE_DUPLICATE'); assert.equal(await count(), before);
      assert.equal((await resolve({ id: present(movement).id, action: 'link', expenseId: expense.id })).status, 200);
      assert.deepEqual(await db.dailyExpense.findUnique({ where: { id: expense.id } }), expense);
    });

    await t.test('una actualización de notificación conserva revisión y no crea otra compra', async () => {
      const original = event('303.25'); await send(original);
      const updated = event('304.25'); updated.notificationKeyHash = original.notificationKeyHash;
      const before = await count(); assert.equal(present((await send(updated))).reason, 'NOTIFICATION_REVISION'); assert.equal(await count(), before);
    });

    await t.test('colisiones entre tipos DiDi, alias no verificados, desconocidos y token NFC bloquean el alta', async () => {
      const before = await count();
      const collision = await db.captureCardAlias.create({ data: { userId: present(user).id, cardId: sibling.id, sourcePackage: 'com.didiglobal.cashloan', kind: 'PHYSICAL', value: '0123' } });
      assert.equal(present((await send(event('401.25')))).reason, 'AMBIGUOUS_CARD'); assert.equal(present((await readiness())).canEnable, false);
      await db.captureCardAlias.delete({ where: { id: collision.id } });
      const unverified = await db.captureCardAlias.create({ data: { userId: present(user).id, cardId: card.id, sourcePackage: 'com.didiglobal.cashloan', kind: 'DIGITAL', value: '8888' } });
      assert.equal(present((await send(event('402.25', '8888')))).reason, 'UNVERIFIED_ALIAS');
      for (const suffix of ['9999', '4242'] as const) assert.equal(present((await send(event('403.25', suffix)))).reason, 'UNKNOWN_CARD');
      assert.equal(await count(), before); await db.captureCardAlias.delete({ where: { id: unverified.id } });
    });

    await t.test('misma terminación en Banamex y otro propietario no elige tarjeta; otra DiDi no hereda automatización', async () => {
      const movement = await send(event('501.25'));
      assert.equal(present(movement).status, 'REGISTERED'); assert.equal(present(movement).cardId, card.id);
      const otherDidi = await send(event('502.25', '0456'));
      assert.equal(present(otherDidi).status, 'OBSERVED'); assert.equal(present(otherDidi).cardId, sibling.id);
      assert.equal((await resolve({ id: present(otherDidi).id, action: 'reinterpret' }, 'other')).status, 404);
      for (const auth of ['Bearer owner', `Capture ${device.id}.${randomBytes(32).toString('base64url')}`] as const) assert.equal((await post(event(), auth)).status, 401);
      assert.equal((await post({ ...event(), userId: present(other).id })).status, 400);
      assert.equal(await db.dailyExpense.count({ where: { userId: present(other).id } }), 0);
    });

    await t.test('DiDi no habilita Banamex, Santander, formatos nuevos ni avisos emitidos por la app DiDi', async () => {
      const before = await count();
      const b = event('503.25'); b.fields['android.text'] = present(b.fields['android.text']).replace('DIDI Credit Card', 'Joy Banamex');
      assert.equal(present((await send(b))).status, 'OBSERVED'); assert.equal(present(present((await read(b))).movement).cardId, banamex.id);
      const s = event('504.25'); s.fields['android.text'] = present(s.fields['android.text']).replace('DIDI Credit Card', 'Santander LikeU');
      assert.notEqual(present((await send(s))).status, 'REGISTERED');
      const changed = event('505.25'); changed.fields['android.text'] += ' NUEVO FORMATO';
      assert.equal(present((await send(changed))).reason, 'UNKNOWN_FORMAT');
      const ownApp = event('506.25'); ownApp.sourcePackage = 'com.didiglobal.cashloan';
      assert.equal(present((await send(ownApp))).reason, 'UNKNOWN_FORMAT'); assert.equal(await count(), before);
    });

    await t.test('otra moneda y correcciones personales conservan revisión y el análisis original', async () => {
      const before = await count(), foreign = event('601.25'); foreign.fields['android.text'] = present(foreign.fields['android.text']).replace('MXN', 'USD');
      assert.equal(present((await send(foreign))).reason, 'FOREIGN_CURRENCY'); assert.equal(await count(), before);
      const movement = await send(event('602.25', '0456'));
      assert.equal((await correct(movement, { merchant: 'Nombre personal', date: '2026-10-19', amount: '600.00' })).status, 200);
      const saved = await db.captureMovement.findUnique({ where: { id: present(movement).id } });
      assert.equal((await resolve({ id: present(movement).id, action: 'reinterpret' })).status, 409);
      assert.deepEqual(await db.captureMovement.findUnique({ where: { id: present(movement).id } }), saved);
    });

    await t.test('borrar un gasto conserva su recibo y huella para que un aviso tardío no lo recree', async () => {
      const input = event('701.25'), movement = await send(input);
      const response = await routes.expenses.DELETE(new Request(`http://localhost/api/expenses?id=${present(movement).expenseId}`, { method: 'DELETE', headers: { authorization: 'Bearer owner' } }));
      assert.equal(response.status, 200); const before = await count();
      await post(input); assert.equal(await count(), before);
      const late = await send(event('701.25')); assert.equal(present(late).reason, 'POSSIBLE_DUPLICATE');
      assert.ok(array(objectValue(present(present(late).proposal)).candidates).some(c => objectValue(c).type === 'DELETED')); assert.equal(await count(), before);
    });

    await t.test('volver a observación detiene nuevas altas y conserva el piloto y las identidades', async () => {
      await mode('OBSERVATION'); const before = await count();
      assert.equal(present((await send(event('801.25')))).status, 'OBSERVED'); assert.equal(await count(), before);
      const saved = await read(original); assert.equal((await resolve({ id: present(saved).movementId, action: 'reinterpret' })).status, 409);
      await post(original); assert.deepEqual(await read(original), saved); assert.equal(present(present(saved).movement).expenseId, pilotId);
      assert.equal(objectValue(present(present(saved).interpretation)).reason, 'UNKNOWN_FORMAT'); assert.equal(array(present(present(saved).movement).analysisHistory).length, 1);
      assert.equal(present((await db.captureCardAlias.findFirst({ where: { cardId: card.id, kind: 'WALLET' } }))).value, '4242');
    });
  } finally {
    for (const owner of users) await db.user.delete({ where: { id: owner.id } });
    await db.$disconnect();
  }
});
