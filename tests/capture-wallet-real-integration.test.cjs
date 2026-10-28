const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomUUID, randomBytes } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { sourceLoader } = require('./helpers/load-source.cjs');
const walletFixture = require('./fixtures/captures/wallet-banamex-purchase.es.v1.json');
const bankFixture = require('./fixtures/captures/banamex-card-charge.es.v1.json');
const connectionString = process.env.AFP_TEST_DATABASE_URL;

test('Wallet/Banamex reales anonimizados: observación, fecha aceptada y un gasto por compra', { skip: !connectionString }, async t => {
  const url = new URL(connectionString);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && /^\/afp_test\w*$/.test(url.pathname) && !url.search);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const load = sourceLoader();
  const protocol = load('src/lib/captureProtocol.ts');
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
  const mode = (value, datePolicy) => configuration.configureCapture(db, user.id, { action: 'automation', cardId: card.id, parserKey, mode: value, ...(datePolicy ? { datePolicy } : {}) });
  const makeEvent = (fixture, amount = '123.45', suffix) => protocol.validateCaptureEvent({ ...fixture.event, contractVersion: 1, eventId: randomUUID(),
    notificationKeyHash: protocol.captureHash(randomUUID()), fields: Object.fromEntries(Object.entries(fixture.event.fields).map(([key, value]) => [key,
      value.replaceAll('123.45', amount).replaceAll('••0123', suffix ? `••${suffix}` : '••0123')])) });
  const read = event => db.captureEvent.findUnique({ where: { deviceId_eventId: { deviceId: device.id, eventId: event.eventId } }, include: { movement: true } });
  const send = async event => { await service.receiveCaptureEvent(db, credential, event); return (await read(event)).movement; };
  const review = async movement => {
    const p = movement.proposal;
    await processing.resolveCaptureMovement(db, user.id, { id: movement.id, action: 'correct', expectedCorrection: 'null', correction: {
      cardId: p.cardId, amount: p.amount, date: p.date, currency: p.currency, merchant: p.merchant, categoryId: category.id,
    } });
    return processing.resolveCaptureMovement(db, user.id, { id: movement.id, action: 'register' });
  };
  const reconcile = async registered => {
    const period = { cardId: card.id, startDate: '2026-10-01', endDate: '2026-10-25' };
    const record = (await reconciliation.captureStatement(db, user.id, period)).records.find(row => row.id === registered.expenseId);
    await reconciliation.reconcileCaptureStatement(db, user.id, { ...period, action: 'confirm', type: record.type, recordId: record.id, fingerprint: record.fingerprint });
  };
  const readiness = async () => (await configuration.captureConfiguration(db, user.id)).rollout.find(row => row.cardId === card.id)
    .sources.find(row => row.sourcePackage === walletFixture.event.sourcePackage).formats.find(format => format.parserKey === parserKey);
  let observed, bankObserved;
  try {
    for (const [ownCard, kind, value] of [[card, 'DIGITAL', '0123'], [card, 'PHYSICAL', '1010'], [sibling, 'PHYSICAL', '0456']]) {
      await configuration.configureCapture(db, user.id, { action: 'alias', cardId: ownCard.id, sourcePackage: bankFixture.event.sourcePackage,
        kind, value, verified: true, evidence: 'Datos ficticios' });
    }
    await configuration.configureCapture(db, user.id, { action: 'alias', cardId: card.id, sourcePackage: walletFixture.event.sourcePackage,
      kind: 'WALLET', value: '4242', verified: true, evidence: 'Token NFC ficticio distinto del título' });
    await t.test('un modo forzado sin aceptar la fecha no crea gastos ni anuncia automatización activa', async () => {
      await db.captureAutomation.create({ data: { userId: user.id, cardId: card.id, parserKey, mode: 'AUTOMATIC' } });
      assert.equal((await send(makeEvent(walletFixture, '100.01'))).reason, 'DATE_POLICY_REQUIRED');
      assert.equal((await service.getCaptureDevice(db, credential)).configuration.automaticExpenses, false);
      assert.equal(await db.dailyExpense.count({ where: { userId: user.id } }), 0);
      await mode('OBSERVATION');
    });
    await t.test('banco primero y Wallet después: tarjeta resuelta por alias bancario, sin copiar el token NFC ni crear gastos', async () => {
      bankObserved = await send(makeEvent(bankFixture)); observed = await send(makeEvent(walletFixture));
      assert.equal(bankObserved.reason, 'INCOMPLETE_FORMAT'); assert.equal(bankObserved.cardId, card.id);
      assert.equal(bankObserved.proposal.currency, undefined); assert.equal(bankObserved.proposal.bankAuthorization, '999111');
      assert.equal(observed.status, 'OBSERVED'); assert.equal(observed.proposal.cardId, card.id);
      assert.equal(observed.proposal.alias.kind, 'DIGITAL'); assert.equal(observed.proposal.alias.value, '0123');
      assert.equal(observed.proposal.date, '2026-10-20'); assert.equal(observed.proposal.dateSource, 'NOTIFICATION_POSTED_AT');
      assert.equal(await db.dailyExpense.count({ where: { userId: user.id } }), 0);
      await assert.rejects(mode('AUTOMATIC', 'NOTIFICATION_POSTED_AT'), e => e.status === 409);
    });
    await t.test('una revisión crea un gasto; cotejo y aceptación explícita permiten habilitar solo esta tarjeta', async () => {
      const registered = await review(observed);
      assert.equal(registered.status, 'REGISTERED');
      assert.equal(await db.dailyExpense.count({ where: { userId: user.id } }), 1);
      const linked = await processing.resolveCaptureMovement(db, user.id, { id: bankObserved.id, action: 'link', expenseId: registered.expenseId });
      assert.equal(linked.expenseId, registered.expenseId);
      await assert.rejects(mode('AUTOMATIC', 'NOTIFICATION_POSTED_AT'), e => e.status === 409);
      await reconcile(registered); assert.equal((await readiness()).canEnable, true);
      await assert.rejects(mode('AUTOMATIC'), e => e.status === 409);
      await mode('AUTOMATIC', 'NOTIFICATION_POSTED_AT');
      assert.equal((await service.getCaptureDevice(db, credential)).configuration.automaticExpenses, true);
      await assert.rejects(configuration.configureCapture(db, user.id, { action: 'automation', cardId: sibling.id, parserKey, mode: 'AUTOMATIC', datePolicy: 'NOTIFICATION_POSTED_AT' }), e => e.status === 409);
    });
    await t.test('nuevas compras con los dos avisos en cualquier orden crean un gasto; la evidencia bancaria queda para cotejo', async () => {
      for (const [index, order] of [['bank', 'wallet'], ['wallet', 'bank']].entries()) {
        const amount = `${200 + index}.25`, before = await db.dailyExpense.count({ where: { userId: user.id } });
        const events = { bank: makeEvent(bankFixture, amount), wallet: makeEvent(walletFixture, amount) };
        const result = {};
        for (const source of order) result[source] = await send(events[source]);
        assert.equal(result.wallet.status, 'REGISTERED'); assert.equal(result.bank.status, 'REVIEW');
        assert.equal(result.bank.expenseId, null); assert.equal(result.bank.proposal.currency, undefined);
        assert.equal(await db.dailyExpense.count({ where: { userId: user.id } }), before + 1);
        const expense = await db.dailyExpense.findUnique({ where: { id: result.wallet.expenseId } });
        assert.equal(expense.reconciliationStatus, 'PENDING'); assert.equal(expense.date.toISOString(), '2026-10-20T12:00:00.000Z');
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
      assert.equal(first.status, 'REGISTERED'); assert.equal(second.reason, 'POSSIBLE_DUPLICATE');
      const distinct = await processing.resolveCaptureMovement(db, user.id, { id: second.id, action: 'distinct' });
      assert.notEqual(distinct.expenseId, first.expenseId);
    });
    await t.test('colisiones entre tipos y sufijos abreviados, tarjetas hermanas y otra cuenta no heredan activación', async () => {
      const collision = await db.captureCardAlias.create({ data: { userId: user.id, cardId: sibling.id, sourcePackage: bankFixture.event.sourcePackage, kind: 'PHYSICAL', value: '0123' } });
      assert.equal((await send(makeEvent(walletFixture, '501.25'))).reason, 'AMBIGUOUS_CARD');
      assert.equal((await send(makeEvent(bankFixture, '501.25'))).reason, 'AMBIGUOUS_CARD');
      assert.equal((await readiness()).canEnable, false); await db.captureCardAlias.delete({ where: { id: collision.id } });
      const second = await send(makeEvent(walletFixture, '502.25', '0456'));
      assert.equal(second.status, 'OBSERVED'); assert.equal(second.cardId, sibling.id);
      await assert.rejects(processing.resolveCaptureMovement(db, other.id, { id: second.id, action: 'reinterpret' }), e => e.status === 404);
    });
    await t.test('el cargo bancario incompleto no crea gastos aunque se fuerce su modo automático', async () => {
      await db.captureAutomation.create({ data: { userId: user.id, cardId: card.id, parserKey: 'banamex.card-charge.es.v1', mode: 'AUTOMATIC' } });
      const before = await db.dailyExpense.count({ where: { userId: user.id } });
      assert.equal((await send(makeEvent(bankFixture, '601.25'))).reason, 'INCOMPLETE_FORMAT');
      assert.equal(await db.dailyExpense.count({ where: { userId: user.id } }), before);
    });
    await t.test('una corrección personal pendiente en el banco conserva la revisión antes de registrar el aviso Wallet coincidente', async () => {
      const bank = await send(makeEvent(bankFixture, '602.25'));
      await processing.resolveCaptureMovement(db, user.id, { id: bank.id, action: 'correct', expectedCorrection: 'null', correction: {
        cardId: card.id, amount: '602.25', date: bank.proposal.date, currency: 'MXN', merchant: 'Nombre personal', categoryId: category.id,
      } });
      const before = await db.dailyExpense.count({ where: { userId: user.id } });
      assert.equal((await send(makeEvent(walletFixture, '602.25'))).reason, 'POSSIBLE_DUPLICATE');
      assert.equal(await db.dailyExpense.count({ where: { userId: user.id } }), before);
    });
    await t.test('reintentar un recibo antiguo no reinterpreta; solicitarlo conserva originales, no crea gastos y es idempotente', async () => {
      const base = load('src/lib/captureParsers.ts');
      const previous = sourceLoader({ '@/lib/captureParsers': { ...base, interpretCapture: () => ({ reason: 'UNKNOWN_FORMAT', proposal: {} }) } })('src/lib/captureService.ts');
      const input = makeEvent(walletFixture, '701.25');
      const receipt = await previous.receiveCaptureEvent(db, credential, input), original = await read(input);
      assert.equal(JSON.stringify(await service.receiveCaptureEvent(db, credential, input)), JSON.stringify(receipt));
      assert.deepEqual(await read(input), original);
      const before = await db.dailyExpense.count({ where: { userId: user.id } });
      await Promise.all(Array.from({ length: 4 }, () => processing.resolveCaptureMovement(db, user.id, { id: original.movement.id, action: 'reinterpret' })));
      const after = await read(input);
      assert.equal(after.movement.status, 'OBSERVED'); assert.equal(after.movement.analysisHistory.length, 1);
      assert.equal(after.movement.analysisHistory[0].previous.reason, 'UNKNOWN_FORMAT');
      for (const key of ['id', 'eventId', 'requestHash', 'fields', 'interpretation', 'createdAt', 'receivedAt']) assert.deepEqual(after[key], original[key]);
      assert.equal(await db.dailyExpense.count({ where: { userId: user.id } }), before);
      assert.equal(JSON.stringify(await service.receiveCaptureEvent(db, credential, input)), JSON.stringify(receipt));
      const reviewedBefore = (await readiness()).reviewedCaptures;
      const registered = await review(after.movement); await reconcile(registered);
      assert.equal((await readiness()).reviewedCaptures, reviewedBefore + 1);
      await assert.rejects(processing.resolveCaptureMovement(db, user.id, { id: registered.id, action: 'reinterpret' }), e => e.status === 409);
    });
    await t.test('la reinterpretación no reemplaza una corrección personal', async () => {
      const movement = await send(makeEvent(walletFixture, '801.25', '0456'));
      await processing.resolveCaptureMovement(db, user.id, { id: movement.id, action: 'correct', expectedCorrection: 'null', correction: {
        cardId: sibling.id, amount: '800.00', date: '2026-10-19', currency: 'MXN', merchant: 'Nombre personal', categoryId: category.id,
      } });
      const before = await db.captureMovement.findUnique({ where: { id: movement.id } });
      await assert.rejects(processing.resolveCaptureMovement(db, user.id, { id: movement.id, action: 'reinterpret' }), e => e.status === 409);
      assert.deepEqual(await db.captureMovement.findUnique({ where: { id: movement.id } }), before);
    });
  } finally { await db.user.deleteMany({ where: { id: { in: [user.id, other.id] } } }); await db.$disconnect(); }
});
