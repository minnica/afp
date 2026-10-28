import { record as objectValue } from './helpers/dynamic-values';
import { present,sparseCalculations,stringValue } from './helpers/financial-fixtures';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { integrationLoader as sourceLoader } from './helpers/integration-fixtures';
const connectionString = process.env.AFP_TEST_DATABASE_URL;

test('Fase 6 PostgreSQL: seguimiento del piloto sin atribuir cobertura ni crear gastos al observar', { skip: !connectionString }, async t => {
  const url = new URL(present(connectionString));
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && /^\/afp_test\w*$/.test(url.pathname) && !url.search);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const user = await db.user.create({ data: { email: `${randomUUID()}@example.test` } });
  const other = await db.user.create({ data: { email: `${randomUUID()}@example.test` } });
  const load = sourceLoader();
  const { captureStatement, reconcileCaptureStatement } = load('src/lib/captureReconciliation.ts');
  const { configureCapture } = load('src/lib/captureConfiguration.ts');
  const { receiveCaptureEvent } = load('src/lib/captureService.ts');
  const { validateCaptureEvent, captureHash } = sparseCalculations(load('src/lib/captureProtocol.ts'));
  const card = await db.card.create({ data: { userId: user.id, name: 'BBVA ficticia', usualCutDay: 25, usualDueDay: 15 } });
  const category = await db.category.create({ data: { userId: user.id, name: 'Ficticia' } });
  const device = await db.captureDevice.create({ data: { userId: user.id, name: 'Ficticio', approvedAt: new Date(), secretHash: captureHash(randomBytes(32).toString('base64url')) } });
  const credential = { id: device.id, secretHash: device.secretHash };
  const period = { cardId: card.id, startDate: '2026-10-01', endDate: '2026-10-25' };
  const expense = () => db.dailyExpense.create({ data: { userId: user.id, cardId: card.id, categoryId: category.id, paymentMethod: 'CARD', date: new Date('2026-10-21T12:00:00Z'), amount: '100.00', concept: 'Compra igual ficticia' } });
  const movement = (data: Partial<import('@prisma/client').Prisma.CaptureMovementUncheckedCreateInput>) => db.captureMovement.create({ data: { userId: user.id, cardId: card.id, operationDate: new Date('2026-10-21T12:00:00Z'), reason: 'OBSERVATION', status: 'OBSERVED', proposal: {}, ...data } });
  const event = (movementId: string | null, receivedAt = '2026-10-21T20:00:00Z', sourcePackage = 'com.bancomer.mbanking') => db.captureEvent.create({ data: {
    deviceId: device.id, userId: user.id, eventId: randomUUID(), contractVersion: 1 as const, notificationKeyHash: 'c'.repeat(64), requestHash: randomUUID(),
    postedAt: new Date(receivedAt), receivedAt: new Date(receivedAt), sourcePackage, fields: { 'android.text': 'Texto ficticio privado' }, movementId,
  } });
  const read = () => captureStatement(db, user.id, period);
  let first: import('@prisma/client').DailyExpense, second: import('@prisma/client').DailyExpense, linked: import('@prisma/client').CaptureMovement;
  try {
    await t.test('cargos iguales conservan dos identidades y evidencias bancarias/Wallet cuentan un cargo', async () => {
      first = await expense(); second = await expense();
      linked = await movement({ status: 'LINKED', reason: 'USER_LINKED', expenseId: first.id, originalExpenseId: first.id });
      await event(linked.id); await event(linked.id, undefined, 'com.google.android.apps.walletnfcrel');
      const before = await db.dailyExpense.findMany({ where: { userId: user.id }, orderBy: { id: 'asc' } });
      const data = await read();
      assert.equal(data.pilot.records, 2); assert.equal(data.pilot.recordsWithEvidence, 1); assert.equal(data.pilot.recordsWithoutEvidence, 1);
      assert.equal(data.pilot.linkedEvents, 2); assert.equal(data.pilot.additionalEvidence, 1);
      assert.deepEqual(await db.dailyExpense.findMany({ where: { userId: user.id }, orderBy: { id: 'asc' } }), before);
      assert.ok(!JSON.stringify(data.pilot).includes('Texto ficticio privado'));
    });
    await t.test('solo el cotejo explícito confirma un cargo sin aviso; no declara un aviso perdido', async () => {
      const row = (await read()).records.find(row => row.id === second.id);
      await reconcileCaptureStatement(db, user.id, { ...period, action: 'confirm', type: present(row).type, recordId: present(row).id, fingerprint: present(row).fingerprint });
      const { pilot } = await read();
      assert.equal(pilot.confirmedWithoutEvidence, 1); assert.equal(pilot.confirmedRecords, 1);
      assert.equal(objectValue(pilot).lostEvents, undefined); assert.equal(objectValue(pilot).duplicateExpenses, undefined); assert.equal(objectValue(pilot).coverage, undefined);
    });
    await t.test('revisiones, correcciones y coincidencias son magnitudes distintas', async () => {
      const corrected = await movement({ reason: 'POSSIBLE_DUPLICATE', proposal: { amount: '99.00', merchant: 'Original' }, correction: { amount: '100.00', merchant: 'Original' } });
      await event(corrected.id);
      const completed = await movement({ proposal: { amount: '100.00', merchant: 'COMERCIO' }, correction: { amount: '100', merchant: 'comércio', categoryId: category.id } });
      await event(completed.id);
      const { pilot } = await read();
      assert.equal(pilot.pendingMovements, 2); assert.equal(pilot.unresolvedCoincidences, 1); assert.equal(pilot.correctedProposals, 1);
    });
    await t.test('avisos sin tarjeta de fuentes compartidas se separan y delimitan por recepción local', async () => {
      await configureCapture(db, user.id, { action: 'alias', cardId: card.id, sourcePackage: 'com.bancomer.mbanking', kind: 'PHYSICAL', value: '0123', verified: true, evidence: 'Ficticia' });
      for (const date of ['2026-10-01T05:59:59.999Z', '2026-10-01T06:00:00Z', '2026-10-26T05:59:59.999Z', '2026-10-26T06:00:00Z'] as const) {
        const row = await movement({ cardId: null, operationDate: null }); await event(row.id, date);
      }
      const unknown = await movement({ cardId: null, operationDate: null }); await event(unknown.id, undefined, 'com.nu.production');
      await event(null);
      const undated = await movement({ operationDate: null }); await event(undated.id);
      const { pilot } = await read();
      assert.equal(pilot.unassignedSourceEvents, 3); assert.equal(pilot.undatedCardMovements, 1);
      assert.equal(pilot.records, 2); assert.equal(pilot.recordsWithEvidence, 1);
      await assert.rejects(captureStatement(db, other.id, period), error => objectValue(error).status === 404);
    });
    await t.test('período histórico respeta el horario de verano de México', async () => {
      const historical = { ...period, startDate: '2021-07-01', endDate: '2021-07-01' };
      for (const date of ['2021-07-01T04:59:59Z', '2021-07-01T05:00:00Z', '2021-07-02T04:59:59.999Z', '2021-07-02T05:00:00Z'] as const) {
        const row = await movement({ cardId: null, operationDate: null }); await event(row.id, date);
      }
      assert.equal((await captureStatement(db, user.id, historical)).pilot.unassignedSourceEvents, 2);
    });
    await t.test('avisos de débito quedan por revisar: reintentos y activación forzada no crean una compra de crédito', async () => {
      const config = await load('src/lib/captureConfiguration.ts').captureConfiguration(db, user.id);
      assert.ok(!config.parsers.some(parser => parser.key === 'bbva.account-charge.es.v1'));
      await assert.rejects(configureCapture(db, user.id, { action: 'automation', cardId: card.id, parserKey: 'bbva.account-charge.es.v1', mode: 'AUTOMATIC' }), error => objectValue(error).status === 409);
      // Incluso una fila administrativa alterada no vuelve completo un aviso.
      await db.captureAutomation.create({ data: { userId: user.id, cardId: card.id, parserKey: 'bbva.account-charge.es.v1', mode: 'AUTOMATIC' } });
      const input = validateCaptureEvent({ contractVersion: 1 as const, eventId: randomUUID(), sourcePackage: 'com.bancomer.mbanking', notificationKeyHash: 'd'.repeat(64),
        postedAt: '2026-10-21T20:00:00Z', receivedAt: '2026-10-21T20:00:01Z', fields: { 'android.text': 'Tienes un cargo a tu cuenta *0123 de $123.45. Resto ficticio.' } });
      const before = await db.dailyExpense.count({ where: { userId: user.id } });
      const responses = await Promise.all(Array.from({ length: 5 }, () => receiveCaptureEvent(db, credential, input)));
      for (const response of responses) assert.deepEqual(response, responses[0]);
      assert.equal(await db.captureEvent.count({ where: { deviceId: device.id, eventId: input.eventId } }), 1);
      const stored = await db.captureEvent.findUnique({ where: { deviceId_eventId: { deviceId: device.id, eventId: input.eventId } }, include: { movement: true } });
      assert.equal(present(present(stored).movement).status, 'REVIEW'); assert.equal(present(present(stored).movement).reason, 'ACCOUNT_DEBIT_REVIEW'); assert.equal(present(present(stored).movement).resolvedAt, null);
      assert.equal(await db.dailyExpense.count({ where: { userId: user.id } }), before);
      assert.equal((await read()).pilot.automaticFormats.length, 0);
    });
    await t.test('faltantes y gastos eliminados conservan evidencia sin inflar compras presentes', async () => {
      const data = { ...period, action: 'missing', operationId: randomUUID(), confirmDistinct: true, expense: { cardId: card.id, categoryId: category.id, date: '2026-10-21', amount: '50.00', merchant: 'Faltante ficticio', currency: 'MXN' } };
      const result = await reconcileCaptureStatement(db, user.id, data);
      assert.equal((await read()).pilot.missingRecordsAdded, 1);
      await db.dailyExpense.delete({ where: { id: stringValue(objectValue(result).expenseId) } });
      await db.dailyExpense.delete({ where: { id: first.id } });
      const { pilot } = await read();
      assert.equal(pilot.missingRecordsAdded, 0); assert.equal(pilot.deletedExpenseLinks, 1); assert.equal(pilot.recordsWithEvidence, 0);
      assert.equal(objectValue((await reconcileCaptureStatement(db, user.id, data))).expenseId, objectValue(result).expenseId);
    });
  } finally { await db.user.deleteMany({ where: { id: { in: [user.id, other.id] } } }); await db.$disconnect(); }
});
