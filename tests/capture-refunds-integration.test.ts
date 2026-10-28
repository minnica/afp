import jsonFixture0 from './fixtures/captures/banamex-purchase-cancellation.es.v1.json';
import { array,record as objectValue } from './helpers/dynamic-values';
import { plain,present,sparseCalculations } from './helpers/financial-fixtures';
import type { CaptureInput } from './helpers/integration-fixtures';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { test } from 'node:test';
import fixture from './fixtures/captures/mercadopago-refund.es.v1.json';
import { integrationLoader as sourceLoader } from './helpers/integration-fixtures';
const connectionString = process.env.AFP_TEST_DATABASE_URL;

test('devoluciones PostgreSQL: confirmación, neto exacto, historial e idempotencia con aislamiento', { skip: !connectionString }, async t => {
  const url = new URL(present(connectionString));
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && /^\/afp_test\w*$/.test(url.pathname) && !url.search);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const users = await Promise.all(['owner', 'other'].map(name => db.user.create({ data: { email: `refund-${name}-${randomUUID()}@example.test` } })));
  const [user, other] = users;
  const load = sourceLoader({ '@/lib/prisma': { prisma: db }, '@/lib/calendar/schedule': { scheduleCalendarSync() {} },
    'next/server': { NextResponse: { json: (body: unknown, options = {}) => ({ body: plain(body), status: options.status || 200 }) } },
    '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async token => ({ data: { user: token === 'owner' ? user : token === 'other' ? other : null } }) } }) },
  });
  const protocol = sparseCalculations(load('src/lib/captureProtocol.ts')), service = load('src/lib/captureService.ts'), processing = load('src/lib/captureProcessing.ts');
  const refunds = load('src/lib/captureRefunds.ts'), movementRoute = load('src/app/api/captures/movements/route.ts');
  const expenseRoute = load('src/app/api/expenses/route.ts');
  const card = await db.card.create({ data: { userId: present(user).id, name: 'MP ficticia', usualCutDay: 25, usualDueDay: 15 } });
  const category = await db.category.create({ data: { userId: present(user).id, name: 'Transporte ficticio' } });
  const policy = await db.captureAutomation.create({ data: { userId: present(user).id, cardId: card.id, parserKey: 'mercadopago.card-purchase.es.v1',
    mode: 'AUTOMATIC', completionPolicy: 'MERCADOPAGO_CREDIT_MXN', policyAcceptedAt: new Date('2026-10-01T00:00:00Z'), datePolicy: 'NOTIFICATION_POSTED_AT' } });
  const alias = await db.captureCardAlias.create({ data: { userId: present(user).id, cardId: card.id, sourcePackage: 'com.mercadopago.wallet', kind: 'DIGITAL', value: '0123', verifiedAt: new Date() } });
  const secret = randomBytes(32).toString('base64url');
  const device = await db.captureDevice.create({ data: { userId: present(user).id, approvedAt: new Date(), name: 'Ficticio', secretHash: protocol.captureHash(secret) } });
  const credential = { id: device.id, secretHash: device.secretHash };
  const event = (fields: Record<string, string>, postedAt = '2026-10-24T18:00:00Z') => protocol.validateCaptureEvent({ contractVersion: 1 as const, eventId: randomUUID(),
    sourcePackage: 'com.mercadopago.wallet', notificationKeyHash: protocol.captureHash(randomUUID()), fields,
    postedAt, receivedAt: '2026-10-24T19:00:00Z' });
  const send = async (input: CaptureInput) => {
    await service.receiveCaptureEvent(db, credential, input);
    return present((await db.captureEvent.findUnique({ where: { deviceId_eventId: { deviceId: device.id, eventId: input.eventId } }, include: { movement: true } }))).movement;
  };
  const sale = async (merchant: string, amount = '100.00', postedAt = '2026-10-24T17:00:00Z') => {
    let movement = await send(event({ 'android.title': `Compra por $ ${amount} fue aprobada`, 'android.text': `Ve los detalles de tu compra en ${merchant} aquí.` }, postedAt));
    if (present(movement).reason === 'POSSIBLE_DUPLICATE') movement = await processing.resolveCaptureMovement(db, present(user).id, { id: present(movement).id, action: 'distinct' });
    assert.equal(present(movement).status, 'REGISTERED'); return movement;
  };
  const notice = (merchant: string, amount = '100.00') => event({ ...fixture.event.fields,
    'android.title': `${merchant} te devolvió $${amount}`, 'android.title.big': `${merchant} te devolvió $${amount}` });
  const detail = (movement: import('@prisma/client').CaptureMovement | null) => refunds.refundDetail(db, present(user).id, present(movement));
  const apply = async (movement: import('@prisma/client').CaptureMovement | null, candidate?: { id: string; concept: string; cardId: string | null; amount: string; originalAmount: string; date: Date; updatedAt: Date; } | undefined | null | { id: string; updatedAt: Date; }, extra = {}) => {
    candidate ||= (await detail(movement)).candidates[0];
    return processing.resolveCaptureMovement(db, present(user).id, { id: present(movement).id, action: 'applyRefund', expenseId: candidate?.id,
      expectedExpenseUpdatedAt: candidate?.updatedAt.toISOString(), ...extra });
  };
  const expense = (movement: import('@prisma/client').CaptureMovement | null) => db.dailyExpense.findUnique({ where: { id: present(present(movement).expenseId) } });
  const request = (body: unknown, token = 'owner', method = 'PATCH', query = '') => new Request(`http://localhost/api/test?${query}`, {
    method, headers: { authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let completeSale: import('@prisma/client').CaptureMovement | null, completeRefund: import('@prisma/client').CaptureMovement | null, partialSale: import('@prisma/client').CaptureMovement | null;
  try {
    await t.test('avisos recibidos se revisan sin gasto nuevo, abono, ingreso ni actualización automática', async () => {
      completeSale = await sale('TOTAL FICTICIO');
      const input = notice('TOTAL FICTICIO'); completeRefund = await send(input);
      assert.equal(present(completeRefund).status, 'REVIEW'); assert.equal(present(completeRefund).reason, 'REFUND_REVIEW');
      assert.equal(objectValue(present(present(completeRefund).proposal)).currency, 'MXN'); assert.equal(objectValue(present(present(completeRefund).proposal)).cardId, card.id);
      assert.equal(await db.expenseRefund.count({ where: { userId: present(user).id } }), 0);
      assert.equal(String(present((await expense(completeSale))).amount), '100');
      assert.equal((await detail(completeRefund)).candidates.length, 1);
      await service.receiveCaptureEvent(db, credential, input);
      assert.equal(await db.captureEvent.count({ where: { deviceId: device.id, eventId: input.eventId } }), 1);
      for (const action of ['register', 'distinct', 'link', 'correct', 'convertToInstallments'] as const) {
        await assert.rejects(processing.resolveCaptureMovement(db, present(user).id, { id: present(completeRefund).id, action }), e => objectValue(e).status === 409);
      }
      assert.equal((await movementRoute.GET(request(undefined, 'other', 'GET', `id=${present(completeRefund).id}`))).status, 404);
      assert.equal((await movementRoute.PATCH(request({ id: present(completeRefund).id, action: 'applyRefund' }, 'other'))).status, 404);
      assert.equal((await movementRoute.PATCH(request({}, 'expired'))).status, 401);
    });
    await t.test('devolución total concurrente descuenta una vez, preserva ediciones y cargo original, limpia conciliación', async () => {
      await db.dailyExpense.update({ where: { id: present(present(completeSale).expenseId) }, data: { concept: 'Mi concepto editado', notes: 'Conservar', categoryId: category.id,
        reconciliationStatus: 'CONFIRMED', reconciledAt: new Date() } });
      const before = await expense(completeSale), original = await db.captureEvent.findFirst({ where: { movementId: present(completeRefund).id } });
      const candidate = (await detail(completeRefund)).candidates[0];
      await Promise.all(Array.from({ length: 6 }, () => apply(completeRefund, candidate)));
      const after = await expense(completeSale);
      assert.equal(String(present(after).amount), '0'); assert.equal(String(present(after).refundOriginalAmount), '100');
      for (const k of ['id', 'date', 'cardId', 'concept', 'categoryId', 'notes'] as const) assert.deepEqual(present(after)[k], present(before)[k]);
      assert.equal(present(after).reconciliationStatus, 'PENDING'); assert.equal(present(after).reconciledAt, null);
      assert.equal(await db.expenseRefund.count({ where: { movementId: present(completeRefund).id } }), 1);
      const ledger = await db.expenseRefund.findUnique({ where: { movementId: present(completeRefund).id } });
      assert.equal(objectValue(present(present(ledger).expenseSnapshot)).amount, '100'); assert.equal(objectValue(present(present(ledger).expenseSnapshot)).concept, present(before).concept);
      assert.deepEqual(await db.captureEvent.findUnique({ where: { id: present(original).id } }), original);
      const repeated = await send(notice('TOTAL FICTICIO'));
      assert.equal((await detail(repeated)).candidates.length, 0);
      await assert.rejects(apply(repeated), e => objectValue(e).status === 409);
      const late = await send(event({ 'android.title': 'Compra por $ 100.00 fue aprobada', 'android.text': 'Ve los detalles de tu compra en TOTAL FICTICIO aquí.' }, '2026-10-24T17:00:00Z'));
      assert.equal(present(late).reason, 'POSSIBLE_DUPLICATE'); assert.equal(present(late).expenseId, null);
    });
    await t.test('totales y edición del gasto usan neto cero; no permite cambiar la base financiera a escondidas', async () => {
      const row = await expense(completeSale);
      const body = { id: present(row).id, amount: '0', date: '2026-10-24', paymentMethod: 'CARD', cardId: card.id,
        concept: 'Concepto confirmado', categoryId: category.id, cashContributionAmount: 0, subscriptionId: null };
      assert.equal((await expenseRoute.PATCH(request(body))).status, 200);
      assert.equal((await expenseRoute.PATCH(request({ ...body, amount: '1' }))).status, 409);
      assert.equal((await expenseRoute.PATCH(request({ ...body, paymentMethod: 'CASH', cardId: null }))).status, 409);
      const loaded = await expenseRoute.GET(request(undefined, 'owner', 'GET'));
      assert.equal(loaded.body.total, 0); assert.equal(loaded.body.personalTotal, 0);
      assert.equal(objectValue(array(loaded.body.expenses)[0]).refundOriginalAmount, '100');
    });
    await t.test('deshacer restaura el neto sin borrar historial; reintentos no vuelven a aplicarlo', async () => {
      await processing.resolveCaptureMovement(db, present(user).id, { id: present(completeRefund).id, action: 'reverseRefund' });
      await processing.resolveCaptureMovement(db, present(user).id, { id: present(completeRefund).id, action: 'reverseRefund' });
      await apply(completeRefund);
      const row = await expense(completeSale);
      assert.equal(String(present(row).amount), '100'); assert.equal(present(row).refundOriginalAmount, null);
      assert.ok(present((await db.expenseRefund.findUnique({ where: { movementId: present(completeRefund).id } }))).reversedAt);
    });
    await t.test('parciales acumuladas, aviso repetido, elección explícita de otra devolución y límite del cargo', async () => {
      partialSale = await sale('PARCIAL FICTICIO');
      const first = await send(notice('PARCIAL FICTICIO', '30.00')); await apply(first);
      const second = await send(notice('PARCIAL FICTICIO', '20.00')); await apply(second);
      assert.equal(String(present((await expense(partialSale))).amount), '50');
      const repeated = await send(notice('PARCIAL FICTICIO', '30.00'));
      await assert.rejects(apply(repeated), e => objectValue(e).status === 409);
      await apply(repeated, null, { distinctRefund: true });
      assert.equal(String(present((await expense(partialSale))).amount), '20');
      const excess = await send(notice('PARCIAL FICTICIO', '20.01'));
      assert.equal((await detail(excess)).candidates.length, 0); await assert.rejects(apply(excess), e => objectValue(e).status === 409);
      const final = await send(notice('PARCIAL FICTICIO', '20.00')); await apply(final, null, { distinctRefund: true });
      assert.equal(String(present((await expense(partialSale))).amount), '0');
      await processing.resolveCaptureMovement(db, present(user).id, { id: present(first).id, action: 'reverseRefund' });
      assert.equal(String(present((await expense(partialSale))).amount), '30');
      assert.equal(String(present((await expense(partialSale))).refundOriginalAmount), '100');
    });
    await t.test('notificación adelantada y compras ambiguas siempre esperan selección y confirmación', async () => {
      const early = await send(notice('LLEGO ANTES FICTICIO'));
      assert.equal((await detail(early)).candidates.length, 0);
      await sale('LLEGO ANTES FICTICIO'); assert.equal((await detail(early)).candidates.length, 1);
      const a = await sale('AMBIGUO FICTICIO'); const b = await sale('AMBIGUO FICTICIO');
      const refund = await send(notice('AMBIGUO FICTICIO')); const options = (await detail(refund)).candidates;
      assert.equal(options.length, 2);
      await apply(refund, options.find(row => row.id === present(b).expenseId));
      assert.equal(String(present((await expense(a))).amount), '100'); assert.equal(String(present((await expense(b))).amount), '0');
    });
    await t.test('solo propone compras anteriores al aviso dentro de treinta días completos', async () => {
      const inside = await sale('LIMITE FICTICIO', '100.00', '2026-09-24T17:00:00Z');
      await sale('LIMITE FICTICIO', '100.00', '2026-09-23T17:00:00Z');
      await sale('LIMITE FICTICIO', '100.00', '2026-10-24T18:01:00Z');
      const refund = await send(notice('LIMITE FICTICIO'));
      const options = (await detail(refund)).candidates;
      assert.equal(options.length, 1); assert.equal(present(options[0]).id, present(inside).expenseId);
    });
    await t.test('cambios de gasto o regla posteriores, gastos ajenos y alias no verificado bloquean la aplicación', async () => {
      const saleRow = await sale('CAMBIOS FICTICIO'), refund = await send(notice('CAMBIOS FICTICIO'));
      const candidate = (await detail(refund)).candidates[0];
      await db.dailyExpense.update({ where: { id: present(present(saleRow).expenseId) }, data: { notes: 'Otra pestaña' } });
      await assert.rejects(apply(refund, candidate), e => objectValue(e).status === 409);
      await db.captureCardAlias.update({ where: { id: alias.id }, data: { verifiedAt: null } });
      await assert.rejects(apply(refund), e => objectValue(e).status === 409);
      await db.captureCardAlias.update({ where: { id: alias.id }, data: { verifiedAt: new Date() } });
      await db.captureAutomation.update({ where: { id: policy.id }, data: { policyAcceptedAt: new Date('2026-10-25T00:00:00Z') } });
      await assert.rejects(apply(refund), e => objectValue(e).status === 409);
      await db.captureAutomation.update({ where: { id: policy.id }, data: { policyAcceptedAt: new Date('2026-10-01T00:00:00Z') } });
      await db.dailyExpense.update({ where: { id: present(present(saleRow).expenseId) }, data: { amount: '99' } });
      assert.equal((await detail(refund)).candidates.length, 0);
      await assert.rejects(apply(refund, { id: 'forged', updatedAt: new Date() }), e => objectValue(e).status === 409);
    });
    await t.test('un aviso antiguo se reanaliza expresamente sin reescribir evento ni aplicar el reembolso', async () => {
      const input = notice('HISTORICO FICTICIO'); await sale('HISTORICO FICTICIO');
      const original = sparseCalculations(load('src/lib/captureParsers.ts'));
      const legacy = sourceLoader({ '@/lib/captureParsers': { ...original, interpretCapture: () => ({ reason: 'UNKNOWN_FORMAT', proposal: {} }) } })('src/lib/captureProcessing.ts');
      const saved = await db.captureEvent.create({ data: { ...input, userId: present(user).id, deviceId: device.id, requestHash: protocol.captureHash(JSON.stringify(input)) } });
      const old = await db.$transaction(tx => legacy.processCaptureEvent(tx, saved));
      const before = await db.captureEvent.findUnique({ where: { id: saved.id } });
      const reanalyzed = await processing.resolveCaptureMovement(db, present(user).id, { id: old.id, action: 'reinterpret' });
      assert.equal(present(reanalyzed).reason, 'REFUND_REVIEW'); assert.equal(array(present(present(reanalyzed).analysisHistory)).length, 1);
      assert.deepEqual(await db.captureEvent.findUnique({ where: { id: saved.id } }), before);
      assert.equal(await db.expenseRefund.count({ where: { movementId: old.id } }), 0);
      await apply(reanalyzed);
    });
    await t.test('cancelación Banamex usa alias propio y regla MXN; una colisión de tres cifras requiere revisión', async () => {
      const bank = await db.card.create({ data: { userId: present(user).id, name: 'JOY ficticia', usualCutDay: 25, usualDueDay: 15 } });
      await db.captureCardAlias.create({ data: { userId: present(user).id, cardId: bank.id, sourcePackage: 'com.citibanamex.banamexmobile', kind: 'DIGITAL', value: '0123', verifiedAt: new Date() } });
      await db.captureAutomation.create({ data: { userId: present(user).id, cardId: bank.id, parserKey: 'wallet.banamex-purchase.es.v1', mode: 'AUTOMATIC', datePolicy: 'NOTIFICATION_POSTED_AT' } });
      const original = await send({ ...event({ 'android.title': 'COMERCIO FICTICIO BANAMEX', 'android.text': 'MXN123.45 con Joy Banamex ••0123' }, '2026-10-24T17:00:00Z'), sourcePackage: 'com.google.android.apps.walletnfcrel' });
      assert.equal(present(original).status, 'REGISTERED');
      await db.captureBankFallback.create({ data: { userId: present(user).id, cardId: bank.id, bankSourcePackage: 'com.citibanamex.banamexmobile', mode: 'AUTOMATIC', currency: 'MXN',
        bankDatePolicy: 'BANK_OPERATION', purchasesOnly: true, waitMinutes: 15, acceptedAt: new Date('2026-10-01T00:00:00Z'), evidenceMovementId: present(original).id } });
      const fixture = jsonFixture0;
      const input = { ...event(Object.fromEntries(Object.entries(fixture.event.fields).map(([k, v]) => [k, v.replaceAll('COMERCIO FICTICIO', 'COMERCIO FICTICIO BANAMEX')]))), sourcePackage: fixture.event.sourcePackage };
      const refund = await send(input);
      assert.equal(present(refund).cardId, bank.id); assert.equal(objectValue(present(present(refund).proposal)).currency, 'MXN');
      assert.equal((await detail(refund)).candidates.length, 1); await apply(refund);
      assert.equal(String(present((await expense(original))).amount), '0');
      await db.captureCardAlias.create({ data: { userId: present(user).id, cardId: card.id, sourcePackage: 'com.citibanamex.banamexmobile', kind: 'DIGITAL', value: '1123', verifiedAt: new Date() } });
      const ambiguous = await send({ ...input, eventId: randomUUID() });
      assert.equal(present(ambiguous).reason, 'AMBIGUOUS_CARD'); assert.equal(present(ambiguous).cardId, null);
      await assert.rejects(apply(ambiguous), e => objectValue(e).status === 409);
    });
    await t.test('eliminar un gasto reembolsado conserva evidencia y no permite deshacer recreándolo', async () => {
      const saleRow = await sale('BORRADO FICTICIO'), refund = await send(notice('BORRADO FICTICIO'));
      await apply(refund);
      assert.equal((await expenseRoute.DELETE(request(undefined, 'owner', 'DELETE', `id=${present(saleRow).expenseId}`))).status, 200);
      const ledger = await db.expenseRefund.findUnique({ where: { movementId: present(refund).id } });
      assert.equal(present(ledger).expenseId, null); assert.equal(present(ledger).originalExpenseId, present(saleRow).expenseId); assert.ok(present(ledger).expenseSnapshot);
      await assert.rejects(processing.resolveCaptureMovement(db, present(user).id, { id: present(refund).id, action: 'reverseRefund' }), e => objectValue(e).status === 409);
      assert.equal(await db.dailyExpense.count({ where: { id: present(present(saleRow).expenseId) } }), 0);
    });
  } finally {
    await db.user.deleteMany({ where: { id: { in: users.map(row => row.id) } } });
    await db.$disconnect();
  }
});
