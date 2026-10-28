import { array,record as objectValue } from './helpers/dynamic-values';

import { plain,present,sparseCalculations,stringValue } from './helpers/financial-fixtures';
import type { CaptureInput,IntegrationMocks,NoticeSample } from './helpers/integration-fixtures';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { test } from 'node:test';
import bankFixture from './fixtures/captures/santander-card-purchase.es.v1.json';
import walletFixture from './fixtures/captures/wallet-santander-purchase.es.v1.json';
import { integrationLoader as sourceLoader } from './helpers/integration-fixtures';
const connectionString = process.env.AFP_TEST_DATABASE_URL;

test('Santander real anonimizado: API, revisión, activación y un gasto por compra con evidencia Wallet', { skip: !connectionString }, async t => {
  const url = new URL(present(connectionString));
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && /^\/afp_test\w*$/.test(url.pathname) && !url.search);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const owners = await Promise.all(['owner', 'other'].map(name => db.user.create({ data: { email: `santander-${name}-${randomUUID()}@example.test` } })));
  const user = owners[0], other = owners[1];
  const sessions = new Map([['owner', user], ['other', other]]);
  const mocks: IntegrationMocks = {
    '@/lib/prisma': { prisma: db }, '@/lib/calendar/schedule': { scheduleCalendarSync: () => {} },
    'next/server': { NextResponse: { json: (body: unknown, options = {}) => ({ body: plain(body), status: options.status || 200, headers: new Headers(options.headers) }) } },
    '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async token => ({ data: { user: sessions.get(token) }, error: sessions.has(token) ? null : new Error('expired') }) } }) },
  };
  const load = sourceLoader(mocks), protocol = sparseCalculations(load('src/lib/captureProtocol.ts'));
  load('src/lib/captureProcessing.ts');
const configuration = load('src/lib/captureConfiguration.ts');
  const reconciliation = load('src/lib/captureReconciliation.ts');
  const eventRoute = load('src/app/api/captures/events/route.ts'), movementRoute = load('src/app/api/captures/movements/route.ts');
  const card = await db.card.create({ data: { userId: present(user).id, name: 'Santander ficticia', usualCutDay: 25, usualDueDay: 15 } });
  const sibling = await db.card.create({ data: { userId: present(user).id, name: 'Otra tarjeta Santander', usualCutDay: 25, usualDueDay: 15 } });
  const otherCard = await db.card.create({ data: { userId: present(other).id, name: 'Santander ajena', usualCutDay: 25, usualDueDay: 15 } });
  const category = await db.category.create({ data: { userId: present(user).id, name: 'Compras ficticias Santander' } });
  const secret = randomBytes(32).toString('base64url');
  const device = await db.captureDevice.create({ data: { userId: present(user).id, approvedAt: new Date(), secretHash: protocol.captureHash(secret), name: 'Teléfono ficticio Santander' } });
  const credential = { id: device.id, secretHash: device.secretHash }, authorization = `Capture ${device.id}.${secret}`;
  const parserKey = 'santander.card-purchase.es.v1', walletParserKey = 'wallet.santander-purchase.es.v1';
  const mode = (value: string) => configuration.configureCapture(db, present(user).id, { action: 'automation', cardId: card.id, parserKey, mode: value });
  const event = (fixture: NoticeSample, amount = '123.45', suffix = '0123') => protocol.validateCaptureEvent({ ...fixture.event,
    contractVersion: 1 as const, eventId: randomUUID(), notificationKeyHash: protocol.captureHash(randomUUID()),
    fields: Object.fromEntries(Object.entries(fixture.event.fields).map(([key, value]) => [key, value.replaceAll('123.45', amount).replaceAll('0123', suffix)])) });
  const read = (input: Pick<CaptureInput, 'eventId'>) => db.captureEvent.findUnique({ where: { deviceId_eventId: { deviceId: device.id, eventId: input.eventId } }, include: { movement: true } });
  const post = (input: unknown, auth = authorization) => eventRoute.POST(new Request('http://localhost/api/captures/events', {
    method: 'POST', headers: { authorization: auth, 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  }));
  const send = async (input: CaptureInput) => { const response = await post(input); assert.equal(response.status, 200); return present((await read(input))).movement; };
  const resolve = (input: { id: string | null; action: string; } | { id: string; action: string; } | { id: string; action: string; expenseId: string; } | { id: string; action: string; expectedCorrection: string; correction: { cardId: string; amount: string; date: string; currency: string; merchant: string; categoryId: string; }; }, token = 'owner') => movementRoute.PATCH(new Request('http://localhost/api/captures/movements', {
    method: 'PATCH', headers: { authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  }));
  const count = () => db.dailyExpense.count({ where: { userId: present(user).id } });
  const readiness = async () => present(present((await configuration.captureConfiguration(db, present(user).id)).rollout.find(row => row.cardId === card.id))
    .sources.find(row => row.sourcePackage === bankFixture.event.sourcePackage)).formats.find(format => format.parserKey === parserKey);
  let bankInput: CaptureInput, walletInput: CaptureInput, pilotExpenseId: string | undefined;
  try {
    for (const [ownerId, ownCard, kind, value, sourcePackage] of [
      [present(user).id, card, 'PHYSICAL', '0123', bankFixture.event.sourcePackage],
      [present(user).id, card, 'DIGITAL', '0123', bankFixture.event.sourcePackage],
      [present(user).id, card, 'WALLET', '4242', walletFixture.event.sourcePackage],
      [present(user).id, sibling, 'PHYSICAL', '0456', bankFixture.event.sourcePackage],
      [present(other).id, otherCard, 'PHYSICAL', '0123', bankFixture.event.sourcePackage],
    ] as const) await configuration.configureCapture(db, ownerId, { action: 'alias', cardId: ownCard.id, sourcePackage, kind, value, verified: true, evidence: 'Datos exclusivamente ficticios' });

    await t.test('recepción anterior y reintentos conservan originales; reinterpretación explícita no crea dinero', async () => {
      const parsers = sparseCalculations(load('src/lib/captureParsers.ts'));
      const previous = sourceLoader({ ...mocks, '@/lib/captureParsers': { ...parsers, interpretCapture: () => ({ reason: 'UNKNOWN_FORMAT', proposal: {} }) } })('src/lib/captureService.ts');
      bankInput = event(bankFixture); walletInput = event(walletFixture);
      for (const input of [bankInput, walletInput] as const) {
        const receipt = await previous.receiveCaptureEvent(db, credential, input), before = await read(input);
        assert.deepEqual((await post(input)).body, plain(receipt));
        assert.deepEqual(await read(input), before);
        const responses = await Promise.all(Array.from({ length: 4 }, () => resolve({ id: present(before).movementId, action: 'reinterpret' })));
        for (const response of responses) assert.equal(response.status, 200);
        const after = await read(input);
        assert.deepEqual(present(after).fields, present(before).fields); assert.deepEqual(present(after).interpretation, present(before).interpretation);
        assert.equal(present(after).createdAt.getTime(), present(before).createdAt.getTime());
        assert.equal(array(present(present(after).movement).analysisHistory).length, 1); assert.equal(objectValue(objectValue(array(present(present(present(after).movement).analysisHistory))[0]).previous).reason, 'UNKNOWN_FORMAT');
        assert.equal(present(present(after).movement).cardId, card.id); assert.equal(objectValue(objectValue(present(present(after).movement).proposal).alias).value, '0123');
        assert.equal(objectValue(objectValue(present(present(after).movement).proposal).alias).kind, 'DIGITAL');
      }
      const bank = present((await read(bankInput))).movement, wallet = present((await read(walletInput))).movement;
      assert.equal(present(bank).status, 'OBSERVED'); assert.equal(present(bank).reason, 'OBSERVATION');
      assert.equal(objectValue(present(present(bank).proposal)).dateSource, 'BANK_OPERATION'); assert.equal(objectValue(present(present(bank).proposal)).date, '2026-10-20');
      assert.equal(present(wallet).status, 'OBSERVED'); assert.equal(present(wallet).reason, 'OBSERVATION');
      assert.equal(objectValue(present(present(wallet).proposal)).date, '2026-10-20'); assert.equal(objectValue(present(present(wallet).proposal)).dateSource, 'NOTIFICATION_POSTED_AT');
      assert.equal(present((await db.captureCardAlias.findFirst({ where: { cardId: card.id, kind: 'WALLET' } }))).value, '4242');
      assert.equal(await count(), 0); assert.equal(present((await readiness())).canEnable, false);
      await assert.rejects(mode('AUTOMATIC'), error => objectValue(error).status === 409);
      await assert.rejects(configuration.configureCapture(db, present(user).id, { action: 'automation', cardId: card.id, parserKey: walletParserKey, mode: 'AUTOMATIC' }), error => objectValue(error).status === 409);
    });

    await t.test('revisar banco, registrar una vez, vincular Wallet y cotejar habilita solo Santander y ese formato', async () => {
      const bank = present((await read(bankInput))).movement, wallet = present((await read(walletInput))).movement;
      const p = present(bank).proposal;
      assert.equal((await resolve({ id: present(bank).id, action: 'correct', expectedCorrection: 'null', correction: {
        cardId: card.id, amount: stringValue(objectValue(present(p)).amount), date: stringValue(objectValue(present(p)).date), currency: stringValue(objectValue(present(p)).currency), merchant: stringValue(objectValue(present(p)).merchant), categoryId: category.id,
      } })).status, 200);
      const registered = await resolve({ id: present(bank).id, action: 'register' });
      assert.equal(registered.status, 200); assert.equal(objectValue(registered.body.movement).status, 'REGISTERED');
      pilotExpenseId = stringValue(objectValue(registered.body.movement).expenseId);
      assert.equal(await count(), 1);
      const expense = await db.dailyExpense.findUnique({ where: { id: stringValue(pilotExpenseId) } });
      assert.equal(present(expense).reconciliationStatus, 'PENDING');
      assert.equal(objectValue((await resolve({ id: present(wallet).id, action: 'link', expenseId: stringValue(pilotExpenseId) })).body.movement).expenseId, pilotExpenseId);
      assert.equal((await resolve({ id: present(wallet).id, action: 'link', expenseId: stringValue(pilotExpenseId) })).status, 200);
      await assert.rejects(mode('AUTOMATIC'), error => objectValue(error).status === 409);
      const period = { cardId: card.id, startDate: '2026-10-01', endDate: '2026-10-25' };
      const record = (await reconciliation.captureStatement(db, present(user).id, period)).records.find(row => row.id === pilotExpenseId);
      await reconciliation.reconcileCaptureStatement(db, present(user).id, { ...period, action: 'confirm', type: present(record).type, recordId: present(record).id, fingerprint: present(record).fingerprint });
      assert.equal(present((await readiness())).canEnable, true); await mode('AUTOMATIC');
      assert.equal(present((await readiness())).datePolicy, 'BANK_OPERATION');
      await assert.rejects(configuration.configureCapture(db, present(user).id, { action: 'automation', cardId: sibling.id, parserKey, mode: 'AUTOMATIC' }), error => objectValue(error).status === 409);
      assert.equal(await count(), 1);
    });

    await t.test('banco y Wallet en ambos órdenes: un gasto por conciliar; la otra evidencia requiere vínculo explícito', async () => {
      for (const [index, order] of ([['bank', 'wallet'], ['wallet', 'bank']] as const).entries()) {
        const amount = `${200 + index}.25`, before = await count();
        const inputs = { bank: event(bankFixture, amount), wallet: event(walletFixture, amount) }, result: Record<string, unknown> = {};
        for (const source of order) result[source] = await send(inputs[source]);
        assert.equal(objectValue(result.bank).status, 'REGISTERED'); assert.equal(objectValue(result.bank).reason, 'AUTOMATIC');
        assert.equal(objectValue(result.wallet).status, 'OBSERVED'); assert.equal(objectValue(result.wallet).expenseId, null);
        const expense = await db.dailyExpense.findUnique({ where: { id: stringValue(objectValue(result.bank).expenseId) } });
        assert.equal(present(expense).reconciliationStatus, 'PENDING'); assert.equal(present(expense).date.toISOString(), '2026-10-20T12:00:00.000Z');
        assert.equal(String(present(expense).amount), amount); assert.equal(present(expense).cardId, card.id);
        assert.equal(await count(), before + 1);
        assert.equal((await resolve({ id: stringValue(objectValue(result.wallet).id), action: 'link', expenseId: present(expense).id })).status, 200);
        assert.equal(await count(), before + 1);
      }
    });

    await t.test('ocho entregas simultáneas y respuesta perdida conservan un gasto y el mismo recibo', async () => {
      const input = event(bankFixture, '301.25'), before = await count();
      const responses = await Promise.all(Array.from({ length: 8 }, () => post(input)));
      for (const response of responses) { assert.equal(response.status, 200); assert.deepEqual(response.body, present(responses[0]).body); }
      assert.deepEqual((await post(input)).body, present(responses[0]).body); assert.equal(await count(), before + 1);
      assert.equal(await db.captureEvent.count({ where: { deviceId: device.id, eventId: input.eventId } }), 1);
    });

    await t.test('dos compras iguales conservan multiplicidad y la segunda exige confirmar otra compra', async () => {
      const first = await send(event(bankFixture, '401.25')), second = await send(event(bankFixture, '401.25'));
      assert.equal(present(first).status, 'REGISTERED'); assert.equal(present(second).reason, 'POSSIBLE_DUPLICATE');
      const response = await resolve({ id: present(second).id, action: 'distinct' });
      assert.equal(response.status, 200); assert.notEqual(objectValue(response.body.movement).expenseId, present(first).expenseId);
    });

    await t.test('un gasto manual coincidente se revisa y vincularlo conserva sus datos personales', async () => {
      const expense = await db.dailyExpense.create({ data: { userId: present(user).id, cardId: card.id, categoryId: category.id,
        amount: '402.25', date: new Date('2026-10-20T12:00:00Z'), paymentMethod: 'CARD', concept: 'Concepto personal', notes: 'Nota personal', cashContributionAmount: '2.25' } });
      const before = await count(), movement = await send(event(bankFixture, '402.25'));
      assert.equal(present(movement).reason, 'POSSIBLE_DUPLICATE'); assert.equal(await count(), before);
      assert.equal((await resolve({ id: present(movement).id, action: 'link', expenseId: expense.id })).status, 200);
      assert.deepEqual(await db.dailyExpense.findUnique({ where: { id: expense.id } }), expense);
    });

    await t.test('actualizar la misma notificación no crea otra compra', async () => {
      const input = event(bankFixture, '403.25'); await send(input);
      const next = event(bankFixture, '404.25'); next.notificationKeyHash = input.notificationKeyHash;
      const before = await count(), movement = await send(next);
      assert.equal(present(movement).reason, 'NOTIFICATION_REVISION'); assert.equal(await count(), before);
    });

    await t.test('alias ambiguos o no verificados y tarjeta desconocida bloquean altas sin modificar alias NFC', async () => {
      const collision = await db.captureCardAlias.create({ data: { userId: present(user).id, cardId: sibling.id, sourcePackage: bankFixture.event.sourcePackage, kind: 'PHYSICAL', value: '0123' } });
      const before = await count();
      for (const fixture of [bankFixture, walletFixture] as const) assert.equal(present((await send(event(fixture, '501.25')))).reason, 'AMBIGUOUS_CARD');
      assert.equal(present((await readiness())).canEnable, false); assert.equal(await count(), before);
      await db.captureCardAlias.delete({ where: { id: collision.id } });
      const unverified = await db.captureCardAlias.create({ data: { userId: present(user).id, cardId: card.id, sourcePackage: bankFixture.event.sourcePackage, kind: 'PHYSICAL', value: '8888' } });
      assert.equal(present((await send(event(bankFixture, '502.25', '8888')))).reason, 'UNVERIFIED_ALIAS');
      assert.equal(present((await send(event(bankFixture, '503.25', '9999')))).reason, 'UNKNOWN_CARD');
      assert.equal(await count(), before); await db.captureCardAlias.delete({ where: { id: unverified.id } });
    });

    await t.test('otra tarjeta no hereda automatización y las credenciales conservan el aislamiento', async () => {
      const movement = await send(event(bankFixture, '504.25', '0456'));
      assert.equal(present(movement).status, 'OBSERVED'); assert.equal(present(movement).cardId, sibling.id);
      assert.equal((await resolve({ id: present(movement).id, action: 'reinterpret' }, 'other')).status, 404);
      const before = await count();
      for (const auth of ['Bearer owner', `Capture ${device.id}.${randomBytes(32).toString('base64url')}`] as const) assert.equal((await post(event(bankFixture), auth)).status, 401);
      assert.equal((await post({ ...event(bankFixture), userId: present(other).id })).status, 400);
      assert.equal(await count(), before); assert.equal(await db.dailyExpense.count({ where: { userId: present(other).id } }), 0);
    });

    await t.test('forzar el modo histórico Wallet v1 no habilita v2; una corrección personal conserva revisión', async () => {
      await db.captureAutomation.create({ data: { userId: present(user).id, cardId: card.id, parserKey: walletParserKey, mode: 'AUTOMATIC', datePolicy: 'NOTIFICATION_POSTED_AT' } });
      const before = await count(), wallet = await send(event(walletFixture, '601.25'));
      assert.equal(present(wallet).reason, 'OBSERVATION'); assert.equal(present(wallet).expenseId, null); assert.equal(await count(), before);
      assert.equal((await resolve({ id: present(wallet).id, action: 'correct', expectedCorrection: 'null', correction: {
        cardId: card.id, amount: '601.25', date: '2026-10-20', currency: 'MXN', merchant: 'Corrección personal', categoryId: category.id,
      } })).status, 200);
      assert.equal(present((await send(event(bankFixture, '601.25')))).reason, 'POSSIBLE_DUPLICATE');
      assert.equal(await count(), before); assert.equal((await resolve({ id: present(wallet).id, action: 'reinterpret' })).status, 409);
      assert.equal(objectValue(present(present((await db.captureMovement.findUnique({ where: { id: present(wallet).id } }))).correction)).merchant, 'Corrección personal');
    });

    await t.test('volver a observación detiene futuras altas y conserva gasto piloto, resolución y análisis originales', async () => {
      await mode('OBSERVATION'); const before = await count();
      assert.equal(present((await send(event(bankFixture, '701.25')))).status, 'OBSERVED'); assert.equal(await count(), before);
      const bank = await read(bankInput);
      assert.equal((await resolve({ id: present(bank).movementId, action: 'reinterpret' })).status, 409);
      await send(bankInput);
      const after = await read(bankInput);
      assert.deepEqual(after, bank); assert.equal(present(present(after).movement).expenseId, pilotExpenseId);
      assert.equal(objectValue(present(present(after).interpretation)).reason, 'UNKNOWN_FORMAT'); assert.equal(array(present(present(after).movement).analysisHistory).length, 1);
      assert.equal(present((await db.captureCardAlias.findFirst({ where: { cardId: card.id, kind: 'WALLET' } }))).value, '4242');
    });
  } finally {
    for (const owner of owners) await db.user.delete({ where: { id: owner.id } });
    await db.$disconnect();
  }
});
