import type { CaptureConfigurationResult } from './helpers/integration-fixtures';
import { array,record as objectValue } from './helpers/dynamic-values';
import { plain,present,sparseCalculations,stringValue } from './helpers/financial-fixtures';

import type { CaptureInput,IntegrationMocks,NoticeSample } from './helpers/integration-fixtures';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { test } from 'node:test';
import bank from './fixtures/captures/banamex-joy-card-charge.es.v1.json';
import wallet from './fixtures/captures/wallet-banamex2-purchase.es.v1.json';
import { integrationLoader as sourceLoader } from './helpers/integration-fixtures';
const connectionString = process.env.AFP_TEST_DATABASE_URL;

test('BANAMEX 1/2: mismo Wallet, activación independiente y dos evidencias para un gasto', { skip: !connectionString }, async t => {
  const url = new URL(present(connectionString));
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && /^\/afp_test\w*$/.test(url.pathname) && !url.search);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const [user, other] = await Promise.all(['owner', 'other'].map(name => db.user.create({ data: { email: `banamex2-${name}-${randomUUID()}@example.test` } })));
  const mocks: IntegrationMocks = {
    '@/lib/prisma': { prisma: db }, '@/lib/calendar/schedule': { scheduleCalendarSync: () => {} },
    'next/server': { NextResponse: { json: (body: unknown, options = {}) => ({ body: plain(body), status: options.status || 200, headers: new Headers(options.headers) }) } },
    '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async token => ({ data: { user: token === 'owner' ? user : token === 'other' ? other : null }, error: null }) } }) },
  };
  const load = sourceLoader(mocks), protocol = sparseCalculations(load('src/lib/captureProtocol.ts'));
  load('src/lib/captureProcessing.ts');
load('src/lib/captureService.ts');
  const configuration = load('src/lib/captureConfiguration.ts'), reconciliation = load('src/lib/captureReconciliation.ts');
  const eventsRoute = load('src/app/api/captures/events/route.ts'), movementsRoute = load('src/app/api/captures/movements/route.ts');
  const [first, second] = await Promise.all(['BANAMEX 1', 'BANAMEX 2'].map(name => db.card.create({ data: { userId: present(user).id, name, usualCutDay: 25, usualDueDay: 15 } })));
  const category = await db.category.create({ data: { userId: present(user).id, name: 'Compras ficticias' } });
  const secret = randomBytes(32).toString('base64url');
  const device = await db.captureDevice.create({ data: { userId: present(user).id, name: 'Teléfono ficticio', approvedAt: new Date(), secretHash: protocol.captureHash(secret) } });
  const credential = { id: device.id, secretHash: device.secretHash }, parserKey = 'wallet.banamex-purchase.es.v1';
  const input = (fixture: NoticeSample = wallet, amount = '123.45', suffix = '0456') => protocol.validateCaptureEvent({ ...fixture.event,
    contractVersion: 1 as const, eventId: randomUUID(), notificationKeyHash: protocol.captureHash(randomUUID()),
    fields: Object.fromEntries(Object.entries(fixture.event.fields).map(([key, value]) => [key, value.replaceAll('123.45', amount).replaceAll('••0456', `••${suffix}`)])) });
  const read = (event: Pick<CaptureInput, 'eventId'>) => db.captureEvent.findUnique({ where: { deviceId_eventId: { deviceId: device.id, eventId: event.eventId } }, include: { movement: true } });
  const post = (event: unknown, authorization = `Capture ${device.id}.${secret}`) => eventsRoute.POST(new Request('http://localhost/api/captures/events', {
    method: 'POST', headers: { authorization, 'Content-Type': 'application/json' }, body: JSON.stringify(event),
  }));
  const send = async (event: CaptureInput) => { assert.equal((await post(event)).status, 200); return present((await read(event))).movement; };
  const resolve = (data: { id: string | null; action: string; } | { id: string; action: string; } | { id: string; action: string; expenseId: string; } | { id: string; action: string; expectedCorrection: string; correction: { cardId: string; amount: string; date: string; currency: string; merchant: string; categoryId: string; }; }, token = 'owner') => movementsRoute.PATCH(new Request('http://localhost/api/captures/movements', {
    method: 'PATCH', headers: { authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  }));
  const mode = (card: Pick<import('@prisma/client').Card, 'id'> | undefined, value: string, datePolicy?: string) => configuration.configureCapture(db, present(user).id, { action: 'automation', cardId: present(card).id, parserKey, mode: value, ...(datePolicy ? { datePolicy } : {}) });
  const review = async (movement: unknown) => {
    const p = objectValue(present(movement)).proposal;
    assert.equal((await resolve({ id: stringValue(objectValue(present(movement)).id), action: 'correct', expectedCorrection: 'null', correction: { cardId: stringValue(objectValue(present(p)).cardId), amount: stringValue(objectValue(present(p)).amount), date: stringValue(objectValue(present(p)).date), currency: stringValue(objectValue(present(p)).currency), merchant: stringValue(objectValue(present(p)).merchant), categoryId: category.id } })).status, 200);
    const result = await resolve({ id: stringValue(objectValue(present(movement)).id), action: 'register' }); assert.equal(result.status, 200); return result.body.movement;
  };
  const reconcile = async (movement: unknown) => {
    const period = { cardId: objectValue(movement).cardId, startDate: objectValue(objectValue(movement).proposal).date, endDate: objectValue(objectValue(movement).proposal).date };
    const record = (await reconciliation.captureStatement(db, present(user).id, period)).records.find(row => row.id === objectValue(movement).expenseId);
    await reconciliation.reconcileCaptureStatement(db, present(user).id, { ...period, action: 'confirm', type: present(record).type, recordId: present(record).id, fingerprint: present(record).fingerprint });
  };
  const count = () => db.dailyExpense.count({ where: { userId: present(user).id } });
  let firstMode: CaptureConfigurationResult, firstPilot, walletInput: CaptureInput, bankInput: CaptureInput, pilot: unknown;
  try {
    for (const [card, kind, value, sourcePackage] of [[first, 'DIGITAL', '0123', bank.event.sourcePackage], [second, 'DIGITAL', '0456', bank.event.sourcePackage],
      [second, 'PHYSICAL', '1010', bank.event.sourcePackage], [first, 'WALLET', '4242', wallet.event.sourcePackage], [second, 'WALLET', '4343', wallet.event.sourcePackage]] as const) {
      await configuration.configureCapture(db, present(user).id, { action: 'alias', cardId: present(card).id, kind, value, sourcePackage, verified: true, evidence: 'Terminación ficticia comprobada' });
    }
    await t.test('BANAMEX 1 habilitada no activa BANAMEX 2; Wallet resuelve ambas con el mismo formato', async () => {
      firstPilot = await review(await send(input(wallet, '100.01', '0123'))); await reconcile(firstPilot);
      firstMode = await mode(first, 'AUTOMATIC', 'NOTIFICATION_POSTED_AT');
      walletInput = input(); const observed = await send(walletInput);
      assert.equal(present(observed).parserKey, objectValue(present(firstPilot)).parserKey); assert.equal(present(observed).cardId, present(second).id);
      assert.equal(present(observed).status, 'OBSERVED'); assert.equal(objectValue(objectValue(present(present(observed).proposal)).alias).kind, 'DIGITAL');
      assert.equal(objectValue(objectValue(present(present(observed).proposal)).alias).value, '0456'); assert.equal(objectValue(present(present(observed).proposal)).date, '2026-10-20');
      assert.equal(present(observed).expenseId, null); assert.equal(await count(), 1);
      await assert.rejects(mode(second, 'AUTOMATIC', 'NOTIFICATION_POSTED_AT'), e => objectValue(e).status === 409);
    });

    await t.test('aviso bancario antes desconocido conserva recibo y original; análisis explícito idempotente sin gasto', async () => {
      const parsers = sparseCalculations(load('src/lib/captureParsers.ts'));
      const old = sourceLoader({ ...mocks, '@/lib/captureParsers': { ...parsers, interpretCapture: () => ({ reason: 'UNKNOWN_FORMAT', proposal: {} }) } })('src/lib/captureService.ts');
      bankInput = input(bank); const receipt = await old.receiveCaptureEvent(db, credential, bankInput), before = await read(bankInput);
      assert.deepEqual((await post(bankInput)).body, plain(receipt)); assert.deepEqual(await read(bankInput), before);
      for (const result of await Promise.all(Array.from({ length: 4 }, () => resolve({ id: present(before).movementId, action: 'reinterpret' })))) assert.equal(result.status, 200);
      const after = await read(bankInput); assert.equal(present(present(after).movement).reason, 'INCOMPLETE_FORMAT'); assert.equal(present(present(after).movement).cardId, present(second).id);
      assert.equal(objectValue(present(present(after).movement).proposal).currency, undefined); assert.equal(objectValue(present(present(after).movement).proposal).evidenceOnly, true);
      assert.equal(array(present(present(after).movement).analysisHistory).length, 1);
      for (const key of ['id', 'eventId', 'requestHash', 'fields', 'interpretation', 'postedAt', 'receivedAt', 'createdAt'] as const) assert.deepEqual(present(after)[key], present(before)[key]);
      assert.equal(await count(), 1);
    });

    await t.test('revisar Wallet registra una compra y el banco se vincula expresamente al mismo gasto', async () => {
      pilot = await review(present((await read(walletInput))).movement); assert.equal(objectValue(present(pilot)).status, 'REGISTERED'); assert.equal(await count(), 2);
      assert.equal(present((await db.dailyExpense.findUnique({ where: { id: stringValue(objectValue(present(pilot)).expenseId) } }))).reconciliationStatus, 'PENDING');
      const bankMovement = present((await read(bankInput))).movement;
      const linked = await resolve({ id: present(bankMovement).id, action: 'link', expenseId: stringValue(objectValue(present(pilot)).expenseId) });
      assert.equal(linked.status, 200); assert.equal(objectValue(linked.body.movement).expenseId, objectValue(present(pilot)).expenseId); assert.equal(await count(), 2);
      assert.equal(objectValue(objectValue(linked.body.movement).proposal).currency, undefined);
      await assert.rejects(mode(second, 'AUTOMATIC', 'NOTIFICATION_POSTED_AT'), e => objectValue(e).status === 409);
    });

    await t.test('cotejo y aceptación de fecha habilitan solo BANAMEX 2 sin alterar la configuración de BANAMEX 1', async () => {
      await reconcile(pilot);
      for (const policy of [undefined, 'BANK_OPERATION'] as const) await assert.rejects(mode(second, 'AUTOMATIC', policy), e => objectValue(e).status === 409);
      const secondMode = await mode(second, 'AUTOMATIC', 'NOTIFICATION_POSTED_AT'); assert.notEqual(objectValue(secondMode).id, objectValue(firstMode).id);
      assert.deepEqual(await db.captureAutomation.findUnique({ where: { id: stringValue(objectValue(firstMode).id) } }), firstMode);
      assert.deepEqual(await db.captureCardAlias.findMany({ where: { userId: present(user).id, kind: 'WALLET' }, select: { value: true }, orderBy: { value: 'asc' } }), [{ value: '4242' }, { value: '4343' }]);
    });

    await t.test('ambos órdenes banco/Wallet y nueve entregas API del mismo evento crean un único gasto por compra', async () => {
      for (const [index, order] of ([['bank', 'wallet'], ['wallet', 'bank']] as const).entries()) {
        const amount = `${200 + index}.25`, before = await count(), inputs = { bank: input(bank, amount), wallet: input(wallet, amount) }, result: Record<string, unknown> = {};
        for (const source of order) {
          if (source === 'wallet') {
            const responses = await Promise.all(Array.from({ length: 8 }, () => post(inputs.wallet)));
            for (const response of responses) { assert.equal(response.status, 200); assert.deepEqual(response.body, present(responses[0]).body); }
            assert.deepEqual((await post(inputs.wallet)).body, present(responses[0]).body); result.wallet = present((await read(inputs.wallet))).movement;
          } else result.bank = await send(inputs.bank);
        }
        assert.equal(objectValue(result.wallet).status, 'REGISTERED'); assert.equal(objectValue(result.wallet).cardId, present(second).id);
        assert.equal(objectValue(result.bank).reason, 'INCOMPLETE_FORMAT'); assert.equal(objectValue(result.bank).expenseId, null); assert.equal(await count(), before + 1);
        const expense = await db.dailyExpense.findUnique({ where: { id: stringValue(objectValue(result.wallet).expenseId) } });
        assert.equal(present(expense).reconciliationStatus, 'PENDING'); assert.equal(present(expense).date.toISOString(), '2026-10-20T12:00:00.000Z');
        assert.equal((await resolve({ id: stringValue(objectValue(result.bank).id), action: 'link', expenseId: present(expense).id })).status, 200); assert.equal(await count(), before + 1);
      }
    });

    await t.test('importe igual en dos tarjetas conserva dos gastos; sufijos abreviados ambiguos no eligen tarjeta', async () => {
      const a = await send(input(wallet, '301.25', '0123')), b = await send(input(wallet, '301.25'));
      assert.equal(present(a).cardId, present(first).id); assert.equal(present(b).cardId, present(second).id); assert.notEqual(present(a).expenseId, present(b).expenseId);
      const collision = await db.captureCardAlias.create({ data: { userId: present(user).id, cardId: present(first).id, sourcePackage: bank.event.sourcePackage, kind: 'PHYSICAL', value: '1456', verifiedAt: new Date() } });
      const before = await count(); assert.equal(present((await send(input(bank, '302.25')))).reason, 'AMBIGUOUS_CARD');
      assert.equal(present((await send(input(wallet, '302.25')))).cardId, present(second).id); assert.equal(await count(), before + 1);
      await db.captureCardAlias.delete({ where: { id: collision.id } });
      const exact = await db.captureCardAlias.create({ data: { userId: present(user).id, cardId: present(first).id, sourcePackage: bank.event.sourcePackage, kind: 'PHYSICAL', value: '0456' } });
      const next = await count(); assert.equal(present((await send(input(wallet, '303.25')))).reason, 'AMBIGUOUS_CARD'); assert.equal(await count(), next);
      await db.captureCardAlias.delete({ where: { id: exact.id } });
    });

    await t.test('compras iguales, correcciones y otros propietarios conservan revisión y datos personales', async () => {
      const registered = await send(input(wallet, '401.25')), repeated = await send(input(wallet, '401.25'));
      assert.equal(present(repeated).reason, 'POSSIBLE_DUPLICATE'); const distinct = await resolve({ id: present(repeated).id, action: 'distinct' });
      assert.equal(distinct.status, 200); assert.notEqual(objectValue(distinct.body.movement).expenseId, present(registered).expenseId);
      const prior = await db.dailyExpense.create({ data: { userId: present(user).id, cardId: present(second).id, categoryId: category.id, date: new Date('2026-10-20T12:00:00Z'), amount: '402.25', paymentMethod: 'CARD', concept: 'Concepto personal', notes: 'Nota conservada', cashContributionAmount: '2.25' } });
      const observed = await send(input(wallet, '402.25')); assert.equal(present(observed).reason, 'POSSIBLE_DUPLICATE');
      assert.equal((await resolve({ id: present(observed).id, action: 'link', expenseId: prior.id }, 'other')).status, 404);
      assert.equal((await resolve({ id: present(observed).id, action: 'link', expenseId: prior.id })).status, 200);
      assert.deepEqual(await db.dailyExpense.findUnique({ where: { id: prior.id } }), prior);
      assert.equal((await post(input(), 'Bearer owner')).status, 401);
      const bankPending = await send(input(bank, '403.25'));
      assert.equal((await resolve({ id: present(bankPending).id, action: 'correct', expectedCorrection: 'null', correction: { cardId: present(second).id, amount: '403.25', date: '2026-10-20', currency: 'MXN', merchant: 'Corrección propia', categoryId: category.id } })).status, 200);
      const saved = await db.captureMovement.findUnique({ where: { id: present(bankPending).id } });
      assert.equal((await resolve({ id: present(bankPending).id, action: 'reinterpret' })).status, 409);
      assert.deepEqual(await db.captureMovement.findUnique({ where: { id: present(bankPending).id } }), saved);
      assert.equal(present((await send(input(wallet, '403.25')))).reason, 'POSSIBLE_DUPLICATE');
    });

    await t.test('el formato JOY bancario no automatiza aun con modo forzado y no puede habilitarse', async () => {
      const bankKey = 'banamex.joy-card-charge.es.v1';
      await assert.rejects(configuration.configureCapture(db, present(user).id, { action: 'automation', cardId: present(second).id, parserKey: bankKey, mode: 'AUTOMATIC' }), e => objectValue(e).status === 409);
      await db.captureAutomation.create({ data: { userId: present(user).id, cardId: present(second).id, parserKey: bankKey, mode: 'AUTOMATIC' } });
      const before = await count(); assert.equal(present((await send(input(bank, '501.25')))).reason, 'INCOMPLETE_FORMAT'); assert.equal(await count(), before);
    });

    await t.test('volver BANAMEX 2 a observación conserva sus evidencias y BANAMEX 1 continúa automática', async () => {
      await mode(second, 'OBSERVATION'); const before = await count();
      assert.equal(present((await send(input(wallet, '601.25')))).status, 'OBSERVED'); assert.equal(await count(), before);
      assert.equal(present((await send(input(wallet, '601.25', '0123')))).status, 'REGISTERED'); assert.equal(await count(), before + 1);
      assert.deepEqual(await db.captureAutomation.findUnique({ where: { id: stringValue(objectValue(firstMode).id) } }), firstMode);
      const original = await read(bankInput); await post(bankInput); assert.deepEqual(await read(bankInput), original);
      assert.equal(objectValue(present(present(original).interpretation)).reason, 'UNKNOWN_FORMAT'); assert.equal(array(present(present(original).movement).analysisHistory).length, 1);
      assert.equal(present(present(original).movement).expenseId, objectValue(pilot).expenseId);
    });
  } finally { await db.user.deleteMany({ where: { id: { in: [present(user).id, present(other).id] } } }); await db.$disconnect(); }
});
