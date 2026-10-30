import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import fixture from './fixtures/captures/gmail-uber-receipt.es.v1.json';
import { integrationLoader } from './helpers/integration-fixtures';
import { captureProposal } from '../src/lib/captureJson';
import { present } from './helpers/financial-fixtures';

const connectionString = process.env.AFP_TEST_DATABASE_URL;
test('Gmail Uber PostgreSQL: fecha real, banco, propinas, pausas, revisiones e idempotencia', { skip: !connectionString }, async t => {
  const url = new URL(present(connectionString));
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && /^\/afp_test\w*$/.test(url.pathname) && !url.search);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const load = integrationLoader();
  const { receiveCaptureEvent } = load('src/lib/captureService.ts');
  const { validateCaptureEvent, captureHash } = load('src/lib/captureProtocol.ts');
  const { configureCapture } = load('src/lib/captureConfiguration.ts');
  const { resolveCaptureMovement } = load('src/lib/captureProcessing.ts');
  const ownerIds: string[] = [];
  async function setup(mode = 'AUTOMATIC', source = 'com.mercadopago.wallet') {
    const owner = await db.user.create({ data: { email: `gmail-${randomUUID()}@example.test` } }); ownerIds.push(owner.id);
    const card = await db.card.create({ data: { userId: owner.id, name: 'Nombre editable', usualCutDay: 20, usualDueDay: 10 } });
    await db.captureCardAlias.create({ data: { userId: owner.id, cardId: card.id, sourcePackage: source,
      kind: 'DIGITAL', value: '0123', verifiedAt: new Date(), evidence: 'Ficticia' } });
    await db.captureAutomation.create({ data: { userId: owner.id, cardId: card.id, parserKey: 'gmail.uber-receipt.es.v1', mode, datePolicy: 'RECEIPT_OPERATION' } });
    if (source === 'com.mercadopago.wallet') await db.captureAutomation.create({ data: { userId: owner.id, cardId: card.id,
      parserKey: 'mercadopago.card-purchase.es.v1', mode: 'AUTOMATIC', completionPolicy: 'MERCADOPAGO_CREDIT_MXN',
      datePolicy: 'NOTIFICATION_POSTED_AT', policyAcceptedAt: new Date('2026-10-01T00:00:00Z') } });
    const device = await db.captureDevice.create({ data: { userId: owner.id, name: 'Ficticio', approvedAt: new Date(),
      secretHash: captureHash(randomBytes(32).toString('base64url')) } });
    const credential = { id: device.id, secretHash: device.secretHash };
    const input = (tip = false, fields = fixture.event.fields, postedAt = fixture.event.postedAt) => validateCaptureEvent({
      ...fixture.event, eventId: randomUUID(), notificationKeyHash: 'b'.repeat(64), postedAt, receivedAt: postedAt,
      fields: { ...fields, 'android.bigText': tip ? fields['android.bigText'].replace('Gracias por usar Uber', 'Gracias por el monto extra')
        .replace('Total\nMXN 160.25', 'Total\nMXN 180.25').replace('Pagos\n', 'Monto propina\nMXN 20.00\nPagos\n') : fields['android.bigText'] },
    });
    const send = async (event: ReturnType<typeof validateCaptureEvent>) => {
      await receiveCaptureEvent(db, credential, event);
      return present((await db.captureEvent.findUnique({ where: { deviceId_eventId: { deviceId: device.id, eventId: event.eventId } }, include: { movement: { include: { expense: true } } } }))?.movement);
    };
    const bank = (amount = '160.25') => send(validateCaptureEvent({ ...fixture.event, eventId: randomUUID(), notificationKeyHash: captureHash(randomUUID()),
      sourcePackage: 'com.mercadopago.wallet', fields: { 'android.title': `Compra por $ ${amount} fue aprobada`,
        'android.text': 'Ve los detalles de tu compra en DLO*SERV UBER RIDES aquí.' } }));
    const count = () => db.dailyExpense.count({ where: { userId: owner.id } });
    return { owner, card, device, input, send, bank, count };
  }
  try {
    await t.test('banco primero: un gasto con fecha del viaje y originales preservados', async () => {
      const c = await setup(), bank = await c.bank();
      assert.equal(bank.expense?.date.toISOString().slice(0, 10), '2026-10-15');
      const receipt = await c.send(c.input());
      assert.equal(receipt.reason, 'UBER_RECEIPT_LINKED');
      assert.equal(receipt.expenseId, bank.expenseId);
      assert.equal(receipt.expense?.date.toISOString().slice(0, 10), '2026-10-14');
      assert.equal(await c.count(), 1);
      const preserved = await db.captureMovement.findUniqueOrThrow({ where: { id: bank.id } });
      assert.equal(captureProposal(preserved.proposal).date, '2026-10-15');
    });
    await t.test('recibo primero: banco tardío vinculado sin segundo gasto', async () => {
      const c = await setup(), receipt = await c.send(c.input(false, fixture.event.fields, '2026-10-15T01:00:00Z'));
      const bank = await c.bank();
      assert.equal(bank.reason, 'UBER_BANK_LINKED'); assert.equal(bank.expenseId, receipt.expenseId);
      assert.equal(bank.expense?.date.toISOString().slice(0, 10), '2026-10-14'); assert.equal(await c.count(), 1);
    });
    await t.test('HSBC sin aviso bancario: recibo completo usa alias verificado del propietario', async () => {
      const c = await setup('AUTOMATIC', 'mx.hsbc.hsbcmexico'), receipt = await c.send(c.input(true));
      assert.equal(receipt.status, 'REGISTERED'); assert.equal(receipt.expense?.amount.toString(), '180.25');
      assert.equal(receipt.expense?.cardId, c.card.id); assert.equal(await c.count(), 1);
    });
    await t.test('propina: reemplaza el total una vez y conserva ambos recibos', async () => {
      const c = await setup(), base = await c.send(c.input()), tip = c.input(true);
      const outputs = await Promise.all(Array.from({ length: 6 }, () => c.send(tip)));
      for (const output of outputs) { assert.equal(output.expenseId, base.expenseId); assert.equal(output.reason, 'UBER_RECEIPT_UPDATED'); }
      assert.equal((await db.dailyExpense.findUniqueOrThrow({ where: { id: base.expenseId! } })).amount.toString(), '180.25');
      assert.equal(await c.count(), 1);
      const old = await c.send(c.input()); assert.equal(old.reason, 'UBER_RECEIPT_OLDER');
      assert.equal(old.expense?.amount.toString(), '180.25');
      assert.equal(captureProposal((await db.captureMovement.findUniqueOrThrow({ where: { id: base.id } })).proposal).amount, '160.25');
    });
    await t.test('recibo actualizado primero: cargos desglosados y recibo anterior no duplican ni reducen el total', async () => {
      const c = await setup(), receipt = await c.send(c.input(true));
      assert.equal((await c.bank('160.25')).expenseId, receipt.expenseId);
      assert.equal((await c.bank('20.00')).expenseId, receipt.expenseId);
      assert.equal((await c.bank('160.25')).reason, 'POSSIBLE_DUPLICATE');
      assert.equal((await c.send(c.input())).reason, 'UBER_RECEIPT_OLDER'); assert.equal(await c.count(), 1);
    });
    await t.test('fuente en observación y aviso recortado no generan gastos', async () => {
      const c = await setup('OBSERVATION'); assert.equal((await c.send(c.input())).status, 'OBSERVED'); assert.equal(await c.count(), 0);
      const d = await setup(), fields = { ...fixture.event.fields, 'android.bigText': fixture.event.fields['android.bigText'].split('Pagos')[0]! };
      const partial = await d.send(d.input(false, fields));
      assert.equal(partial.reason, 'UBER_RECEIPT_CARD_REQUIRED'); assert.equal(captureProposal(partial.proposal).date, '2026-10-14'); assert.equal(await d.count(), 0);
    });
    await t.test('gasto editado conserva la decisión personal y bloquea crear otro por la propina', async () => {
      const c = await setup(), base = await c.send(c.input());
      await db.dailyExpense.update({ where: { id: base.expenseId! }, data: { concept: 'Cambio personal', updatedAt: new Date(Date.now() + 1000) } });
      const changed = await c.send(c.input(true)); assert.equal(changed.reason, 'UBER_RECEIPT_CHANGED');
      await assert.rejects(resolveCaptureMovement(db, c.owner.id, { id: changed.id, action: 'distinct' }));
      assert.equal(await c.count(), 1); assert.equal((await db.dailyExpense.findUniqueOrThrow({ where: { id: base.expenseId! } })).amount.toString(), '160.25');
    });
    await t.test('gasto borrado no resucita por una propina posterior', async () => {
      const c = await setup(), base = await c.send(c.input());
      await db.dailyExpense.delete({ where: { id: base.expenseId! } });
      assert.equal((await c.send(c.input(true))).reason, 'UBER_RECEIPT_CHANGED'); assert.equal(await c.count(), 0);
    });
    await t.test('activación exige fecha del recibo y Gmail no puede usarse como banco en alias', async () => {
      const c = await setup('OBSERVATION');
      await assert.rejects(configureCapture(db, c.owner.id, { action: 'automation', cardId: c.card.id, parserKey: 'gmail.uber-receipt.es.v1', mode: 'AUTOMATIC' }));
      await assert.rejects(configureCapture(db, c.owner.id, { action: 'alias', cardId: c.card.id, sourcePackage: 'com.google.android.gm', kind: 'DIGITAL', value: '0456', verified: true, evidence: 'Ficticia' }));
    });
    await t.test('alias en colisión requiere revisión, sin elegir por nombre', async () => {
      const c = await setup(), other = await db.card.create({ data: { userId: c.owner.id, name: 'HSBC 1', usualCutDay: 15, usualDueDay: 10 } });
      await db.captureCardAlias.create({ data: { userId: c.owner.id, cardId: other.id, sourcePackage: 'mx.hsbc.hsbcmexico', kind: 'PHYSICAL', value: '0123', verifiedAt: new Date() } });
      assert.equal((await c.send(c.input())).reason, 'AMBIGUOUS_CARD'); assert.equal(await c.count(), 0);
    });
    await t.test('varios cargos Uber iguales no eligen el primero ni cambian fechas', async () => {
      const c = await setup(), bank = await c.bank();
      const expense = await db.dailyExpense.findUniqueOrThrow({ where: { id: bank.expenseId! } });
      await db.dailyExpense.create({ data: { userId: c.owner.id, cardId: c.card.id, categoryId: expense.categoryId,
        paymentMethod: 'CARD', concept: 'Otro viaje Uber', amount: '160.25', date: expense.date } });
      assert.equal((await c.send(c.input())).reason, 'UBER_RECEIPT_CHANGED');
      assert.equal((await db.dailyExpense.findUniqueOrThrow({ where: { id: expense.id } })).date.toISOString().slice(0, 10), '2026-10-15');
      assert.equal(await c.count(), 2);
    });
    await t.test('mismo importe en viajes de días distintos conserva dos gastos', async () => {
      const c = await setup(); await c.send(c.input());
      const fields = { ...fixture.event.fields, 'android.bigText': fixture.event.fields['android.bigText'].replaceAll('14/10/2026', '15/10/2026') };
      const next = await c.send(c.input(false, fields, '2026-10-16T01:00:00Z'));
      assert.equal(next.status, 'REGISTERED'); assert.equal(await c.count(), 2);
    });
  } finally { await db.user.deleteMany({ where: { id: { in: ownerIds } } }); await db.$disconnect(); }
});
