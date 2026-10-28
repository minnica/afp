import { array,record as objectValue } from './helpers/dynamic-values';

import { present,sparseCalculations,stringValue } from './helpers/financial-fixtures';
import type { CaptureInput,NoticeSample } from './helpers/integration-fixtures';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { test } from 'node:test';
import bankFixture from './fixtures/captures/banamex-card-charge.es.v1.json';
import walletFixture from './fixtures/captures/wallet-banamex-purchase.es.v1.json';
import { integrationLoader as sourceLoader } from './helpers/integration-fixtures';
const connectionString = process.env.AFP_TEST_DATABASE_URL;

test('Wallet/Banamex reales anonimizados: observación, fecha aceptada y un gasto por compra', { skip: !connectionString }, async t => {
  const url = new URL(present(connectionString));
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && /^\/afp_test\w*$/.test(url.pathname) && !url.search);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const load = sourceLoader();
  const protocol = sparseCalculations(load('src/lib/captureProtocol.ts'));
  const service = load('src/lib/captureService.ts');
  const processing = load('src/lib/captureProcessing.ts');
  const configuration = load('src/lib/captureConfiguration.ts');
  const reconciliation = load('src/lib/captureReconciliation.ts');
  const user = await db.user.create({ data: { email: `wallet-real-${randomUUID()}@example.test` } });
  const other = await db.user.create({ data: { email: `wallet-other-${randomUUID()}@example.test` } });
  const card = await db.card.create({ data: { userId: user.id, name: 'BANAMEX 1', usualCutDay: 25, usualDueDay: 15 } });
  const sibling = await db.card.create({ data: { userId: user.id, name: 'BANAMEX 2', usualCutDay: 25, usualDueDay: 15 } });
  const category = await db.category.create({ data: { userId: user.id, name: 'Pruebas Wallet' } });
  const device = await db.captureDevice.create({ data: { userId: user.id, approvedAt: new Date(), secretHash: protocol.captureHash(randomBytes(32).toString('base64url')), name: 'Wallet ficticio' } });
  const credential = { id: device.id, secretHash: device.secretHash };
  const parserKey = 'wallet.banamex-purchase.es.v1';
  const mode = (value: string, datePolicy?: string) => configuration.configureCapture(db, user.id, { action: 'automation', cardId: card.id, parserKey, mode: value, ...(datePolicy ? { datePolicy } : {}) });
  const makeEvent = (fixture: NoticeSample, amount = '123.45', suffix?: string) => protocol.validateCaptureEvent({ ...fixture.event, contractVersion: 1 as const, eventId: randomUUID(),
    notificationKeyHash: protocol.captureHash(randomUUID()), fields: Object.fromEntries(Object.entries(fixture.event.fields).map(([key, value]) => [key,
      value.replaceAll('123.45', amount).replaceAll('••0123', suffix ? `••${suffix}` : '••0123')])) });
  const read = (event: Pick<CaptureInput, 'eventId'>) => db.captureEvent.findUnique({ where: { deviceId_eventId: { deviceId: device.id, eventId: event.eventId } }, include: { movement: true } });
  const send = async (event: CaptureInput) => { await service.receiveCaptureEvent(db, credential, event); return present((await read(event))).movement; };
  const review = async (movement: unknown) => {
    const p = objectValue(present(movement)).proposal;
    await processing.resolveCaptureMovement(db, user.id, { id: objectValue(present(movement)).id, action: 'correct', expectedCorrection: 'null', correction: {
      cardId: objectValue(present(p)).cardId, amount: objectValue(present(p)).amount, date: objectValue(present(p)).date, currency: objectValue(present(p)).currency, merchant: objectValue(present(p)).merchant, categoryId: category.id,
    } });
    return processing.resolveCaptureMovement(db, user.id, { id: objectValue(present(movement)).id, action: 'register' });
  };
  const reconcile = async (registered: import('@prisma/client').CaptureMovement | null) => {
    const period = { cardId: card.id, startDate: '2026-10-01', endDate: '2026-10-25' };
    const record = (await reconciliation.captureStatement(db, user.id, period)).records.find(row => row.id === present(registered).expenseId);
    await reconciliation.reconcileCaptureStatement(db, user.id, { ...period, action: 'confirm', type: present(record).type, recordId: present(record).id, fingerprint: present(record).fingerprint });
  };
  const readiness = async () => present(present((await configuration.captureConfiguration(db, user.id)).rollout.find(row => row.cardId === card.id))
    .sources.find(row => row.sourcePackage === walletFixture.event.sourcePackage)).formats.find(format => format.parserKey === parserKey);
  let observed: import('@prisma/client').CaptureMovement | null, bankObserved: import('@prisma/client').CaptureMovement | null;
  try {
    for (const [ownCard, kind, value] of [[card, 'DIGITAL', '0123'], [card, 'PHYSICAL', '1010'], [sibling, 'PHYSICAL', '0456']] as const) {
      await configuration.configureCapture(db, user.id, { action: 'alias', cardId: ownCard.id, sourcePackage: bankFixture.event.sourcePackage,
        kind, value, verified: true, evidence: 'Datos ficticios' });
    }
    await configuration.configureCapture(db, user.id, { action: 'alias', cardId: card.id, sourcePackage: walletFixture.event.sourcePackage,
      kind: 'WALLET', value: '4242', verified: true, evidence: 'Token NFC ficticio distinto del título' });
    await t.test('un modo forzado sin aceptar la fecha no crea gastos ni anuncia automatización activa', async () => {
      await db.captureAutomation.create({ data: { userId: user.id, cardId: card.id, parserKey, mode: 'AUTOMATIC' } });
      assert.equal(present((await send(makeEvent(walletFixture, '100.01')))).reason, 'DATE_POLICY_REQUIRED');
      assert.equal((await service.getCaptureDevice(db, credential)).configuration.automaticExpenses, false);
      assert.equal(await db.dailyExpense.count({ where: { userId: user.id } }), 0);
      await mode('OBSERVATION');
    });
    await t.test('banco primero y Wallet después: tarjeta resuelta por alias bancario, sin copiar el token NFC ni crear gastos', async () => {
      bankObserved = await send(makeEvent(bankFixture)); observed = await send(makeEvent(walletFixture));
      assert.equal(present(bankObserved).reason, 'INCOMPLETE_FORMAT'); assert.equal(present(bankObserved).cardId, card.id);
      assert.equal(objectValue(present(present(bankObserved).proposal)).currency, undefined); assert.equal(objectValue(present(present(bankObserved).proposal)).bankAuthorization, '999111');
      assert.equal(present(observed).status, 'OBSERVED'); assert.equal(objectValue(present(present(observed).proposal)).cardId, card.id);
      assert.equal(objectValue(objectValue(present(present(observed).proposal)).alias).kind, 'DIGITAL'); assert.equal(objectValue(objectValue(present(present(observed).proposal)).alias).value, '0123');
      assert.equal(objectValue(present(present(observed).proposal)).date, '2026-10-20'); assert.equal(objectValue(present(present(observed).proposal)).dateSource, 'NOTIFICATION_POSTED_AT');
      assert.equal(await db.dailyExpense.count({ where: { userId: user.id } }), 0);
      await assert.rejects(mode('AUTOMATIC', 'NOTIFICATION_POSTED_AT'), e => objectValue(e).status === 409);
    });
    await t.test('una revisión crea un gasto; cotejo y aceptación explícita permiten habilitar solo esta tarjeta', async () => {
      const registered = await review(observed);
      assert.equal(present(registered).status, 'REGISTERED');
      assert.equal(await db.dailyExpense.count({ where: { userId: user.id } }), 1);
      const linked = await processing.resolveCaptureMovement(db, user.id, { id: present(bankObserved).id, action: 'link', expenseId: present(registered).expenseId });
      assert.equal(present(linked).expenseId, present(registered).expenseId);
      await assert.rejects(mode('AUTOMATIC', 'NOTIFICATION_POSTED_AT'), e => objectValue(e).status === 409);
      await reconcile(registered); assert.equal(present((await readiness())).canEnable, true);
      await assert.rejects(mode('AUTOMATIC'), e => objectValue(e).status === 409);
      await mode('AUTOMATIC', 'NOTIFICATION_POSTED_AT');
      assert.equal((await service.getCaptureDevice(db, credential)).configuration.automaticExpenses, true);
      await assert.rejects(configuration.configureCapture(db, user.id, { action: 'automation', cardId: sibling.id, parserKey, mode: 'AUTOMATIC', datePolicy: 'NOTIFICATION_POSTED_AT' }), e => objectValue(e).status === 409);
    });
    await t.test('nuevas compras con los dos avisos en cualquier orden crean un gasto; la evidencia bancaria queda para cotejo', async () => {
      for (const [index, order] of ([['bank', 'wallet'], ['wallet', 'bank']] as const).entries()) {
        const amount = `${200 + index}.25`, before = await db.dailyExpense.count({ where: { userId: user.id } });
        const events = { bank: makeEvent(bankFixture, amount), wallet: makeEvent(walletFixture, amount) };
        const result: Record<string, unknown> = {};
        for (const source of order) result[source] = await send(events[source]);
        assert.equal(objectValue(result.wallet).status, 'REGISTERED'); assert.equal(objectValue(result.bank).status, 'REVIEW');
        assert.equal(objectValue(result.bank).expenseId, null); assert.equal(objectValue(objectValue(result.bank).proposal).currency, undefined);
        assert.equal(await db.dailyExpense.count({ where: { userId: user.id } }), before + 1);
        const expense = await db.dailyExpense.findUnique({ where: { id: stringValue(objectValue(result.wallet).expenseId) } });
        assert.equal(present(expense).reconciliationStatus, 'PENDING'); assert.equal(present(expense).date.toISOString(), '2026-10-20T12:00:00.000Z');
      }
    });
    await t.test('ocho entregas concurrentes y una respuesta perdida conservan un único gasto y recibo', async () => {
      const input = makeEvent(walletFixture, '301.25'), before = await db.dailyExpense.count({ where: { userId: user.id } });
      const receipts = await Promise.all(Array.from({ length: 8 }, () => service.receiveCaptureEvent(db, credential, input)));
      for (const receipt of receipts) assert.deepEqual(receipt, receipts[0]);
      assert.deepEqual(await service.receiveCaptureEvent(db, credential, input), receipts[0]);
      assert.equal(await db.dailyExpense.count({ where: { userId: user.id } }), before + 1);
    });
    await t.test('dos compras iguales no se fusionan y una revisión explícita conserva su multiplicidad', async () => {
      const first = await send(makeEvent(walletFixture, '401.25'));
      const second = await send(makeEvent(walletFixture, '401.25'));
      assert.equal(present(first).status, 'REGISTERED'); assert.equal(present(second).reason, 'POSSIBLE_DUPLICATE');
      const distinct = await processing.resolveCaptureMovement(db, user.id, { id: present(second).id, action: 'distinct' });
      assert.notEqual(present(distinct).expenseId, present(first).expenseId);
    });
    await t.test('colisiones entre tipos y sufijos abreviados, tarjetas hermanas y otra cuenta no heredan activación', async () => {
      const collision = await db.captureCardAlias.create({ data: { userId: user.id, cardId: sibling.id, sourcePackage: bankFixture.event.sourcePackage, kind: 'PHYSICAL', value: '0123' } });
      assert.equal(present((await send(makeEvent(walletFixture, '501.25')))).reason, 'AMBIGUOUS_CARD');
      assert.equal(present((await send(makeEvent(bankFixture, '501.25')))).reason, 'AMBIGUOUS_CARD');
      assert.equal(present((await readiness())).canEnable, false); await db.captureCardAlias.delete({ where: { id: collision.id } });
      const second = await send(makeEvent(walletFixture, '502.25', '0456'));
      assert.equal(present(second).status, 'OBSERVED'); assert.equal(present(second).cardId, sibling.id);
      await assert.rejects(processing.resolveCaptureMovement(db, other.id, { id: present(second).id, action: 'reinterpret' }), e => objectValue(e).status === 404);
    });
    await t.test('el cargo bancario incompleto no crea gastos aunque se fuerce su modo automático', async () => {
      await db.captureAutomation.create({ data: { userId: user.id, cardId: card.id, parserKey: 'banamex.card-charge.es.v1', mode: 'AUTOMATIC' } });
      const before = await db.dailyExpense.count({ where: { userId: user.id } });
      assert.equal(present((await send(makeEvent(bankFixture, '601.25')))).reason, 'INCOMPLETE_FORMAT');
      assert.equal(await db.dailyExpense.count({ where: { userId: user.id } }), before);
    });
    await t.test('una corrección personal pendiente en el banco conserva la revisión antes de registrar el aviso Wallet coincidente', async () => {
      const bank = await send(makeEvent(bankFixture, '602.25'));
      await processing.resolveCaptureMovement(db, user.id, { id: present(bank).id, action: 'correct', expectedCorrection: 'null', correction: {
        cardId: card.id, amount: '602.25', date: objectValue(present(present(bank).proposal)).date, currency: 'MXN', merchant: 'Nombre personal', categoryId: category.id,
      } });
      const before = await db.dailyExpense.count({ where: { userId: user.id } });
      assert.equal(present((await send(makeEvent(walletFixture, '602.25')))).reason, 'POSSIBLE_DUPLICATE');
      assert.equal(await db.dailyExpense.count({ where: { userId: user.id } }), before);
    });
    await t.test('reintentar un recibo antiguo no reinterpreta; solicitarlo conserva originales, no crea gastos y es idempotente', async () => {
      const base = sparseCalculations(load('src/lib/captureParsers.ts'));
      const previous = sourceLoader({ '@/lib/captureParsers': { ...base, interpretCapture: () => ({ reason: 'UNKNOWN_FORMAT', proposal: {} }) } })('src/lib/captureService.ts');
      const input = makeEvent(walletFixture, '701.25');
      const receipt = await previous.receiveCaptureEvent(db, credential, input), original = await read(input);
      assert.equal(JSON.stringify(await service.receiveCaptureEvent(db, credential, input)), JSON.stringify(receipt));
      assert.deepEqual(await read(input), original);
      const before = await db.dailyExpense.count({ where: { userId: user.id } });
      await Promise.all(Array.from({ length: 4 }, () => processing.resolveCaptureMovement(db, user.id, { id: present(present(original).movement).id, action: 'reinterpret' })));
      const after = await read(input);
      assert.equal(present(present(after).movement).status, 'OBSERVED'); assert.equal(array(present(present(after).movement).analysisHistory).length, 1);
      assert.equal(objectValue(objectValue(array(present(present(present(after).movement).analysisHistory))[0]).previous).reason, 'UNKNOWN_FORMAT');
      for (const key of ['id', 'eventId', 'requestHash', 'fields', 'interpretation', 'createdAt', 'receivedAt'] as const) assert.deepEqual(present(after)[key], present(original)[key]);
      assert.equal(await db.dailyExpense.count({ where: { userId: user.id } }), before);
      assert.equal(JSON.stringify(await service.receiveCaptureEvent(db, credential, input)), JSON.stringify(receipt));
      const reviewedBefore = present((await readiness())).reviewedCaptures;
      const registered = await review(present(after).movement); await reconcile(registered);
      assert.equal(present((await readiness())).reviewedCaptures, reviewedBefore + 1);
      await assert.rejects(processing.resolveCaptureMovement(db, user.id, { id: present(registered).id, action: 'reinterpret' }), e => objectValue(e).status === 409);
    });
    await t.test('la reinterpretación no reemplaza una corrección personal', async () => {
      const movement = await send(makeEvent(walletFixture, '801.25', '0456'));
      await processing.resolveCaptureMovement(db, user.id, { id: present(movement).id, action: 'correct', expectedCorrection: 'null', correction: {
        cardId: sibling.id, amount: '800.00', date: '2026-10-19', currency: 'MXN', merchant: 'Nombre personal', categoryId: category.id,
      } });
      const before = await db.captureMovement.findUnique({ where: { id: present(movement).id } });
      await assert.rejects(processing.resolveCaptureMovement(db, user.id, { id: present(movement).id, action: 'reinterpret' }), e => objectValue(e).status === 409);
      assert.deepEqual(await db.captureMovement.findUnique({ where: { id: present(movement).id } }), before);
    });
  } finally { await db.user.deleteMany({ where: { id: { in: [user.id, other.id] } } }); await db.$disconnect(); }
});
