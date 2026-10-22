const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomUUID, randomBytes } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { sourceLoader } = require('./helpers/load-source.cjs');
const fixture = require('./fixtures/captures/nu-cfe-service-payment.es.v1.json');
const connectionString = process.env.AFP_TEST_DATABASE_URL;
const fixtureToday = '2026-10-22';
class FixtureClock extends Date {
  constructor(...args) { super(...(args.length ? args : [`${fixtureToday}T12:00:00Z`])); }
  static now() { return Date.parse(`${fixtureToday}T12:00:00Z`); }
}

test('Nu/CFE: regla expresa, suscripción bimestral y avisos resueltos con un solo gasto', { skip: !connectionString }, async t => {
  const url = new URL(connectionString);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && /^\/afp_test\w*$/.test(url.pathname) && !url.search);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const load = sourceLoader({}, { Date: FixtureClock }), protocol = load('src/lib/captureProtocol.js'), service = load('src/lib/captureService.js');
  const processing = load('src/lib/captureProcessing.js'), configuration = load('src/lib/captureConfiguration.js');
  const reconciliation = load('src/lib/captureReconciliation.js'), charges = load('src/lib/subscriptionChargeService.js');
  const parserKey = 'nu.cfe-service-payment.es.v2';
  const user = await db.user.create({ data: { email: `nu-cfe-${randomUUID()}@example.test` } });
  const other = await db.user.create({ data: { email: `nu-other-${randomUUID()}@example.test` } });
  const card = await db.card.create({ data: { userId: user.id, name: 'NU ficticia', usualCutDay: 25, usualDueDay: 15 } });
  const sibling = await db.card.create({ data: { userId: user.id, name: 'Otra tarjeta Nu', usualCutDay: 25, usualDueDay: 15 } });
  const category = await db.category.create({ data: { userId: user.id, name: 'Servicios ficticios' } });
  const subscription = await db.subscription.create({ data: { userId: user.id, name: 'CFE ficticia', amount: '100.00', paymentMethod: 'CASH',
    categoryId: category.id, chargeDay: 20, frequencyMonths: 2, startMonth: 4, startYear: 2026 } });
  const originalSubscription = await db.subscription.findUnique({ where: { id: subscription.id } });
  const device = await db.captureDevice.create({ data: { userId: user.id, approvedAt: new Date(), name: 'Nu ficticio', secretHash: protocol.captureHash(randomBytes(32).toString('base64url')) } });
  const credential = { id: device.id, secretHash: device.secretHash };
  const configurePolicy = (cardId = card.id, subscriptionId = subscription.id) => configuration.configureCapture(db, user.id, {
    action: 'formatPolicy', cardId, parserKey, completionPolicy: 'NU_CFE_MXN', datePolicy: 'NOTIFICATION_POSTED_AT', subscriptionId,
  });
  const mode = (value, cardId = card.id) => configuration.configureCapture(db, user.id, { action: 'automation', cardId, parserKey, mode: value, datePolicy: 'NOTIFICATION_POSTED_AT' });
  const event = (month = '2026-10', amount = '123.45', overrides = {}) => protocol.validateCaptureEvent({ ...fixture.event,
    contractVersion: 1, eventId: randomUUID(), notificationKeyHash: protocol.captureHash(randomUUID()),
    postedAt: `${month}-21T02:00:00.000Z`, receivedAt: `${month}-21T02:00:00.300Z`,
    fields: Object.fromEntries(Object.entries(fixture.event.fields).map(([key, value]) => [key, value.replaceAll('123.45', amount)])), ...overrides });
  const read = input => db.captureEvent.findUnique({ where: { deviceId_eventId: { deviceId: device.id, eventId: input.eventId } }, include: { movement: true } });
  const send = async input => { await service.receiveCaptureEvent(db, credential, input); return (await read(input)).movement; };
  const readiness = async (cardId = card.id) => (await configuration.captureConfiguration(db, user.id)).rollout.find(row => row.cardId === cardId)
    .sources.find(row => row.sourcePackage === fixture.event.sourcePackage)?.formats.find(row => row.parserKey === parserKey);
  const dashboard = sourceLoader({ '@/lib/prisma': { prisma: db }, '@/lib/apiAuth': { ...load('src/lib/apiAuth.js'),
    apiResponse: { json: body => body }, requireApiUser: async () => user,
  } }, { Date: FixtureClock })('src/app/api/dashboard/route.js');
  const notices = async () => (await dashboard.GET({ url: `http://localhost/api/dashboard?clientDate=${fixtureToday}` })).importantNotices;
  let oldInput, oldReceipt, pilot;
  try {
    for (const ownCard of [card, sibling]) await configuration.configureCapture(db, user.id, { action: 'alias', cardId: ownCard.id,
      sourcePackage: fixture.event.sourcePackage, kind: 'PHYSICAL', value: ownCard.id === card.id ? '0123' : '0456', verified: true, evidence: 'Ficticio' });
    await t.test('sin regla no basta el paquete Nu, un alias ni forzar el modo automático', async () => {
      await db.captureAutomation.create({ data: { userId: user.id, cardId: card.id, parserKey, mode: 'AUTOMATIC', datePolicy: 'NOTIFICATION_POSTED_AT' } });
      assert.equal((await send(event('2026-06'))).reason, 'FORMAT_POLICY_REQUIRED');
      assert.equal(await db.dailyExpense.count({ where: { userId: user.id } }), 0);
      assert.equal((await service.getCaptureDevice(db, credential)).configuration.automaticExpenses, false);
      await assert.rejects(mode('AUTOMATIC'), e => e.status === 409);
      assert.equal((await readiness()).canEnable, false);
    });
    await t.test('la regla exige referencias propias y se guarda en observación, sin resolver suscripciones', async () => {
      await assert.rejects(configurePolicy(card.id, 'suscripcion-ajena'), e => e.status === 404);
      await assert.rejects(configuration.configureCapture(db, other.id, { action: 'formatPolicy', cardId: card.id, parserKey,
        completionPolicy: 'NU_CFE_MXN', datePolicy: 'NOTIFICATION_POSTED_AT', subscriptionId: subscription.id }), e => e.status === 404);
      const policy = await configurePolicy(); assert.equal(policy.mode, 'OBSERVATION'); assert.ok(policy.policyAcceptedAt);
      assert.equal((await configurePolicy()).policyAcceptedAt.toISOString(), policy.policyAcceptedAt.toISOString());
      assert.equal(await db.subscriptionCharge.count({ where: { userId: user.id } }), 0);
      assert.equal(await db.dailyExpense.count({ where: { userId: user.id } }), 0);
    });
    await t.test('aviso antiguo: reintentar conserva recibo; reinterpretar pide análisis explícito y completa solo por la regla', async () => {
      const parsers = load('src/lib/captureParsers.js');
      const prior = sourceLoader({ '@/lib/captureParsers': { ...parsers, interpretCapture: () => ({ reason: 'UNKNOWN_FORMAT', proposal: {} }) } })('src/lib/captureService.js');
      oldInput = event('2026-08', '111.11'); oldReceipt = await prior.receiveCaptureEvent(db, credential, oldInput);
      const before = await read(oldInput);
      assert.equal(JSON.stringify(await service.receiveCaptureEvent(db, credential, oldInput)), JSON.stringify(oldReceipt));
      pilot = await processing.resolveCaptureMovement(db, user.id, { id: before.movement.id, action: 'reinterpret' });
      assert.equal(pilot.status, 'OBSERVED'); assert.equal(pilot.proposal.cardId, card.id); assert.equal(pilot.proposal.currency, 'MXN');
      assert.equal(pilot.proposal.date, '2026-08-20'); assert.equal(pilot.proposal.operationAt, undefined);
      assert.equal(pilot.proposal.cardSource, 'OWNER_FORMAT_POLICY'); assert.equal(pilot.proposal.currencySource, 'OWNER_FORMAT_POLICY');
      assert.equal(pilot.proposal.subscriptionId, subscription.id); assert.equal(pilot.analysisHistory.length, 1);
      const after = await read(oldInput); for (const key of ['fields', 'interpretation', 'requestHash', 'createdAt']) assert.deepEqual(after[key], before[key]);
      assert.equal(await db.dailyExpense.count({ where: { userId: user.id } }), 0);
    });
    await t.test('registrar el piloto confirma el cobro bimestral con Nu y el importe real, sin cambiar la recurrencia en efectivo', async () => {
      const p = pilot.proposal;
      await processing.resolveCaptureMovement(db, user.id, { id: pilot.id, action: 'correct', expectedCorrection: 'null', correction: {
        cardId: p.cardId, amount: p.amount, date: p.date, currency: p.currency, merchant: p.merchant, categoryId: category.id,
      } });
      pilot = await processing.resolveCaptureMovement(db, user.id, { id: pilot.id, action: 'register' });
      assert.equal(pilot.status, 'REGISTERED');
      const expense = await db.dailyExpense.findUnique({ where: { id: pilot.expenseId } });
      assert.equal(expense.subscriptionId, subscription.id); assert.equal(expense.cardId, card.id); assert.equal(expense.paymentMethod, 'CARD');
      assert.equal(String(expense.amount), '111.11'); assert.equal(expense.categoryId, category.id); assert.equal(expense.reconciliationStatus, 'PENDING');
      const charge = await db.subscriptionCharge.findUnique({ where: { subscriptionId_month: { subscriptionId: subscription.id, month: '2026-08' } } });
      assert.equal(charge.status, 'CONFIRMED'); assert.equal(charge.expenseId, expense.id);
      assert.deepEqual(await db.subscription.findUnique({ where: { id: subscription.id } }), originalSubscription);
      await assert.rejects(mode('AUTOMATIC'), e => e.status === 409);
      const period = { cardId: card.id, startDate: '2026-08-01', endDate: '2026-08-31' };
      const record = (await reconciliation.captureStatement(db, user.id, period)).records.find(row => row.id === pilot.expenseId);
      await reconciliation.reconcileCaptureStatement(db, user.id, { ...period, action: 'confirm', type: record.type, recordId: record.id, fingerprint: record.fingerprint });
      assert.equal((await readiness()).canEnable, true); await mode('AUTOMATIC');
      await assert.rejects(mode('AUTOMATIC', sibling.id), e => e.status === 409);
    });
    await t.test('una fecha de aviso futura conserva la entrega en revisión sin crear gasto ni confirmar el cobro pendiente', async () => {
      const movement = await send(event('2026-10', '121.21', { postedAt: '2026-10-23T18:00:00.000Z', receivedAt: '2026-10-23T18:00:00.300Z' }));
      assert.equal(movement.reason, 'SUBSCRIPTION_CONFLICT'); assert.equal(movement.expenseId, null);
      assert.equal(await db.dailyExpense.count({ where: { userId: user.id } }), 1);
      assert.equal((await charges.loadSubscriptionCharges(db, user.id, '2026-10', '2026-10-22'))[0].status, 'PENDING');
    });
    await t.test('octubre: ocho entregas concurrentes crean un gasto y resuelven ambos avisos por el cobro mensual', async () => {
      const beforeCharges = await charges.loadSubscriptionCharges(db, user.id, '2026-10', '2026-10-22'); assert.equal(beforeCharges[0].status, 'PENDING');
      assert.ok((await notices()).some(n => n.id.startsWith(`subscription-${subscription.id}-`)));
      const input = event(); const receipts = await Promise.all(Array.from({ length: 8 }, () => service.receiveCaptureEvent(db, credential, input)));
      for (const receipt of receipts) assert.equal(JSON.stringify(receipt), JSON.stringify(receipts[0]));
      assert.equal(JSON.stringify(await service.receiveCaptureEvent(db, credential, input)), JSON.stringify(receipts[0]));
      const movement = (await read(input)).movement; assert.equal(movement.status, 'REGISTERED');
      assert.equal(await db.dailyExpense.count({ where: { userId: user.id } }), 2);
      const afterCharges = await charges.loadSubscriptionCharges(db, user.id, '2026-10', '2026-10-22');
      assert.equal(afterCharges[0].status, 'CONFIRMED'); assert.equal(afterCharges[0].confirmedAmount, 123.45);
      assert.equal(afterCharges[0].confirmedCardName, card.name); assert.equal(afterCharges[0].confirmedPaymentMethod, 'CARD');
      assert.ok(!(await notices()).some(n => n.id.startsWith(`subscription-${subscription.id}-`)));
      assert.deepEqual(await db.subscription.findUnique({ where: { id: subscription.id } }), originalSubscription);
    });
    await t.test('otro UUID o importe para el cobro ya resuelto conserva revisión y no crea otro gasto', async () => {
      assert.equal((await send(event())).reason, 'POSSIBLE_DUPLICATE');
      assert.equal((await send(event('2026-10', '222.22'))).reason, 'SUBSCRIPTION_CONFLICT');
      assert.equal(await db.dailyExpense.count({ where: { userId: user.id } }), 2);
      assert.equal(await db.subscriptionCharge.count({ where: { userId: user.id } }), 2);
    });
    await t.test('mes sin cobro, decisión omitida, moneda ajena y textos contradictorios no se automatizan', async () => {
      assert.equal((await send(event('2026-09'))).reason, 'SUBSCRIPTION_CONFLICT');
      await db.$transaction(tx => charges.applySubscriptionCharge(tx, user.id, { subscriptionId: subscription.id, month: '2026-06', action: 'skip', today: '2026-10-22' }));
      assert.equal((await send(event('2026-06', '333.33'))).reason, 'SUBSCRIPTION_CONFLICT');
      assert.equal((await send(event('2026-10', '444.44', { fields: { ...fixture.event.fields, 'android.subText': 'USD' } }))).reason, 'FOREIGN_CURRENCY');
      assert.equal((await send(event('2026-10', '444.44', { fields: { ...fixture.event.fields, 'android.title.big': 'Otro destinatario' } }))).reason, 'CONFLICTING_FIELDS');
      assert.equal(await db.dailyExpense.count({ where: { userId: user.id } }), 2);
    });
    await t.test('reasignar la regla deja una sola tarjeta, detiene el modo anterior y exige evidencia nueva', async () => {
      await configurePolicy(sibling.id);
      const policies = await db.captureAutomation.findMany({ where: { userId: user.id, parserKey } });
      assert.equal(policies.filter(p => p.completionPolicy).length, 1); assert.ok(policies.every(p => p.mode === 'OBSERVATION'));
      assert.equal((await readiness(sibling.id)).reviewedCaptures, 0); await assert.rejects(mode('AUTOMATIC', sibling.id), e => e.status === 409);
      const observed = await send(event('2026-04', '555.55')); assert.equal(observed.cardId, sibling.id); assert.equal(observed.status, 'OBSERVED');
      assert.equal(JSON.stringify(await service.receiveCaptureEvent(db, credential, oldInput)), JSON.stringify(oldReceipt));
    });
    await t.test('borrar la suscripción deja el aviso por revisar y nunca genera un gasto genérico', async () => {
      await db.subscription.delete({ where: { id: subscription.id } });
      const movement = await send(event('2026-04', '666.66')); assert.equal(movement.reason, 'FORMAT_POLICY_REQUIRED'); assert.equal(movement.expenseId, null);
    });
  } finally { await db.user.deleteMany({ where: { id: { in: [user.id, other.id] } } }); await db.$disconnect(); }
});
