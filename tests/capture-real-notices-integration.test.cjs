const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomUUID, randomBytes } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { sourceLoader } = require('./helpers/load-source.cjs');
const fixture = require('./fixtures/captures/nu-cfe-service-payment.es.v1.json');
const connectionString = process.env.AFP_TEST_DATABASE_URL;

test('Nu CFE PostgreSQL: aviso real anonimizado conserva recepción y exige revisión financiera explícita', { skip: !connectionString }, async t => {
  const url = new URL(connectionString);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && /^\/afp_test\w*$/.test(url.pathname) && !url.search);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const user = await db.user.create({ data: { email: `real-notice-${randomUUID()}@example.test` } });
  const load = sourceLoader();
  const protocol = load('src/lib/captureProtocol.js');
  const service = load('src/lib/captureService.js');
  const processing = load('src/lib/captureProcessing.js');
  const configuration = load('src/lib/captureConfiguration.js');
  const device = await db.captureDevice.create({ data: { userId: user.id, name: 'Prueba local Nu/CFE', approvedAt: new Date(), secretHash: protocol.captureHash(randomBytes(32).toString('base64url')) } });
  const credential = { id: device.id, secretHash: device.secretHash };
  const card = await db.card.create({ data: { userId: user.id, name: 'NU', usualCutDay: 25, usualDueDay: 15 } });
  const category = await db.category.create({ data: { userId: user.id, name: 'Servicios ficticios' } });
  const parserKey = 'nu.cfe-service-payment.es.v1';
  const event = () => protocol.validateCaptureEvent({ ...fixture.event, contractVersion: 1, eventId: randomUUID(), notificationKeyHash: 'c'.repeat(64) });
  const read = input => db.captureEvent.findUnique({ where: { deviceId_eventId: { deviceId: device.id, eventId: input.eventId } }, include: { movement: true } });
  let input, stored;
  try {
    await t.test('ni alias ni modo forzado completan los datos ausentes; ocho entregas producen un recibo y cero gastos', async () => {
      await configuration.configureCapture(db, user.id, { action: 'alias', cardId: card.id, sourcePackage: fixture.event.sourcePackage, kind: 'PHYSICAL', value: '0123', verified: true, evidence: 'Alias ficticio de prueba' });
      await db.captureAutomation.create({ data: { userId: user.id, cardId: card.id, parserKey, mode: 'AUTOMATIC' } });
      input = event();
      const responses = await Promise.all(Array.from({ length: 8 }, () => service.receiveCaptureEvent(db, credential, input)));
      for (const response of responses) assert.deepEqual(response, responses[0]);
      stored = await read(input);
      assert.equal(stored.movement.status, 'REVIEW'); assert.equal(stored.movement.reason, 'FORMAT_POLICY_REQUIRED');
      assert.equal(stored.movement.proposal.amount, '123.45'); assert.equal(stored.movement.proposal.merchant, 'CFE');
      assert.equal(stored.movement.cardId, null); assert.equal(stored.movement.operationDate, null); assert.equal(stored.movement.expenseId, null);
      assert.equal(await db.dailyExpense.count({ where: { userId: user.id } }), 0);
      assert.equal(await db.captureEvent.count({ where: { userId: user.id } }), 1);
      await assert.rejects(configuration.configureCapture(db, user.id, { action: 'automation', cardId: card.id, parserKey, mode: 'AUTOMATIC' }), error => error.status === 409);
    });
    await t.test('revisión explícita permite registrar una vez sin completar silenciosamente el aviso original', async () => {
      await assert.rejects(processing.resolveCaptureMovement(db, user.id, { id: stored.movement.id, action: 'register' }), error => error.status === 409);
      await processing.resolveCaptureMovement(db, user.id, { id: stored.movement.id, action: 'correct', expectedCorrection: 'null', correction: {
        cardId: card.id, date: '2026-10-20', amount: '123.45', currency: 'MXN', merchant: 'CFE', categoryId: category.id,
      } });
      const registered = await processing.resolveCaptureMovement(db, user.id, { id: stored.movement.id, action: 'register' });
      assert.equal(registered.status, 'REGISTERED');
      await service.receiveCaptureEvent(db, credential, input);
      assert.equal(await db.dailyExpense.count({ where: { userId: user.id } }), 1);
      const after = await read(input);
      assert.deepEqual(after.fields, stored.fields); assert.deepEqual(after.movement.proposal, stored.movement.proposal);
      assert.equal(after.movement.correction.currency, 'MXN');
      assert.equal((await db.dailyExpense.findUnique({ where: { id: registered.expenseId } })).reconciliationStatus, 'PENDING');
    });
    await t.test('un recibo previo de formato desconocido nunca se reinterpreta al incorporar el nuevo analizador', async () => {
      const parsers = load('src/lib/captureParsers.js');
      const prior = sourceLoader({ '@/lib/captureParsers': { ...parsers, interpretCapture: () => ({ reason: 'UNKNOWN_FORMAT', proposal: {} }) } })('src/lib/captureService.js');
      const previous = event(); await prior.receiveCaptureEvent(db, credential, previous);
      const before = await read(previous);
      assert.equal(before.movement.reason, 'UNKNOWN_FORMAT');
      await service.receiveCaptureEvent(db, credential, previous);
      assert.deepEqual(await read(previous), before);
    });
  } finally { await db.user.delete({ where: { id: user.id } }); await db.$disconnect(); }
});
