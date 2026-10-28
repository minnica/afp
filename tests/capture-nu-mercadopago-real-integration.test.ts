import type { CaptureConfigurationResult } from './helpers/integration-fixtures';
import { array,record as objectValue } from './helpers/dynamic-values';
import { plain,present,sparseCalculations,stringValue } from './helpers/financial-fixtures';

import type { CaptureInput,IntegrationMocks,NoticeSample } from './helpers/integration-fixtures';

import { parseJson,integrationLoader as sourceLoader } from './helpers/integration-fixtures';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { test } from 'node:test';

import mp from './fixtures/captures/mercadopago-card-purchase.es.v1.json';
import bank from './fixtures/captures/nu-card-purchase.es.v1.json';
import wallet from './fixtures/captures/wallet-nu-purchase.es.v1.json';
const connectionString = process.env.AFP_TEST_DATABASE_URL;

test('Nu y Mercado Pago: muestras reales anonimizadas, regla expresa y registro único mediante API/PostgreSQL', { skip: !connectionString }, async t => {
  const url = new URL(present(connectionString));
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && /^\/afp_test\w*$/.test(url.pathname) && !url.search);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const [user, other] = await Promise.all(['owner', 'other'].map(name => db.user.create({ data: { email: `nu-mp-${name}-${randomUUID()}@example.test` } })));
  const mocks: IntegrationMocks = { '@/lib/prisma': { prisma: db }, '@/lib/calendar/schedule': { scheduleCalendarSync: () => {} },
    'next/server': { NextResponse: { json: (body: unknown, options = {}) => ({ body: plain(body), status: options.status || 200, headers: new Headers(options.headers) }) } },
    '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async token => ({ data: { user: token === 'owner' ? user : token === 'other' ? other : null }, error: null }) } }) },
  };
  const load = sourceLoader(mocks), protocol = sparseCalculations(load('src/lib/captureProtocol.ts'));
  const service = load('src/lib/captureService.ts'), processing = load('src/lib/captureProcessing.ts');
  const configuration = load('src/lib/captureConfiguration.ts'), reconciliation = load('src/lib/captureReconciliation.ts');
  const eventsRoute = load('src/app/api/captures/events/route.ts'), configRoute = load('src/app/api/captures/configuration/route.ts');
  const [nu, mercado, second, sibling] = await Promise.all(['NU', 'MERCADOPAGO', 'Otra Mercado Pago', 'Otra Nu'].map(name => db.card.create({ data: { userId: present(user).id, name, usualCutDay: 25, usualDueDay: 15 } })));
  const category = await db.category.create({ data: { userId: present(user).id, name: 'Compras ficticias' } });
  const secret = randomBytes(32).toString('base64url');
  const device = await db.captureDevice.create({ data: { userId: present(user).id, name: 'Teléfono ficticio', approvedAt: new Date(), secretHash: protocol.captureHash(secret) } });
  const credential = { id: device.id, secretHash: device.secretHash }, walletKey = 'wallet.nu-purchase.es.v1', mpKey = 'mercadopago.card-purchase.es.v1';
  const input = (fixture: NoticeSample, amount?: string) => protocol.validateCaptureEvent({ ...fixture.event, contractVersion: 1 as const, eventId: randomUUID(), notificationKeyHash: protocol.captureHash(randomUUID()),
    fields: Object.fromEntries(Object.entries(fixture.event.fields).map(([k,v]) => [k, amount ? v.replaceAll(fixture === mp ? '$ 123 ' : '123.45', fixture === mp ? `$ ${amount} ` : amount) : v])) });
  const read = (e: Pick<CaptureInput, 'eventId'>) => db.captureEvent.findUnique({ where: { deviceId_eventId: { deviceId: device.id, eventId: e.eventId } }, include: { movement: true } });
  const post = (e: unknown) => eventsRoute.POST(new Request('http://localhost/api/captures/events', { method: 'POST', headers: { authorization: `Capture ${device.id}.${secret}`, 'Content-Type': 'application/json' }, body: JSON.stringify(e) }));
  const send = async (e: CaptureInput) => { assert.equal((await post(e)).status, 200); return present((await read(e))).movement; };
  const configure = (body: unknown, token = 'owner') => configRoute.PATCH(new Request('http://localhost/api/captures/configuration', { method: 'PATCH', headers: { authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
  const policy = (card: import('@prisma/client').Card | undefined) => ({ action: 'formatPolicy', cardId: present(card).id, parserKey: mpKey, completionPolicy: 'MERCADOPAGO_CREDIT_MXN', datePolicy: 'NOTIFICATION_POSTED_AT' });
  const mode = (card: Pick<import('@prisma/client').Card, 'id'> | undefined, parserKey: string, value = 'AUTOMATIC', datePolicy?: string) => configuration.configureCapture(db, present(user).id, { action: 'automation', cardId: present(card).id, parserKey, mode: value, ...(datePolicy ? { datePolicy } : {}) });
  const review = async (m: unknown) => {
    const p = objectValue(present(m)).proposal;
    await processing.resolveCaptureMovement(db, present(user).id, { id: objectValue(present(m)).id, action: 'correct', expectedCorrection: 'null', correction: { cardId: objectValue(present(p)).cardId, amount: objectValue(present(p)).amount, date: objectValue(present(p)).date, currency: objectValue(present(p)).currency, merchant: objectValue(present(p)).merchant, categoryId: category.id } });
    return processing.resolveCaptureMovement(db, present(user).id, { id: objectValue(present(m)).id, action: 'register' });
  };
  const reconcile = async (m: unknown) => {
    const period = { cardId: objectValue(m).cardId, startDate: objectValue(objectValue(m).proposal).date, endDate: objectValue(objectValue(m).proposal).date };
    const record = (await reconciliation.captureStatement(db, present(user).id, period)).records.find(r => r.id === objectValue(m).expenseId);
    await reconciliation.reconcileCaptureStatement(db, present(user).id, { ...period, action: 'confirm', type: present(record).type, recordId: present(record).id, fingerprint: present(record).fingerprint });
  };
  const count = () => db.dailyExpense.count({ where: { userId: present(user).id } });
  const originals: Record<string, unknown> = {}, oldInputs: Record<string, CaptureInput> = {}, pilots: Record<string, unknown> = {};
  let firstPolicy: { userId: string; id: string; cardId: string; parserKey: string; mode: string; completionPolicy: string | null; policyAcceptedAt: Date | null; datePolicy: string; policySubscriptionId: string | null; } | null, nuCfeBefore: CaptureConfigurationResult;
  try {
    for (const [card, sourcePackage, kind, value] of [[nu, bank.event.sourcePackage, 'DIGITAL', '0123'], [nu, wallet.event.sourcePackage, 'WALLET', '4242'],
      [sibling, bank.event.sourcePackage, 'PHYSICAL', '1010'], [mercado, mp.event.sourcePackage, 'DIGITAL', '0456'], [second, mp.event.sourcePackage, 'PHYSICAL', '0789']] as const) {
      await configuration.configureCapture(db, present(user).id, { action: 'alias', cardId: present(card).id, sourcePackage, kind, value, verified: true, evidence: 'Datos ficticios comprobados' });
    }
    const subscription = await db.subscription.create({ data: { userId: present(user).id, name: 'CFE ficticia', amount: 200, categoryId: category.id, paymentMethod: 'CASH', chargeDay: 15, frequencyMonths: 2, startMonth: 8, startYear: 2026 } });
    nuCfeBefore = await configuration.configureCapture(db, present(user).id, { action: 'formatPolicy', cardId: present(nu).id, parserKey: 'nu.cfe-service-payment.es.v2', completionPolicy: 'NU_CFE_MXN', datePolicy: 'NOTIFICATION_POSTED_AT', subscriptionId: subscription.id });

    await t.test('los avisos desconocidos conservan recibos y los formatos nuevos no generan gastos al publicarse', async () => {
      const parsers = sparseCalculations(load('src/lib/captureParsers.ts'));
      const prior = sourceLoader({ ...mocks, '@/lib/captureParsers': { ...parsers, interpretCapture: () => ({ reason: 'UNKNOWN_FORMAT', proposal: {} }) } })('src/lib/captureService.ts');
      for (const [key, fixture] of Object.entries({ wallet, bank, mp })) {
        const e = oldInputs[key] = input(fixture);
        const receipt = await prior.receiveCaptureEvent(db, credential, e); originals[key] = await read(e);
        assert.deepEqual(parseJson(JSON.stringify(await service.receiveCaptureEvent(db, credential, e))), plain(receipt));
      }
      assert.equal(await count(), 0);
      const pending = await send(input(mp, '100.01')); assert.equal(present(pending).reason, 'FORMAT_POLICY_REQUIRED'); assert.equal(present(pending).cardId, null);
      await assert.rejects(mode(mercado, mpKey, 'AUTOMATIC', 'NOTIFICATION_POSTED_AT'), e => objectValue(e).status === 409);
    });

    await t.test('regla Mercado Pago exige propietario, fuente y fecha expresos; no hereda Nu/CFE ni acepta suscripción', async () => {
      assert.equal((await configure(policy(mercado), 'other')).status, 404);
      assert.equal((await configure(policy(mercado), 'bad-token')).status, 401);
      assert.equal((await configure(policy(nu))).status, 409);
      assert.equal((await configure({ ...policy(mercado), datePolicy: 'BANK_OPERATION' })).status, 400);
      assert.equal((await configure({ ...policy(mercado), completionPolicy: 'NU_CFE_MXN' })).status, 400);
      assert.equal((await configure({ ...policy(mercado), subscriptionId: subscription.id })).status, 400);
      assert.equal((await configure(policy(mercado))).status, 200);
      firstPolicy = await db.captureAutomation.findFirst({ where: { userId: present(user).id, parserKey: mpKey } });
      assert.equal(present(firstPolicy).mode, 'OBSERVATION'); assert.equal(present(firstPolicy).policySubscriptionId, null);
      assert.equal((await configure(policy(mercado))).status, 200);
      assert.deepEqual(await db.captureAutomation.findUnique({ where: { id: present(firstPolicy).id } }), firstPolicy);
      assert.equal(await count(), 0);
    });

    await t.test('reinterpretar añade historial explícito idempotente y deja intactos originales; Mercado Pago usa regla, Nu su alias', async () => {
      for (const key of ['wallet', 'bank', 'mp'] as const) {
        pilots[key] = await processing.resolveCaptureMovement(db, present(user).id, { id: objectValue(originals[key]).movementId, action: 'reinterpret' });
        await processing.resolveCaptureMovement(db, present(user).id, { id: objectValue(originals[key]).movementId, action: 'reinterpret' });
        const now = await read(present(oldInputs[key]));
        for (const field of ['fields', 'interpretation', 'requestHash', 'createdAt'] as const) assert.deepEqual(present(now)[field], objectValue(originals[key])[field]);
        assert.equal(array(present(present(now).movement).analysisHistory).length, 1);
      }
      assert.equal(objectValue(pilots.wallet).status, 'OBSERVED'); assert.equal(objectValue(pilots.wallet).cardId, present(nu).id); assert.equal(objectValue(objectValue(objectValue(pilots.wallet).proposal).alias).kind, 'DIGITAL');
      assert.equal(objectValue(pilots.bank).status, 'REVIEW'); assert.equal(objectValue(objectValue(pilots.bank).proposal).currency, undefined); assert.equal(objectValue(objectValue(pilots.bank).proposal).evidenceOnly, true);
      assert.equal(objectValue(pilots.mp).status, 'OBSERVED'); assert.equal(objectValue(pilots.mp).cardId, present(mercado).id); assert.equal(objectValue(objectValue(pilots.mp).proposal).currency, 'MXN');
      assert.equal(objectValue(objectValue(pilots.mp).proposal).cardSource, 'OWNER_FORMAT_POLICY'); assert.equal(objectValue(objectValue(pilots.mp).proposal).currencySource, 'OWNER_FORMAT_POLICY');
      assert.equal(objectValue(objectValue(pilots.mp).proposal).subscriptionId, undefined); assert.equal(objectValue(objectValue(pilots.mp).proposal).date, '2026-10-20');
      assert.equal(await count(), 0);
    });

    await t.test('cada piloto exige revisión, cotejo y fecha aceptada antes de habilitar; Nu enlaza ambas fuentes a un gasto', async () => {
      for (const [key, card, parser] of [['wallet', nu, walletKey], ['mp', mercado, mpKey]] as const) {
        pilots[key] = await review(pilots[key]);
        await assert.rejects(mode(card, parser, 'AUTOMATIC', 'NOTIFICATION_POSTED_AT'), e => objectValue(e).status === 409);
        await reconcile(pilots[key]);
        await assert.rejects(mode(card, parser), e => objectValue(e).status === 409);
        await mode(card, parser, 'AUTOMATIC', 'NOTIFICATION_POSTED_AT');
      }
      const linked = await processing.resolveCaptureMovement(db, present(user).id, { id: objectValue(pilots.bank).id, action: 'link', expenseId: objectValue(pilots.wallet).expenseId });
      assert.equal(present(linked).expenseId, objectValue(pilots.wallet).expenseId); assert.equal(await count(), 2);
      assert.equal(present((await db.dailyExpense.findUnique({ where: { id: stringValue(objectValue(objectValue(pilots).mp).expenseId) } }))).subscriptionId, null);
      assert.equal(await db.subscriptionCharge.count({ where: { userId: present(user).id } }), 0);
      assert.equal((await service.getCaptureDevice(db, credential)).configuration.automaticExpenses, true);
    });

    await t.test('Nu: banco antes/después de Wallet, ocho entregas y reintento conservan un solo gasto por compra', async () => {
      for (const [amount, bankFirst] of [['201.01', true], ['202.02', false]] as const) {
        const before = await count(), bankEvent = input(bank, amount), walletEvent = input(wallet, amount);
        if (bankFirst) assert.equal(present((await send(bankEvent))).expenseId, null);
        const receipts = await Promise.all(Array.from({ length: 8 }, () => post(walletEvent)));
        for (const receipt of receipts) { assert.equal(receipt.status, 200); assert.deepEqual(receipt.body, present(receipts[0]).body); }
        assert.deepEqual((await post(walletEvent)).body, present(receipts[0]).body);
        if (!bankFirst) assert.equal(present((await send(bankEvent))).expenseId, null);
        assert.equal(present(present((await read(walletEvent))).movement).status, 'REGISTERED'); assert.equal(await count(), before + 1);
        assert.equal(present(present((await read(bankEvent))).movement).status, 'REVIEW');
      }
      await assert.rejects(mode(nu, 'nu.card-purchase.es.v1', 'AUTOMATIC', 'NOTIFICATION_POSTED_AT'), e => objectValue(e).status === 409);
    });

    await t.test('Mercado Pago: concurrencia y respuesta perdida crean un gasto pendiente, sin cobro de suscripción ni abono', async () => {
      const before = await count(), event = input(mp, '201.01');
      const receipts = await Promise.all(Array.from({ length: 8 }, () => post(event)));
      for (const receipt of receipts) { assert.equal(receipt.status, 200); assert.deepEqual(receipt.body, present(receipts[0]).body); }
      assert.deepEqual((await post(event)).body, present(receipts[0]).body);
      const m = present((await read(event))).movement, expense = await db.dailyExpense.findUnique({ where: { id: present(present(m).expenseId) } });
      assert.equal(present(m).status, 'REGISTERED'); assert.equal(present(expense).cardId, present(mercado).id); assert.equal(String(present(expense).amount), '201.01');
      assert.equal(present(expense).reconciliationStatus, 'PENDING'); assert.equal(present(expense).subscriptionId, null); assert.equal(await count(), before + 1);
      assert.equal(await db.cardCyclePayment.count({ where: { userId: present(user).id } }), 0);
      assert.equal(await db.subscriptionCharge.count({ where: { userId: present(user).id } }), 0);
    });

    await t.test('compras repetidas, revisiones y monedas contradictorias quedan por revisar; iguales importes en tarjetas distintas se separan', async () => {
      const before = await count();
      assert.equal(present((await send(input(mp, '201.01')))).reason, 'POSSIBLE_DUPLICATE');
      const foreign = input(mp, '303.03'); foreign.fields['android.subText'] = 'USD';
      assert.equal(present((await send(foreign))).reason, 'FOREIGN_CURRENCY');
      const first = input(mp, '304.04'); await send(first);
      assert.equal(present((await send({ ...input(mp, '305.05'), notificationKeyHash: first.notificationKeyHash }))).reason, 'NOTIFICATION_REVISION');
      assert.equal(await count(), before + 1);
      assert.equal(present((await send(input(wallet, '304.04')))).status, 'REGISTERED'); assert.equal(await count(), before + 2);
    });

    await t.test('alias Nu ambiguo y número NFC no sustituyen el alias bancario; correcciones personales conservadas', async () => {
      const before = await count();
      await configuration.configureCapture(db, present(user).id, { action: 'alias', cardId: present(sibling).id, sourcePackage: bank.event.sourcePackage, kind: 'PHYSICAL', value: '0123', verified: true, evidence: 'Colisión ficticia' });
      assert.equal(present((await send(input(wallet, '401.01')))).reason, 'AMBIGUOUS_CARD');
      const wrong = input(wallet, '402.02'); wrong.fields['android.text'] = present(wrong.fields['android.text']).replace('0123', '4242');
      assert.equal(present((await send(wrong))).reason, 'UNKNOWN_CARD');
      assert.equal(await count(), before);
      const m = await send(input(mp, '403.03'));
      await assert.rejects(processing.resolveCaptureMovement(db, present(other).id, { id: present(m).id, action: 'reinterpret' }), e => objectValue(e).status === 404);
      await assert.rejects(processing.resolveCaptureMovement(db, present(user).id, { id: objectValue(pilots.wallet).id, action: 'reinterpret' }), e => objectValue(e).status === 409);
    });

    await t.test('cambiar destinatario Mercado Pago detiene el formato, invalida propuestas previas y conserva Nu/CFE', async () => {
      await mode(mercado, mpKey, 'OBSERVATION');
      const pending = await send(input(mp, '501.01')); assert.equal(present(pending).status, 'OBSERVED');
      assert.equal((await configure(policy(second))).status, 200);
      const policies = await db.captureAutomation.findMany({ where: { userId: present(user).id, parserKey: mpKey } });
      assert.equal(policies.filter(p => p.completionPolicy).length, 1); assert.ok(policies.every(p => p.mode === 'OBSERVATION'));
      await assert.rejects(mode(second, mpKey, 'AUTOMATIC', 'NOTIFICATION_POSTED_AT'), e => objectValue(e).status === 409);
      const result = await review(pending); assert.equal(present(result).reason, 'FORMAT_POLICY_REQUIRED'); assert.equal(present(result).expenseId, null);
      const fresh = await send(input(mp, '502.02')); assert.equal(present(fresh).cardId, present(second).id); assert.equal(present(fresh).status, 'OBSERVED');
      assert.deepEqual(await db.captureAutomation.findUnique({ where: { id: stringValue(objectValue(nuCfeBefore).id) } }), nuCfeBefore);
      assert.equal(await db.dailyExpense.count({ where: { userId: present(other).id } }), 0);
    });
  } finally { await db.user.deleteMany({ where: { id: { in: [present(user).id, present(other).id] } } }); await db.$disconnect(); }
});
