const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomUUID, randomBytes } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { sourceLoader } = require('./helpers/load-source.cjs');
const wallet = require('./fixtures/captures/wallet-nu-purchase.es.v1.json');
const bank = require('./fixtures/captures/nu-card-purchase.es.v1.json');
const mp = require('./fixtures/captures/mercadopago-card-purchase.es.v1.json');
const connectionString = process.env.AFP_TEST_DATABASE_URL;

test('Nu y Mercado Pago: muestras reales anonimizadas, regla expresa y registro único mediante API/PostgreSQL', { skip: !connectionString }, async t => {
  const url = new URL(connectionString);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && /^\/afp_test\w*$/.test(url.pathname) && !url.search);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const [user, other] = await Promise.all(['owner', 'other'].map(name => db.user.create({ data: { email: `nu-mp-${name}-${randomUUID()}@example.test` } })));
  const mocks = { '@/lib/prisma': { prisma: db }, '@/lib/calendar/schedule': { scheduleCalendarSync: () => {} },
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body: JSON.parse(JSON.stringify(body)), status: options.status || 200, headers: new Headers(options.headers) }) } },
    '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async token => ({ data: { user: token === 'owner' ? user : token === 'other' ? other : null }, error: null }) } }) },
  };
  const load = sourceLoader(mocks), protocol = load('src/lib/captureProtocol.ts');
  const service = load('src/lib/captureService.ts'), processing = load('src/lib/captureProcessing.ts');
  const configuration = load('src/lib/captureConfiguration.ts'), reconciliation = load('src/lib/captureReconciliation.ts');
  const eventsRoute = load('src/app/api/captures/events/route.ts'), configRoute = load('src/app/api/captures/configuration/route.ts');
  const [nu, mercado, second, sibling] = await Promise.all(['NU', 'MERCADOPAGO', 'Otra Mercado Pago', 'Otra Nu'].map(name => db.card.create({ data: { userId: user.id, name, usualCutDay: 25, usualDueDay: 15 } })));
  const category = await db.category.create({ data: { userId: user.id, name: 'Compras ficticias' } });
  const secret = randomBytes(32).toString('base64url');
  const device = await db.captureDevice.create({ data: { userId: user.id, name: 'Teléfono ficticio', approvedAt: new Date(), secretHash: protocol.captureHash(secret) } });
  const credential = { id: device.id, secretHash: device.secretHash }, walletKey = 'wallet.nu-purchase.es.v1', mpKey = 'mercadopago.card-purchase.es.v1';
  const input = (fixture, amount) => protocol.validateCaptureEvent({ ...fixture.event, contractVersion: 1, eventId: randomUUID(), notificationKeyHash: protocol.captureHash(randomUUID()),
    fields: Object.fromEntries(Object.entries(fixture.event.fields).map(([k,v]) => [k, amount ? v.replaceAll(fixture === mp ? '$ 123 ' : '123.45', fixture === mp ? `$ ${amount} ` : amount) : v])) });
  const read = e => db.captureEvent.findUnique({ where: { deviceId_eventId: { deviceId: device.id, eventId: e.eventId } }, include: { movement: true } });
  const post = e => eventsRoute.POST(new Request('http://localhost/api/captures/events', { method: 'POST', headers: { authorization: `Capture ${device.id}.${secret}`, 'Content-Type': 'application/json' }, body: JSON.stringify(e) }));
  const send = async e => { assert.equal((await post(e)).status, 200); return (await read(e)).movement; };
  const configure = (body, token = 'owner') => configRoute.PATCH(new Request('http://localhost/api/captures/configuration', { method: 'PATCH', headers: { authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
  const policy = card => ({ action: 'formatPolicy', cardId: card.id, parserKey: mpKey, completionPolicy: 'MERCADOPAGO_CREDIT_MXN', datePolicy: 'NOTIFICATION_POSTED_AT' });
  const mode = (card, parserKey, value = 'AUTOMATIC', datePolicy) => configuration.configureCapture(db, user.id, { action: 'automation', cardId: card.id, parserKey, mode: value, ...(datePolicy ? { datePolicy } : {}) });
  const review = async m => {
    const p = m.proposal;
    await processing.resolveCaptureMovement(db, user.id, { id: m.id, action: 'correct', expectedCorrection: 'null', correction: { cardId: p.cardId, amount: p.amount, date: p.date, currency: p.currency, merchant: p.merchant, categoryId: category.id } });
    return processing.resolveCaptureMovement(db, user.id, { id: m.id, action: 'register' });
  };
  const reconcile = async m => {
    const period = { cardId: m.cardId, startDate: m.proposal.date, endDate: m.proposal.date };
    const record = (await reconciliation.captureStatement(db, user.id, period)).records.find(r => r.id === m.expenseId);
    await reconciliation.reconcileCaptureStatement(db, user.id, { ...period, action: 'confirm', type: record.type, recordId: record.id, fingerprint: record.fingerprint });
  };
  const count = () => db.dailyExpense.count({ where: { userId: user.id } });
  const originals = {}, oldInputs = {}, pilots = {};
  let firstPolicy, nuCfeBefore;
  try {
    for (const [card, sourcePackage, kind, value] of [[nu, bank.event.sourcePackage, 'DIGITAL', '0123'], [nu, wallet.event.sourcePackage, 'WALLET', '4242'],
      [sibling, bank.event.sourcePackage, 'PHYSICAL', '1010'], [mercado, mp.event.sourcePackage, 'DIGITAL', '0456'], [second, mp.event.sourcePackage, 'PHYSICAL', '0789']]) {
      await configuration.configureCapture(db, user.id, { action: 'alias', cardId: card.id, sourcePackage, kind, value, verified: true, evidence: 'Datos ficticios comprobados' });
    }
    const subscription = await db.subscription.create({ data: { userId: user.id, name: 'CFE ficticia', amount: 200, categoryId: category.id, paymentMethod: 'CASH', chargeDay: 15, frequencyMonths: 2, startMonth: 8, startYear: 2026 } });
    nuCfeBefore = await configuration.configureCapture(db, user.id, { action: 'formatPolicy', cardId: nu.id, parserKey: 'nu.cfe-service-payment.es.v2', completionPolicy: 'NU_CFE_MXN', datePolicy: 'NOTIFICATION_POSTED_AT', subscriptionId: subscription.id });

    await t.test('los avisos desconocidos conservan recibos y los formatos nuevos no generan gastos al publicarse', async () => {
      const parsers = load('src/lib/captureParsers.ts');
      const prior = sourceLoader({ ...mocks, '@/lib/captureParsers': { ...parsers, interpretCapture: () => ({ reason: 'UNKNOWN_FORMAT', proposal: {} }) } })('src/lib/captureService.ts');
      for (const [key, fixture] of Object.entries({ wallet, bank, mp })) {
        const e = oldInputs[key] = input(fixture);
        const receipt = await prior.receiveCaptureEvent(db, credential, e); originals[key] = await read(e);
        assert.deepEqual(JSON.parse(JSON.stringify(await service.receiveCaptureEvent(db, credential, e))), JSON.parse(JSON.stringify(receipt)));
      }
      assert.equal(await count(), 0);
      const pending = await send(input(mp, '100.01')); assert.equal(pending.reason, 'FORMAT_POLICY_REQUIRED'); assert.equal(pending.cardId, null);
      await assert.rejects(mode(mercado, mpKey, 'AUTOMATIC', 'NOTIFICATION_POSTED_AT'), e => e.status === 409);
    });

    await t.test('regla Mercado Pago exige propietario, fuente y fecha expresos; no hereda Nu/CFE ni acepta suscripción', async () => {
      assert.equal((await configure(policy(mercado), 'other')).status, 404);
      assert.equal((await configure(policy(mercado), 'bad-token')).status, 401);
      assert.equal((await configure(policy(nu))).status, 409);
      assert.equal((await configure({ ...policy(mercado), datePolicy: 'BANK_OPERATION' })).status, 400);
      assert.equal((await configure({ ...policy(mercado), completionPolicy: 'NU_CFE_MXN' })).status, 400);
      assert.equal((await configure({ ...policy(mercado), subscriptionId: subscription.id })).status, 400);
      assert.equal((await configure(policy(mercado))).status, 200);
      firstPolicy = await db.captureAutomation.findFirst({ where: { userId: user.id, parserKey: mpKey } });
      assert.equal(firstPolicy.mode, 'OBSERVATION'); assert.equal(firstPolicy.policySubscriptionId, null);
      assert.equal((await configure(policy(mercado))).status, 200);
      assert.deepEqual(await db.captureAutomation.findUnique({ where: { id: firstPolicy.id } }), firstPolicy);
      assert.equal(await count(), 0);
    });

    await t.test('reinterpretar añade historial explícito idempotente y deja intactos originales; Mercado Pago usa regla, Nu su alias', async () => {
      for (const key of ['wallet', 'bank', 'mp']) {
        pilots[key] = await processing.resolveCaptureMovement(db, user.id, { id: originals[key].movementId, action: 'reinterpret' });
        await processing.resolveCaptureMovement(db, user.id, { id: originals[key].movementId, action: 'reinterpret' });
        const now = await read(oldInputs[key]);
        for (const field of ['fields', 'interpretation', 'requestHash', 'createdAt']) assert.deepEqual(now[field], originals[key][field]);
        assert.equal(now.movement.analysisHistory.length, 1);
      }
      assert.equal(pilots.wallet.status, 'OBSERVED'); assert.equal(pilots.wallet.cardId, nu.id); assert.equal(pilots.wallet.proposal.alias.kind, 'DIGITAL');
      assert.equal(pilots.bank.status, 'REVIEW'); assert.equal(pilots.bank.proposal.currency, undefined); assert.equal(pilots.bank.proposal.evidenceOnly, true);
      assert.equal(pilots.mp.status, 'OBSERVED'); assert.equal(pilots.mp.cardId, mercado.id); assert.equal(pilots.mp.proposal.currency, 'MXN');
      assert.equal(pilots.mp.proposal.cardSource, 'OWNER_FORMAT_POLICY'); assert.equal(pilots.mp.proposal.currencySource, 'OWNER_FORMAT_POLICY');
      assert.equal(pilots.mp.proposal.subscriptionId, undefined); assert.equal(pilots.mp.proposal.date, '2026-10-20');
      assert.equal(await count(), 0);
    });

    await t.test('cada piloto exige revisión, cotejo y fecha aceptada antes de habilitar; Nu enlaza ambas fuentes a un gasto', async () => {
      for (const [key, card, parser] of [['wallet', nu, walletKey], ['mp', mercado, mpKey]]) {
        pilots[key] = await review(pilots[key]);
        await assert.rejects(mode(card, parser, 'AUTOMATIC', 'NOTIFICATION_POSTED_AT'), e => e.status === 409);
        await reconcile(pilots[key]);
        await assert.rejects(mode(card, parser), e => e.status === 409);
        await mode(card, parser, 'AUTOMATIC', 'NOTIFICATION_POSTED_AT');
      }
      const linked = await processing.resolveCaptureMovement(db, user.id, { id: pilots.bank.id, action: 'link', expenseId: pilots.wallet.expenseId });
      assert.equal(linked.expenseId, pilots.wallet.expenseId); assert.equal(await count(), 2);
      assert.equal((await db.dailyExpense.findUnique({ where: { id: pilots.mp.expenseId } })).subscriptionId, null);
      assert.equal(await db.subscriptionCharge.count({ where: { userId: user.id } }), 0);
      assert.equal((await service.getCaptureDevice(db, credential)).configuration.automaticExpenses, true);
    });

    await t.test('Nu: banco antes/después de Wallet, ocho entregas y reintento conservan un solo gasto por compra', async () => {
      for (const [amount, bankFirst] of [['201.01', true], ['202.02', false]]) {
        const before = await count(), bankEvent = input(bank, amount), walletEvent = input(wallet, amount);
        if (bankFirst) assert.equal((await send(bankEvent)).expenseId, null);
        const receipts = await Promise.all(Array.from({ length: 8 }, () => post(walletEvent)));
        for (const receipt of receipts) { assert.equal(receipt.status, 200); assert.deepEqual(receipt.body, receipts[0].body); }
        assert.deepEqual((await post(walletEvent)).body, receipts[0].body);
        if (!bankFirst) assert.equal((await send(bankEvent)).expenseId, null);
        assert.equal((await read(walletEvent)).movement.status, 'REGISTERED'); assert.equal(await count(), before + 1);
        assert.equal((await read(bankEvent)).movement.status, 'REVIEW');
      }
      await assert.rejects(mode(nu, 'nu.card-purchase.es.v1', 'AUTOMATIC', 'NOTIFICATION_POSTED_AT'), e => e.status === 409);
    });

    await t.test('Mercado Pago: concurrencia y respuesta perdida crean un gasto pendiente, sin cobro de suscripción ni abono', async () => {
      const before = await count(), event = input(mp, '201.01');
      const receipts = await Promise.all(Array.from({ length: 8 }, () => post(event)));
      for (const receipt of receipts) { assert.equal(receipt.status, 200); assert.deepEqual(receipt.body, receipts[0].body); }
      assert.deepEqual((await post(event)).body, receipts[0].body);
      const m = (await read(event)).movement, expense = await db.dailyExpense.findUnique({ where: { id: m.expenseId } });
      assert.equal(m.status, 'REGISTERED'); assert.equal(expense.cardId, mercado.id); assert.equal(String(expense.amount), '201.01');
      assert.equal(expense.reconciliationStatus, 'PENDING'); assert.equal(expense.subscriptionId, null); assert.equal(await count(), before + 1);
      assert.equal(await db.cardCyclePayment.count({ where: { userId: user.id } }), 0);
      assert.equal(await db.subscriptionCharge.count({ where: { userId: user.id } }), 0);
    });

    await t.test('compras repetidas, revisiones y monedas contradictorias quedan por revisar; iguales importes en tarjetas distintas se separan', async () => {
      const before = await count();
      assert.equal((await send(input(mp, '201.01'))).reason, 'POSSIBLE_DUPLICATE');
      const foreign = input(mp, '303.03'); foreign.fields['android.subText'] = 'USD';
      assert.equal((await send(foreign)).reason, 'FOREIGN_CURRENCY');
      const first = input(mp, '304.04'); await send(first);
      assert.equal((await send({ ...input(mp, '305.05'), notificationKeyHash: first.notificationKeyHash })).reason, 'NOTIFICATION_REVISION');
      assert.equal(await count(), before + 1);
      assert.equal((await send(input(wallet, '304.04'))).status, 'REGISTERED'); assert.equal(await count(), before + 2);
    });

    await t.test('alias Nu ambiguo y número NFC no sustituyen el alias bancario; correcciones personales conservadas', async () => {
      const before = await count();
      await configuration.configureCapture(db, user.id, { action: 'alias', cardId: sibling.id, sourcePackage: bank.event.sourcePackage, kind: 'PHYSICAL', value: '0123', verified: true, evidence: 'Colisión ficticia' });
      assert.equal((await send(input(wallet, '401.01'))).reason, 'AMBIGUOUS_CARD');
      const wrong = input(wallet, '402.02'); wrong.fields['android.text'] = wrong.fields['android.text'].replace('0123', '4242');
      assert.equal((await send(wrong)).reason, 'UNKNOWN_CARD');
      assert.equal(await count(), before);
      const m = await send(input(mp, '403.03'));
      await assert.rejects(processing.resolveCaptureMovement(db, other.id, { id: m.id, action: 'reinterpret' }), e => e.status === 404);
      await assert.rejects(processing.resolveCaptureMovement(db, user.id, { id: pilots.wallet.id, action: 'reinterpret' }), e => e.status === 409);
    });

    await t.test('cambiar destinatario Mercado Pago detiene el formato, invalida propuestas previas y conserva Nu/CFE', async () => {
      await mode(mercado, mpKey, 'OBSERVATION');
      const pending = await send(input(mp, '501.01')); assert.equal(pending.status, 'OBSERVED');
      assert.equal((await configure(policy(second))).status, 200);
      const policies = await db.captureAutomation.findMany({ where: { userId: user.id, parserKey: mpKey } });
      assert.equal(policies.filter(p => p.completionPolicy).length, 1); assert.ok(policies.every(p => p.mode === 'OBSERVATION'));
      await assert.rejects(mode(second, mpKey, 'AUTOMATIC', 'NOTIFICATION_POSTED_AT'), e => e.status === 409);
      const result = await review(pending); assert.equal(result.reason, 'FORMAT_POLICY_REQUIRED'); assert.equal(result.expenseId, null);
      const fresh = await send(input(mp, '502.02')); assert.equal(fresh.cardId, second.id); assert.equal(fresh.status, 'OBSERVED');
      assert.deepEqual(await db.captureAutomation.findUnique({ where: { id: nuCfeBefore.id } }), nuCfeBefore);
      assert.equal(await db.dailyExpense.count({ where: { userId: other.id } }), 0);
    });
  } finally { await db.user.deleteMany({ where: { id: { in: [user.id, other.id] } } }); await db.$disconnect(); }
});
