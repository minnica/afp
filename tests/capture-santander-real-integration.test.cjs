const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomUUID, randomBytes } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { sourceLoader } = require('./helpers/load-source.cjs');
const bankFixture = require('./fixtures/captures/santander-card-purchase.es.v1.json');
const walletFixture = require('./fixtures/captures/wallet-santander-purchase.es.v1.json');
const connectionString = process.env.AFP_TEST_DATABASE_URL;

test('Santander real anonimizado: API, revisión, activación y un gasto por compra con evidencia Wallet', { skip: !connectionString }, async t => {
  const url = new URL(connectionString);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && /^\/afp_test\w*$/.test(url.pathname) && !url.search);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const owners = await Promise.all(['owner', 'other'].map(name => db.user.create({ data: { email: `santander-${name}-${randomUUID()}@example.test` } })));
  const user = owners[0], other = owners[1];
  const sessions = new Map([['owner', user], ['other', other]]);
  const mocks = {
    '@/lib/prisma': { prisma: db }, '@/lib/calendar/schedule': { scheduleCalendarSync: () => {} },
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body: JSON.parse(JSON.stringify(body)), status: options.status || 200, headers: new Headers(options.headers) }) } },
    '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async token => ({ data: { user: sessions.get(token) }, error: sessions.has(token) ? null : new Error('expired') }) } }) },
  };
  const load = sourceLoader(mocks), protocol = load('src/lib/captureProtocol.ts');
  const processing = load('src/lib/captureProcessing.ts'), configuration = load('src/lib/captureConfiguration.ts');
  const reconciliation = load('src/lib/captureReconciliation.ts');
  const eventRoute = load('src/app/api/captures/events/route.ts'), movementRoute = load('src/app/api/captures/movements/route.ts');
  const card = await db.card.create({ data: { userId: user.id, name: 'Santander ficticia', usualCutDay: 25, usualDueDay: 15 } });
  const sibling = await db.card.create({ data: { userId: user.id, name: 'Otra tarjeta Santander', usualCutDay: 25, usualDueDay: 15 } });
  const otherCard = await db.card.create({ data: { userId: other.id, name: 'Santander ajena', usualCutDay: 25, usualDueDay: 15 } });
  const category = await db.category.create({ data: { userId: user.id, name: 'Compras ficticias Santander' } });
  const secret = randomBytes(32).toString('base64url');
  const device = await db.captureDevice.create({ data: { userId: user.id, approvedAt: new Date(), secretHash: protocol.captureHash(secret), name: 'Teléfono ficticio Santander' } });
  const credential = { id: device.id, secretHash: device.secretHash }, authorization = `Capture ${device.id}.${secret}`;
  const parserKey = 'santander.card-purchase.es.v1', walletParserKey = 'wallet.santander-purchase.es.v1';
  const mode = value => configuration.configureCapture(db, user.id, { action: 'automation', cardId: card.id, parserKey, mode: value });
  const event = (fixture, amount = '123.45', suffix = '0123') => protocol.validateCaptureEvent({ ...fixture.event,
    contractVersion: 1, eventId: randomUUID(), notificationKeyHash: protocol.captureHash(randomUUID()),
    fields: Object.fromEntries(Object.entries(fixture.event.fields).map(([key, value]) => [key, value.replaceAll('123.45', amount).replaceAll('0123', suffix)])) });
  const read = input => db.captureEvent.findUnique({ where: { deviceId_eventId: { deviceId: device.id, eventId: input.eventId } }, include: { movement: true } });
  const post = (input, auth = authorization) => eventRoute.POST(new Request('http://localhost/api/captures/events', {
    method: 'POST', headers: { authorization: auth, 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  }));
  const send = async input => { const response = await post(input); assert.equal(response.status, 200); return (await read(input)).movement; };
  const resolve = (input, token = 'owner') => movementRoute.PATCH(new Request('http://localhost/api/captures/movements', {
    method: 'PATCH', headers: { authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  }));
  const count = () => db.dailyExpense.count({ where: { userId: user.id } });
  const readiness = async () => (await configuration.captureConfiguration(db, user.id)).rollout.find(row => row.cardId === card.id)
    .sources.find(row => row.sourcePackage === bankFixture.event.sourcePackage).formats.find(format => format.parserKey === parserKey);
  let bankInput, walletInput, pilotExpenseId;
  try {
    for (const [ownerId, ownCard, kind, value, sourcePackage] of [
      [user.id, card, 'PHYSICAL', '0123', bankFixture.event.sourcePackage],
      [user.id, card, 'DIGITAL', '0123', bankFixture.event.sourcePackage],
      [user.id, card, 'WALLET', '4242', walletFixture.event.sourcePackage],
      [user.id, sibling, 'PHYSICAL', '0456', bankFixture.event.sourcePackage],
      [other.id, otherCard, 'PHYSICAL', '0123', bankFixture.event.sourcePackage],
    ]) await configuration.configureCapture(db, ownerId, { action: 'alias', cardId: ownCard.id, sourcePackage, kind, value, verified: true, evidence: 'Datos exclusivamente ficticios' });

    await t.test('recepción anterior y reintentos conservan originales; reinterpretación explícita no crea dinero', async () => {
      const parsers = load('src/lib/captureParsers.ts');
      const previous = sourceLoader({ ...mocks, '@/lib/captureParsers': { ...parsers, interpretCapture: () => ({ reason: 'UNKNOWN_FORMAT', proposal: {} }) } })('src/lib/captureService.ts');
      bankInput = event(bankFixture); walletInput = event(walletFixture);
      for (const input of [bankInput, walletInput]) {
        const receipt = await previous.receiveCaptureEvent(db, credential, input), before = await read(input);
        assert.deepEqual((await post(input)).body, JSON.parse(JSON.stringify(receipt)));
        assert.deepEqual(await read(input), before);
        const responses = await Promise.all(Array.from({ length: 4 }, () => resolve({ id: before.movementId, action: 'reinterpret' })));
        for (const response of responses) assert.equal(response.status, 200);
        const after = await read(input);
        assert.deepEqual(after.fields, before.fields); assert.deepEqual(after.interpretation, before.interpretation);
        assert.equal(after.createdAt.getTime(), before.createdAt.getTime());
        assert.equal(after.movement.analysisHistory.length, 1); assert.equal(after.movement.analysisHistory[0].previous.reason, 'UNKNOWN_FORMAT');
        assert.equal(after.movement.cardId, card.id); assert.equal(after.movement.proposal.alias.value, '0123');
        assert.equal(after.movement.proposal.alias.kind, 'DIGITAL');
      }
      const bank = (await read(bankInput)).movement, wallet = (await read(walletInput)).movement;
      assert.equal(bank.status, 'OBSERVED'); assert.equal(bank.reason, 'OBSERVATION');
      assert.equal(bank.proposal.dateSource, 'BANK_OPERATION'); assert.equal(bank.proposal.date, '2026-10-20');
      assert.equal(wallet.status, 'OBSERVED'); assert.equal(wallet.reason, 'OBSERVATION');
      assert.equal(wallet.proposal.date, '2026-10-20'); assert.equal(wallet.proposal.dateSource, 'NOTIFICATION_POSTED_AT');
      assert.equal((await db.captureCardAlias.findFirst({ where: { cardId: card.id, kind: 'WALLET' } })).value, '4242');
      assert.equal(await count(), 0); assert.equal((await readiness()).canEnable, false);
      await assert.rejects(mode('AUTOMATIC'), error => error.status === 409);
      await assert.rejects(configuration.configureCapture(db, user.id, { action: 'automation', cardId: card.id, parserKey: walletParserKey, mode: 'AUTOMATIC' }), error => error.status === 409);
    });

    await t.test('revisar banco, registrar una vez, vincular Wallet y cotejar habilita solo Santander y ese formato', async () => {
      const bank = (await read(bankInput)).movement, wallet = (await read(walletInput)).movement;
      const p = bank.proposal;
      assert.equal((await resolve({ id: bank.id, action: 'correct', expectedCorrection: 'null', correction: {
        cardId: card.id, amount: p.amount, date: p.date, currency: p.currency, merchant: p.merchant, categoryId: category.id,
      } })).status, 200);
      const registered = await resolve({ id: bank.id, action: 'register' });
      assert.equal(registered.status, 200); assert.equal(registered.body.movement.status, 'REGISTERED');
      pilotExpenseId = registered.body.movement.expenseId;
      assert.equal(await count(), 1);
      const expense = await db.dailyExpense.findUnique({ where: { id: pilotExpenseId } });
      assert.equal(expense.reconciliationStatus, 'PENDING');
      assert.equal((await resolve({ id: wallet.id, action: 'link', expenseId: pilotExpenseId })).body.movement.expenseId, pilotExpenseId);
      assert.equal((await resolve({ id: wallet.id, action: 'link', expenseId: pilotExpenseId })).status, 200);
      await assert.rejects(mode('AUTOMATIC'), error => error.status === 409);
      const period = { cardId: card.id, startDate: '2026-10-01', endDate: '2026-10-25' };
      const record = (await reconciliation.captureStatement(db, user.id, period)).records.find(row => row.id === pilotExpenseId);
      await reconciliation.reconcileCaptureStatement(db, user.id, { ...period, action: 'confirm', type: record.type, recordId: record.id, fingerprint: record.fingerprint });
      assert.equal((await readiness()).canEnable, true); await mode('AUTOMATIC');
      assert.equal((await readiness()).datePolicy, 'BANK_OPERATION');
      await assert.rejects(configuration.configureCapture(db, user.id, { action: 'automation', cardId: sibling.id, parserKey, mode: 'AUTOMATIC' }), error => error.status === 409);
      assert.equal(await count(), 1);
    });

    await t.test('banco y Wallet en ambos órdenes: un gasto por conciliar; la otra evidencia requiere vínculo explícito', async () => {
      for (const [index, order] of [['bank', 'wallet'], ['wallet', 'bank']].entries()) {
        const amount = `${200 + index}.25`, before = await count();
        const inputs = { bank: event(bankFixture, amount), wallet: event(walletFixture, amount) }, result = {};
        for (const source of order) result[source] = await send(inputs[source]);
        assert.equal(result.bank.status, 'REGISTERED'); assert.equal(result.bank.reason, 'AUTOMATIC');
        assert.equal(result.wallet.status, 'OBSERVED'); assert.equal(result.wallet.expenseId, null);
        const expense = await db.dailyExpense.findUnique({ where: { id: result.bank.expenseId } });
        assert.equal(expense.reconciliationStatus, 'PENDING'); assert.equal(expense.date.toISOString(), '2026-10-20T12:00:00.000Z');
        assert.equal(String(expense.amount), amount); assert.equal(expense.cardId, card.id);
        assert.equal(await count(), before + 1);
        assert.equal((await resolve({ id: result.wallet.id, action: 'link', expenseId: expense.id })).status, 200);
        assert.equal(await count(), before + 1);
      }
    });

    await t.test('ocho entregas simultáneas y respuesta perdida conservan un gasto y el mismo recibo', async () => {
      const input = event(bankFixture, '301.25'), before = await count();
      const responses = await Promise.all(Array.from({ length: 8 }, () => post(input)));
      for (const response of responses) { assert.equal(response.status, 200); assert.deepEqual(response.body, responses[0].body); }
      assert.deepEqual((await post(input)).body, responses[0].body); assert.equal(await count(), before + 1);
      assert.equal(await db.captureEvent.count({ where: { deviceId: device.id, eventId: input.eventId } }), 1);
    });

    await t.test('dos compras iguales conservan multiplicidad y la segunda exige confirmar otra compra', async () => {
      const first = await send(event(bankFixture, '401.25')), second = await send(event(bankFixture, '401.25'));
      assert.equal(first.status, 'REGISTERED'); assert.equal(second.reason, 'POSSIBLE_DUPLICATE');
      const response = await resolve({ id: second.id, action: 'distinct' });
      assert.equal(response.status, 200); assert.notEqual(response.body.movement.expenseId, first.expenseId);
    });

    await t.test('un gasto manual coincidente se revisa y vincularlo conserva sus datos personales', async () => {
      const expense = await db.dailyExpense.create({ data: { userId: user.id, cardId: card.id, categoryId: category.id,
        amount: '402.25', date: new Date('2026-10-20T12:00:00Z'), paymentMethod: 'CARD', concept: 'Concepto personal', notes: 'Nota personal', cashContributionAmount: '2.25' } });
      const before = await count(), movement = await send(event(bankFixture, '402.25'));
      assert.equal(movement.reason, 'POSSIBLE_DUPLICATE'); assert.equal(await count(), before);
      assert.equal((await resolve({ id: movement.id, action: 'link', expenseId: expense.id })).status, 200);
      assert.deepEqual(await db.dailyExpense.findUnique({ where: { id: expense.id } }), expense);
    });

    await t.test('actualizar la misma notificación no crea otra compra', async () => {
      const input = event(bankFixture, '403.25'); await send(input);
      const next = event(bankFixture, '404.25'); next.notificationKeyHash = input.notificationKeyHash;
      const before = await count(), movement = await send(next);
      assert.equal(movement.reason, 'NOTIFICATION_REVISION'); assert.equal(await count(), before);
    });

    await t.test('alias ambiguos o no verificados y tarjeta desconocida bloquean altas sin modificar alias NFC', async () => {
      const collision = await db.captureCardAlias.create({ data: { userId: user.id, cardId: sibling.id, sourcePackage: bankFixture.event.sourcePackage, kind: 'PHYSICAL', value: '0123' } });
      let before = await count();
      for (const fixture of [bankFixture, walletFixture]) assert.equal((await send(event(fixture, '501.25'))).reason, 'AMBIGUOUS_CARD');
      assert.equal((await readiness()).canEnable, false); assert.equal(await count(), before);
      await db.captureCardAlias.delete({ where: { id: collision.id } });
      const unverified = await db.captureCardAlias.create({ data: { userId: user.id, cardId: card.id, sourcePackage: bankFixture.event.sourcePackage, kind: 'PHYSICAL', value: '8888' } });
      assert.equal((await send(event(bankFixture, '502.25', '8888'))).reason, 'UNVERIFIED_ALIAS');
      assert.equal((await send(event(bankFixture, '503.25', '9999'))).reason, 'UNKNOWN_CARD');
      assert.equal(await count(), before); await db.captureCardAlias.delete({ where: { id: unverified.id } });
    });

    await t.test('otra tarjeta no hereda automatización y las credenciales conservan el aislamiento', async () => {
      const movement = await send(event(bankFixture, '504.25', '0456'));
      assert.equal(movement.status, 'OBSERVED'); assert.equal(movement.cardId, sibling.id);
      assert.equal((await resolve({ id: movement.id, action: 'reinterpret' }, 'other')).status, 404);
      const before = await count();
      for (const auth of ['Bearer owner', `Capture ${device.id}.${randomBytes(32).toString('base64url')}`]) assert.equal((await post(event(bankFixture), auth)).status, 401);
      assert.equal((await post({ ...event(bankFixture), userId: other.id })).status, 400);
      assert.equal(await count(), before); assert.equal(await db.dailyExpense.count({ where: { userId: other.id } }), 0);
    });

    await t.test('forzar el modo histórico Wallet v1 no habilita v2; una corrección personal conserva revisión', async () => {
      await db.captureAutomation.create({ data: { userId: user.id, cardId: card.id, parserKey: walletParserKey, mode: 'AUTOMATIC', datePolicy: 'NOTIFICATION_POSTED_AT' } });
      const before = await count(), wallet = await send(event(walletFixture, '601.25'));
      assert.equal(wallet.reason, 'OBSERVATION'); assert.equal(wallet.expenseId, null); assert.equal(await count(), before);
      assert.equal((await resolve({ id: wallet.id, action: 'correct', expectedCorrection: 'null', correction: {
        cardId: card.id, amount: '601.25', date: '2026-10-20', currency: 'MXN', merchant: 'Corrección personal', categoryId: category.id,
      } })).status, 200);
      assert.equal((await send(event(bankFixture, '601.25'))).reason, 'POSSIBLE_DUPLICATE');
      assert.equal(await count(), before); assert.equal((await resolve({ id: wallet.id, action: 'reinterpret' })).status, 409);
      assert.equal((await db.captureMovement.findUnique({ where: { id: wallet.id } })).correction.merchant, 'Corrección personal');
    });

    await t.test('volver a observación detiene futuras altas y conserva gasto piloto, resolución y análisis originales', async () => {
      await mode('OBSERVATION'); const before = await count();
      assert.equal((await send(event(bankFixture, '701.25'))).status, 'OBSERVED'); assert.equal(await count(), before);
      const bank = await read(bankInput);
      assert.equal((await resolve({ id: bank.movementId, action: 'reinterpret' })).status, 409);
      await send(bankInput);
      const after = await read(bankInput);
      assert.deepEqual(after, bank); assert.equal(after.movement.expenseId, pilotExpenseId);
      assert.equal(after.interpretation.reason, 'UNKNOWN_FORMAT'); assert.equal(after.movement.analysisHistory.length, 1);
      assert.equal((await db.captureCardAlias.findFirst({ where: { cardId: card.id, kind: 'WALLET' } })).value, '4242');
    });
  } finally {
    for (const owner of owners) await db.user.delete({ where: { id: owner.id } });
    await db.$disconnect();
  }
});
