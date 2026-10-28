const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomUUID, randomBytes } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { sourceLoader } = require('./helpers/load-source.cjs');
const wallet = require('./fixtures/captures/wallet-banamex2-purchase.es.v1.json');
const bank = require('./fixtures/captures/banamex-joy-card-charge.es.v1.json');
const connectionString = process.env.AFP_TEST_DATABASE_URL;

test('BANAMEX 1/2: mismo Wallet, activación independiente y dos evidencias para un gasto', { skip: !connectionString }, async t => {
  const url = new URL(connectionString);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && /^\/afp_test\w*$/.test(url.pathname) && !url.search);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const [user, other] = await Promise.all(['owner', 'other'].map(name => db.user.create({ data: { email: `banamex2-${name}-${randomUUID()}@example.test` } })));
  const mocks = {
    '@/lib/prisma': { prisma: db }, '@/lib/calendar/schedule': { scheduleCalendarSync: () => {} },
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body: JSON.parse(JSON.stringify(body)), status: options.status || 200, headers: new Headers(options.headers) }) } },
    '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async token => ({ data: { user: token === 'owner' ? user : token === 'other' ? other : null }, error: null }) } }) },
  };
  const load = sourceLoader(mocks), protocol = load('src/lib/captureProtocol.ts');
  const processing = load('src/lib/captureProcessing.ts'), service = load('src/lib/captureService.ts');
  const configuration = load('src/lib/captureConfiguration.ts'), reconciliation = load('src/lib/captureReconciliation.ts');
  const eventsRoute = load('src/app/api/captures/events/route.ts'), movementsRoute = load('src/app/api/captures/movements/route.ts');
  const [first, second] = await Promise.all(['BANAMEX 1', 'BANAMEX 2'].map(name => db.card.create({ data: { userId: user.id, name, usualCutDay: 25, usualDueDay: 15 } })));
  const category = await db.category.create({ data: { userId: user.id, name: 'Compras ficticias' } });
  const secret = randomBytes(32).toString('base64url');
  const device = await db.captureDevice.create({ data: { userId: user.id, name: 'Teléfono ficticio', approvedAt: new Date(), secretHash: protocol.captureHash(secret) } });
  const credential = { id: device.id, secretHash: device.secretHash }, parserKey = 'wallet.banamex-purchase.es.v1';
  const input = (fixture = wallet, amount = '123.45', suffix = '0456') => protocol.validateCaptureEvent({ ...fixture.event,
    contractVersion: 1, eventId: randomUUID(), notificationKeyHash: protocol.captureHash(randomUUID()),
    fields: Object.fromEntries(Object.entries(fixture.event.fields).map(([key, value]) => [key, value.replaceAll('123.45', amount).replaceAll('••0456', `••${suffix}`)])) });
  const read = event => db.captureEvent.findUnique({ where: { deviceId_eventId: { deviceId: device.id, eventId: event.eventId } }, include: { movement: true } });
  const post = (event, authorization = `Capture ${device.id}.${secret}`) => eventsRoute.POST(new Request('http://localhost/api/captures/events', {
    method: 'POST', headers: { authorization, 'Content-Type': 'application/json' }, body: JSON.stringify(event),
  }));
  const send = async event => { assert.equal((await post(event)).status, 200); return (await read(event)).movement; };
  const resolve = (data, token = 'owner') => movementsRoute.PATCH(new Request('http://localhost/api/captures/movements', {
    method: 'PATCH', headers: { authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  }));
  const mode = (card, value, datePolicy) => configuration.configureCapture(db, user.id, { action: 'automation', cardId: card.id, parserKey, mode: value, ...(datePolicy ? { datePolicy } : {}) });
  const review = async movement => {
    const p = movement.proposal;
    assert.equal((await resolve({ id: movement.id, action: 'correct', expectedCorrection: 'null', correction: { cardId: p.cardId, amount: p.amount, date: p.date, currency: p.currency, merchant: p.merchant, categoryId: category.id } })).status, 200);
    const result = await resolve({ id: movement.id, action: 'register' }); assert.equal(result.status, 200); return result.body.movement;
  };
  const reconcile = async movement => {
    const period = { cardId: movement.cardId, startDate: movement.proposal.date, endDate: movement.proposal.date };
    const record = (await reconciliation.captureStatement(db, user.id, period)).records.find(row => row.id === movement.expenseId);
    await reconciliation.reconcileCaptureStatement(db, user.id, { ...period, action: 'confirm', type: record.type, recordId: record.id, fingerprint: record.fingerprint });
  };
  const count = () => db.dailyExpense.count({ where: { userId: user.id } });
  let firstMode, firstPilot, walletInput, bankInput, pilot;
  try {
    for (const [card, kind, value, sourcePackage] of [[first, 'DIGITAL', '0123', bank.event.sourcePackage], [second, 'DIGITAL', '0456', bank.event.sourcePackage],
      [second, 'PHYSICAL', '1010', bank.event.sourcePackage], [first, 'WALLET', '4242', wallet.event.sourcePackage], [second, 'WALLET', '4343', wallet.event.sourcePackage]]) {
      await configuration.configureCapture(db, user.id, { action: 'alias', cardId: card.id, kind, value, sourcePackage, verified: true, evidence: 'Terminación ficticia comprobada' });
    }
    await t.test('BANAMEX 1 habilitada no activa BANAMEX 2; Wallet resuelve ambas con el mismo formato', async () => {
      firstPilot = await review(await send(input(wallet, '100.01', '0123'))); await reconcile(firstPilot);
      firstMode = await mode(first, 'AUTOMATIC', 'NOTIFICATION_POSTED_AT');
      walletInput = input(); const observed = await send(walletInput);
      assert.equal(observed.parserKey, firstPilot.parserKey); assert.equal(observed.cardId, second.id);
      assert.equal(observed.status, 'OBSERVED'); assert.equal(observed.proposal.alias.kind, 'DIGITAL');
      assert.equal(observed.proposal.alias.value, '0456'); assert.equal(observed.proposal.date, '2026-10-20');
      assert.equal(observed.expenseId, null); assert.equal(await count(), 1);
      await assert.rejects(mode(second, 'AUTOMATIC', 'NOTIFICATION_POSTED_AT'), e => e.status === 409);
    });

    await t.test('aviso bancario antes desconocido conserva recibo y original; análisis explícito idempotente sin gasto', async () => {
      const parsers = load('src/lib/captureParsers.ts');
      const old = sourceLoader({ ...mocks, '@/lib/captureParsers': { ...parsers, interpretCapture: () => ({ reason: 'UNKNOWN_FORMAT', proposal: {} }) } })('src/lib/captureService.ts');
      bankInput = input(bank); const receipt = await old.receiveCaptureEvent(db, credential, bankInput), before = await read(bankInput);
      assert.deepEqual((await post(bankInput)).body, JSON.parse(JSON.stringify(receipt))); assert.deepEqual(await read(bankInput), before);
      for (const result of await Promise.all(Array.from({ length: 4 }, () => resolve({ id: before.movementId, action: 'reinterpret' })))) assert.equal(result.status, 200);
      const after = await read(bankInput); assert.equal(after.movement.reason, 'INCOMPLETE_FORMAT'); assert.equal(after.movement.cardId, second.id);
      assert.equal(after.movement.proposal.currency, undefined); assert.equal(after.movement.proposal.evidenceOnly, true);
      assert.equal(after.movement.analysisHistory.length, 1);
      for (const key of ['id', 'eventId', 'requestHash', 'fields', 'interpretation', 'postedAt', 'receivedAt', 'createdAt']) assert.deepEqual(after[key], before[key]);
      assert.equal(await count(), 1);
    });

    await t.test('revisar Wallet registra una compra y el banco se vincula expresamente al mismo gasto', async () => {
      pilot = await review((await read(walletInput)).movement); assert.equal(pilot.status, 'REGISTERED'); assert.equal(await count(), 2);
      assert.equal((await db.dailyExpense.findUnique({ where: { id: pilot.expenseId } })).reconciliationStatus, 'PENDING');
      const bankMovement = (await read(bankInput)).movement;
      const linked = await resolve({ id: bankMovement.id, action: 'link', expenseId: pilot.expenseId });
      assert.equal(linked.status, 200); assert.equal(linked.body.movement.expenseId, pilot.expenseId); assert.equal(await count(), 2);
      assert.equal(linked.body.movement.proposal.currency, undefined);
      await assert.rejects(mode(second, 'AUTOMATIC', 'NOTIFICATION_POSTED_AT'), e => e.status === 409);
    });

    await t.test('cotejo y aceptación de fecha habilitan solo BANAMEX 2 sin alterar la configuración de BANAMEX 1', async () => {
      await reconcile(pilot);
      for (const policy of [undefined, 'BANK_OPERATION']) await assert.rejects(mode(second, 'AUTOMATIC', policy), e => e.status === 409);
      const secondMode = await mode(second, 'AUTOMATIC', 'NOTIFICATION_POSTED_AT'); assert.notEqual(secondMode.id, firstMode.id);
      assert.deepEqual(await db.captureAutomation.findUnique({ where: { id: firstMode.id } }), firstMode);
      assert.deepEqual(await db.captureCardAlias.findMany({ where: { userId: user.id, kind: 'WALLET' }, select: { value: true }, orderBy: { value: 'asc' } }), [{ value: '4242' }, { value: '4343' }]);
    });

    await t.test('ambos órdenes banco/Wallet y nueve entregas API del mismo evento crean un único gasto por compra', async () => {
      for (const [index, order] of [['bank', 'wallet'], ['wallet', 'bank']].entries()) {
        const amount = `${200 + index}.25`, before = await count(), inputs = { bank: input(bank, amount), wallet: input(wallet, amount) }, result = {};
        for (const source of order) {
          if (source === 'wallet') {
            const responses = await Promise.all(Array.from({ length: 8 }, () => post(inputs.wallet)));
            for (const response of responses) { assert.equal(response.status, 200); assert.deepEqual(response.body, responses[0].body); }
            assert.deepEqual((await post(inputs.wallet)).body, responses[0].body); result.wallet = (await read(inputs.wallet)).movement;
          } else result.bank = await send(inputs.bank);
        }
        assert.equal(result.wallet.status, 'REGISTERED'); assert.equal(result.wallet.cardId, second.id);
        assert.equal(result.bank.reason, 'INCOMPLETE_FORMAT'); assert.equal(result.bank.expenseId, null); assert.equal(await count(), before + 1);
        const expense = await db.dailyExpense.findUnique({ where: { id: result.wallet.expenseId } });
        assert.equal(expense.reconciliationStatus, 'PENDING'); assert.equal(expense.date.toISOString(), '2026-10-20T12:00:00.000Z');
        assert.equal((await resolve({ id: result.bank.id, action: 'link', expenseId: expense.id })).status, 200); assert.equal(await count(), before + 1);
      }
    });

    await t.test('importe igual en dos tarjetas conserva dos gastos; sufijos abreviados ambiguos no eligen tarjeta', async () => {
      const a = await send(input(wallet, '301.25', '0123')), b = await send(input(wallet, '301.25'));
      assert.equal(a.cardId, first.id); assert.equal(b.cardId, second.id); assert.notEqual(a.expenseId, b.expenseId);
      const collision = await db.captureCardAlias.create({ data: { userId: user.id, cardId: first.id, sourcePackage: bank.event.sourcePackage, kind: 'PHYSICAL', value: '1456', verifiedAt: new Date() } });
      const before = await count(); assert.equal((await send(input(bank, '302.25'))).reason, 'AMBIGUOUS_CARD');
      assert.equal((await send(input(wallet, '302.25'))).cardId, second.id); assert.equal(await count(), before + 1);
      await db.captureCardAlias.delete({ where: { id: collision.id } });
      const exact = await db.captureCardAlias.create({ data: { userId: user.id, cardId: first.id, sourcePackage: bank.event.sourcePackage, kind: 'PHYSICAL', value: '0456' } });
      const next = await count(); assert.equal((await send(input(wallet, '303.25'))).reason, 'AMBIGUOUS_CARD'); assert.equal(await count(), next);
      await db.captureCardAlias.delete({ where: { id: exact.id } });
    });

    await t.test('compras iguales, correcciones y otros propietarios conservan revisión y datos personales', async () => {
      const registered = await send(input(wallet, '401.25')), repeated = await send(input(wallet, '401.25'));
      assert.equal(repeated.reason, 'POSSIBLE_DUPLICATE'); const distinct = await resolve({ id: repeated.id, action: 'distinct' });
      assert.equal(distinct.status, 200); assert.notEqual(distinct.body.movement.expenseId, registered.expenseId);
      const prior = await db.dailyExpense.create({ data: { userId: user.id, cardId: second.id, categoryId: category.id, date: new Date('2026-10-20T12:00:00Z'), amount: '402.25', paymentMethod: 'CARD', concept: 'Concepto personal', notes: 'Nota conservada', cashContributionAmount: '2.25' } });
      const observed = await send(input(wallet, '402.25')); assert.equal(observed.reason, 'POSSIBLE_DUPLICATE');
      assert.equal((await resolve({ id: observed.id, action: 'link', expenseId: prior.id }, 'other')).status, 404);
      assert.equal((await resolve({ id: observed.id, action: 'link', expenseId: prior.id })).status, 200);
      assert.deepEqual(await db.dailyExpense.findUnique({ where: { id: prior.id } }), prior);
      assert.equal((await post(input(), 'Bearer owner')).status, 401);
      const bankPending = await send(input(bank, '403.25'));
      assert.equal((await resolve({ id: bankPending.id, action: 'correct', expectedCorrection: 'null', correction: { cardId: second.id, amount: '403.25', date: '2026-10-20', currency: 'MXN', merchant: 'Corrección propia', categoryId: category.id } })).status, 200);
      const saved = await db.captureMovement.findUnique({ where: { id: bankPending.id } });
      assert.equal((await resolve({ id: bankPending.id, action: 'reinterpret' })).status, 409);
      assert.deepEqual(await db.captureMovement.findUnique({ where: { id: bankPending.id } }), saved);
      assert.equal((await send(input(wallet, '403.25'))).reason, 'POSSIBLE_DUPLICATE');
    });

    await t.test('el formato JOY bancario no automatiza aun con modo forzado y no puede habilitarse', async () => {
      const bankKey = 'banamex.joy-card-charge.es.v1';
      await assert.rejects(configuration.configureCapture(db, user.id, { action: 'automation', cardId: second.id, parserKey: bankKey, mode: 'AUTOMATIC' }), e => e.status === 409);
      await db.captureAutomation.create({ data: { userId: user.id, cardId: second.id, parserKey: bankKey, mode: 'AUTOMATIC' } });
      const before = await count(); assert.equal((await send(input(bank, '501.25'))).reason, 'INCOMPLETE_FORMAT'); assert.equal(await count(), before);
    });

    await t.test('volver BANAMEX 2 a observación conserva sus evidencias y BANAMEX 1 continúa automática', async () => {
      await mode(second, 'OBSERVATION'); const before = await count();
      assert.equal((await send(input(wallet, '601.25'))).status, 'OBSERVED'); assert.equal(await count(), before);
      assert.equal((await send(input(wallet, '601.25', '0123'))).status, 'REGISTERED'); assert.equal(await count(), before + 1);
      assert.deepEqual(await db.captureAutomation.findUnique({ where: { id: firstMode.id } }), firstMode);
      const original = await read(bankInput); await post(bankInput); assert.deepEqual(await read(bankInput), original);
      assert.equal(original.interpretation.reason, 'UNKNOWN_FORMAT'); assert.equal(original.movement.analysisHistory.length, 1);
      assert.equal(original.movement.expenseId, pilot.expenseId);
    });
  } finally { await db.user.deleteMany({ where: { id: { in: [user.id, other.id] } } }); await db.$disconnect(); }
});
