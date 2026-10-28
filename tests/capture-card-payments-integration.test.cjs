const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomUUID, randomBytes } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { sourceLoader } = require('./helpers/load-source.cjs');
const fixture = require('./fixtures/captures/nu-card-payment.es.v1.json');
const connectionString = process.env.AFP_TEST_DATABASE_URL;

test('pagos capturados: recepción, revisión y acumulados transaccionales con PostgreSQL', { skip: !connectionString }, async t => {
  const url = new URL(connectionString);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && /^\/afp_test\w*$/.test(url.pathname) && !url.search);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const load = sourceLoader(), protocol = load('src/lib/captureProtocol.ts');
  const service = load('src/lib/captureService.ts'), processing = load('src/lib/captureProcessing.ts');
  const payments = load('src/lib/capturePayments.ts'), balances = load('src/lib/cardBalanceTracking.ts');
  const user = await db.user.create({ data: { email: `payment-${randomUUID()}@example.test` } });
  const other = await db.user.create({ data: { email: `payment-other-${randomUUID()}@example.test` } });
  const card = await db.card.create({ data: { userId: user.id, name: 'Nu ficticia', usualCutDay: 10, usualDueDay: 25,
    creditLimit: '10000', usedBalance: '2000', balanceAsOf: new Date('2026-10-20'),
    balanceTracking: { version: 1, day: '2026-10-20', captureId: randomUUID(), startedAt: '2026-10-20T12:00:00Z', baseExposureCents: '0' } } });
  const cycle = await db.cardCycle.create({ data: { userId: user.id, cardId: card.id, month: 10, year: 2026,
    startDate: new Date('2026-09-11'), cutDate: new Date('2026-10-10'), dueDate: new Date(Date.now() + 30 * 86400000), statementAmount: '1000' } });
  const noStatement = await db.cardCycle.create({ data: { userId: user.id, cardId: card.id, month: 11, year: 2026,
    startDate: new Date('2026-10-11'), cutDate: new Date('2026-11-10'), dueDate: new Date('2026-11-25') } });
  const device = await db.captureDevice.create({ data: { userId: user.id, name: 'Ficticio', approvedAt: new Date(), secretHash: protocol.captureHash(randomBytes(32).toString('base64url')) } });
  const credential = { id: device.id, secretHash: device.secretHash };
  const event = () => protocol.validateCaptureEvent({ ...fixture.event, contractVersion: 1, eventId: randomUUID(), notificationKeyHash: protocol.captureHash(randomUUID()) });
  const send = async (input = event()) => {
    await service.receiveCaptureEvent(db, credential, input);
    return (await db.captureEvent.findUnique({ where: { deviceId_eventId: { deviceId: device.id, eventId: input.eventId } }, include: { movement: true } })).movement;
  };
  const read = () => db.cardCycle.findUnique({ where: { id: cycle.id } });
  const data = async (extras = {}) => { const c = await read(); return { cycleId: cycle.id, amount: '123.45', date: '2026-10-21', currency: 'MXN', confirmedApplied: true,
    expectedPaidAmount: String(c.paidAmount ?? 0), expectedPaidAt: c.paidAt?.toISOString().slice(0, 10) || null, ...extras }; };
  const resolve = (m, action, payment, owner = user.id) => processing.resolveCaptureMovement(db, owner, { id: m.id, action, ...(payment ? { payment } : {}) });
  let movement, payload;
  try {
    await t.test('recepción repetida deja un solo aviso pendiente, sin tocar pagos, gastos o ingresos', async () => {
      const input = event(); await Promise.all(Array.from({ length: 5 }, () => service.receiveCaptureEvent(db, credential, input)));
      movement = await send(input);
      assert.equal(movement.reason, 'PAYMENT_POLICY_REQUIRED'); assert.equal(movement.status, 'REVIEW');
      assert.equal(await db.captureMovement.count({ where: { userId: user.id } }), 1);
      assert.equal((await read()).paidAmount, null); assert.equal(await db.dailyExpense.count({ where: { userId: user.id } }), 0);
      assert.equal(await db.income.count({ where: { userId: user.id } }), 0);
    });
    await t.test('aislamiento, corte sin estado, moneda, fecha futura y concepto que contradice el período', async () => {
      await assert.rejects(resolve(movement, 'registerPayment', await data(), other.id), e => e.status === 404);
      for (const extras of [{ cycleId: noStatement.id }, { statementConcept: 'estado de cuenta septiembre' }, { statementConcept: 'estado de cuenta octubre 2025' }, { currency: 'USD' }, { confirmedApplied: false }, { date: '2099-01-01' }]) {
        await assert.rejects(resolve(movement, 'registerPayment', await data(extras)), e => [400, 409].includes(e.status));
      }
      assert.equal(await db.cardCyclePayment.count({ where: { userId: user.id } }), 0);
    });
    await t.test('no permite registrar, corregir o vincular el pago como compra', async () => {
      for (const action of ['register', 'distinct', 'link', 'linkInstallment', 'correct', 'convertToInstallments']) await assert.rejects(resolve(movement, action), e => e.status === 409);
    });
    await t.test('confirmaciones concurrentes suman un abono una sola vez y conservan el recibo', async () => {
      payload = await data({ statementConcept: 'estado de cuenta octubre' });
      await Promise.all(Array.from({ length: 5 }, () => resolve(movement, 'registerPayment', payload)));
      assert.equal(String((await read()).paidAmount), '123.45'); assert.equal((await read()).status, 'PAYMENT_PENDING');
      assert.equal(await db.cardCyclePayment.count({ where: { userId: user.id } }), 1);
      await assert.rejects(resolve(movement, 'registerPayment', { ...payload, amount: '456.78' }), e => e.status === 409);
      const exposure = await balances.loadBalanceMovements(db, user.id, [card], '2026-10-22');
      assert.equal(balances.getTrackedCard(card, exposure, '2026-10-22').usedBalance, '1876.55');
      const found = await db.captureMovement.findUnique({ where: { id: movement.id } });
      assert.equal(found.expenseId, null); assert.equal(found.correction.dateSource, 'OWNER_CONFIRMED');
      assert.equal((await processing.captureCandidates(db, user.id, { cardId: card.id, date: '2026-10-21', amount: '123.45' })).length, 0);
    });
    await t.test('mismo importe en otro aviso exige confirmar abono distinto; total desactualizado se rechaza', async () => {
      const m = await send();
      await assert.rejects(resolve(m, 'registerPayment', await data()), e => e.status === 409);
      await assert.rejects(resolve(m, 'registerPayment', await data({ distinct: true, expectedPaidAmount: '0' })), e => e.status === 409);
      await resolve(m, 'registerPayment', await data({ amount: '876.55', distinct: true }));
      assert.equal(String((await read()).paidAmount), '1000'); assert.equal((await read()).status, 'PAID');
      await resolve(m, 'reversePayment'); assert.equal(String((await read()).paidAmount), '123.45');
      assert.equal((await read()).status, 'PAYMENT_PENDING');
    });
    await t.test('editar total no borra abonos identificados; reversión y reintento no reaplican', async () => {
      const current = await read();
      await assert.rejects(db.$transaction(tx => payments.guardCapturedPaymentTotal(tx, current, { paidAmount: null, paidAt: null })), e => e.status === 409);
      await resolve(movement, 'reversePayment'); await resolve(movement, 'reversePayment');
      assert.equal((await read()).paidAmount, null); assert.equal((await read()).paidAt, null);
      await resolve(movement, 'registerPayment', payload); assert.equal((await read()).paidAmount, null);
      assert.equal(await db.dailyExpense.count({ where: { userId: user.id } }), 0);
    });
    await t.test('pago incluido en el total: vincular no aumenta saldo, capacidad y desvinculación son consistentes', async () => {
      await db.cardCycle.update({ where: { id: cycle.id }, data: { paidAmount: '500', paidAt: new Date('2026-10-21T12:00:00Z') } });
      const m = await send(); await resolve(m, 'linkPayment', await data({ amount: '400' }));
      assert.equal(String((await read()).paidAmount), '500');
      const second = await send(); await assert.rejects(resolve(second, 'linkPayment', await data({ amount: '200' })), e => e.status === 409);
      await resolve(m, 'reversePayment'); assert.equal(String((await read()).paidAmount), '500');
      await resolve(second, 'linkPayment', await data({ amount: '200' }));
    });
    await t.test('fallo después de escribir el recibo revierte todo en PostgreSQL', async () => {
      const m = await send(), p = await data({ amount: '12.34', distinct: true });
      const failing = { $transaction: callback => db.$transaction(tx => callback(new Proxy(tx, { get: (target, property) => property === 'cardCycle'
        ? new Proxy(target.cardCycle, { get: (model, method) => method === 'update' ? async () => { throw new Error('forced rollback'); } : model[method] }) : target[property] }))) };
      await assert.rejects(processing.resolveCaptureMovement(failing, user.id, { id: m.id, action: 'registerPayment', payment: p }), /forced rollback/);
      assert.equal(await db.cardCyclePayment.count({ where: { movementId: m.id } }), 0);
      assert.equal((await db.captureMovement.findUnique({ where: { id: m.id } })).status, 'REVIEW');
      assert.equal(String((await read()).paidAmount), '500');
    });
    await t.test('aviso BBVA excluido antiguamente se reinterpreta; descarte personal permanece terminal', async () => {
      const input = event(); input.sourcePackage = 'com.bancomer.mbanking'; input.fields = { 'android.title': 'Aviso de cargo en tu cuenta', 'android.text': 'Tienes un cargo a tu cuenta *0123 de $123.45. Resto ficticio.' };
      const m = await send(input);
      await db.captureMovement.update({ where: { id: m.id }, data: { status: 'DISCARDED', reason: 'NON_CREDIT_ACCOUNT' } });
      const reinterpreted = await resolve(m, 'reinterpret'); assert.equal(reinterpreted.status, 'REVIEW'); assert.equal(reinterpreted.proposal.cardId, undefined);
      assert.equal(reinterpreted.analysisHistory.length, 1);
      await resolve(m, 'discard'); await assert.rejects(resolve(m, 'reinterpret'), e => e.status === 409);
    });
  } finally { await db.user.deleteMany({ where: { id: { in: [user.id, other.id] } } }); await db.$disconnect(); }
});
