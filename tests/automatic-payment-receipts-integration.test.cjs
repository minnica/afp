const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { sourceLoader } = require('./helpers/load-source.ts');
const fixture = require('./fixtures/captures/bbva-payment-receipt.es.v1.json');
const nu = require('./fixtures/captures/nu-card-payment.es.v1.json');
const connectionString = process.env.AFP_TEST_DATABASE_URL;
test('pagos automáticos: comprobantes y Nu con reglas explícitas, recibos y aislamiento reales', { skip: !connectionString }, async t => {
  const url = new URL(connectionString); assert.ok(['localhost','127.0.0.1'].includes(url.hostname) && /^\/afp_test\w*$/.test(url.pathname) && !url.search);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const load = sourceLoader(), service = load('src/lib/captureService.ts'), protocol = load('src/lib/captureProtocol.ts');
  const { paymentReceiptSource } = load('src/lib/paymentReceipts.ts');
  const user = await db.user.create({ data: { email: `receipt-${randomUUID()}@example.test` } });
  const card = await db.card.create({ data: { userId: user.id, name: 'DiDi ficticia', usualCutDay: 10, usualDueDay: 25 } });
  const nuCard = await db.card.create({ data: { userId: user.id, name: 'Nu ficticia', usualCutDay: 10, usualDueDay: 25 } });
  const cycle = await db.cardCycle.create({ data: { userId: user.id, cardId: card.id, month: 10, year: 2026,
    startDate: new Date('2026-09-11'), cutDate: new Date('2026-10-10'), dueDate: new Date('2026-10-25'), statementAmount: '500' } });
  const nuCycle = await db.cardCycle.create({ data: { userId: user.id, cardId: nuCard.id, month: 10, year: 2026,
    startDate: new Date('2026-09-11'), cutDate: new Date('2026-10-10'), dueDate: new Date('2026-10-25'), statementAmount: '123.45' } });
  const device = await db.captureDevice.create({ data: { userId: user.id, secretHash: protocol.captureHash(randomUUID()), approvedAt: new Date(), name: 'Ficticio' } });
  const credential = { id: device.id, secretHash: device.secretHash };
  const receipt = (text = fixture.text) => ({ contractVersion: 1, eventId: randomUUID(), sourcePackage: paymentReceiptSource,
    notificationKeyHash: protocol.captureHash(randomUUID()), postedAt: '2026-10-22T04:40:00.000Z', receivedAt: '2026-10-22T04:40:00.000Z',
    fields: { 'receipt.text': text, 'receipt.contentHash': protocol.captureHash(text), 'receipt.mimeType': 'image/png' } });
  const send = async input => { const r = await service.receiveCaptureEvent(db, credential, input); return (await db.captureEvent.findUnique({ where: { id: r.event.id }, include: { movement: true } })).movement; };
  const policy = async (ownCard = card, source = 'BBVA_RECEIPT') => db.capturePaymentPolicy.create({ data: { userId: user.id, cardId: ownCard.id, source,
    destinationLast4: source === 'BBVA_RECEIPT' ? '0009' : null, mode: 'AUTOMATIC', acceptedAt: new Date() } });
  const read = () => db.cardCycle.findUnique({ where: { id: cycle.id } });
  try {
    await t.test('sin regla recibe el comprobante pero no crea abono; notificaciones normales no admiten el canal interno', async () => {
      assert.throws(() => protocol.validateCaptureEvent(receipt()), e => e.status === 400);
      assert.equal((await send(receipt())).reason, 'PAYMENT_POLICY_REQUIRED'); assert.equal((await read()).paidAmount, null);
    });
    await policy();
    await t.test('comprobante compartido con varias entregas suma exactamente un pago', async () => {
      const input = receipt(); await Promise.all(Array.from({ length: 5 }, () => send(input)));
      assert.equal(String((await read()).paidAmount), '123.45');
      assert.equal(await db.cardCyclePayment.count({ where: { userId: user.id } }), 1);
    });
    await t.test('otra imagen del mismo rastreo vincula al pago anterior sin repetirlo; conflicto de datos queda por revisar', async () => {
      assert.equal((await send(receipt())).reason, 'PAYMENT_AUTOMATIC');
      assert.equal(String((await read()).paidAmount), '123.45');
      assert.equal((await send(receipt(fixture.text.replace('123.45','124.45')))).reason, 'REFERENCE_CONFLICT');
      assert.equal(await db.cardCyclePayment.count({ where: { userId: user.id } }), 1);
    });
    await t.test('nuevo rastreo e importe permite otro abono; importes iguales y excedentes necesitan revisión', async () => {
      const text = fixture.text.replace('123.45','100.00').replace('MBAN010026102200000000001','MBAN010026102200000000002');
      assert.equal((await send(receipt(text))).reason, 'PAYMENT_AUTOMATIC');
      assert.equal(String((await read()).paidAmount), '223.45');
      assert.equal((await send(receipt(text.replace('MBAN010026102200000000002','MBAN010026102200000000003')))).reason, 'PAYMENT_POSSIBLE_DUPLICATE');
      assert.equal((await send(receipt(text.replace('100.00','999.00').replace('MBAN010026102200000000002','MBAN010026102200000000004')))).reason, 'PAYMENT_EXCESS_REVIEW');
    });
    await t.test('mes equivocado no se convierte al mes actual y destino desconocido no se asigna por importe', async () => {
      assert.equal((await send(receipt(fixture.text.replace('octubre\nFecha','noviembre\nFecha').replace('MBAN010026102200000000001','MBAN010026102200000000005')))).reason, 'PAYMENT_CYCLE_REQUIRED');
      const p = await db.capturePaymentPolicy.findFirst({ where: { userId: user.id, source: 'BBVA_RECEIPT' } });
      await db.capturePaymentPolicy.update({ where: { id: p.id }, data: { destinationHash: 'a'.repeat(64) } });
      assert.equal((await send(receipt())).reason, 'PAYMENT_POLICY_REQUIRED');
      await db.capturePaymentPolicy.update({ where: { id: p.id }, data: { destinationHash: null } });
    });
    await t.test('Nu: un aviso de pago y un corte pendiente se registran sin compartir archivo', async () => {
      await policy(nuCard, 'NU_NOTICE');
      const input = { ...nu.event, contractVersion: 1, eventId: randomUUID(), notificationKeyHash: protocol.captureHash(randomUUID()) };
      assert.equal((await send(input)).reason, 'PAYMENT_AUTOMATIC');
      const c = await db.cardCycle.findUnique({ where: { id: nuCycle.id } }); assert.equal(c.status, 'PAID'); assert.equal(String(c.paidAmount), '123.45');
      assert.equal((await send({ ...input, eventId: randomUUID(), notificationKeyHash: protocol.captureHash(randomUUID()) })).reason, 'PAYMENT_CYCLE_REQUIRED');
    });
    await t.test('pagos manuales sin identificar impiden sumar un recibo potencialmente ya incluido', async () => {
      await db.cardCycle.update({ where: { id: cycle.id }, data: { paidAmount: '300', paidAt: new Date('2026-10-21') } });
      assert.equal((await send(receipt(fixture.text.replace('123.45','20.00').replace('MBAN010026102200000000001','MBAN010026102200000000006')))).reason, 'PAYMENT_MANUAL_TOTAL');
      assert.equal(await db.dailyExpense.count({ where: { userId: user.id } }), 0); assert.equal(await db.income.count({ where: { userId: user.id } }), 0);
    });
    await t.test('endpoint nativo recibe, consulta solo sus propios comprobantes y conserva los rechazos de autenticación', async () => {
      const route = sourceLoader({ '@/lib/prisma': { prisma: db } })('src/app/api/captures/payment-receipts/route.ts');
      const raw = { receiptVersion: 1, eventId: randomUUID(), contentHash: protocol.captureHash(randomUUID()), extractedText: fixture.text, receivedAt: '2026-10-22T04:40:00.000Z', mimeType: 'image/png' };
      const secret = Buffer.alloc(32, 7).toString('base64url'); await db.captureDevice.update({ where: { id: device.id }, data: { secretHash: protocol.captureHash(secret) } });
      const request = (method, body = raw, query = '') => new Request('http://localhost/api/captures/payment-receipts'+query, { method,
        headers: { Authorization: `Capture ${device.id}.${secret}`, 'Content-Type': 'application/json' }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) });
      const response = await route.POST(request('POST')); assert.equal(response.status, 200); assert.equal((await response.json()).result.status, 'REGISTERED');
      assert.equal((await route.GET(request('GET', null, '?eventId='+raw.eventId))).status, 200);
      assert.equal((await route.GET(request('GET', null, '?eventId='+randomUUID()))).status, 404);
      assert.equal((await route.POST(request('POST', { ...raw, userId: 'other' }))).status, 400);
    });
  } finally { await db.user.delete({ where: { id: user.id } }); await db.$disconnect(); }
});
