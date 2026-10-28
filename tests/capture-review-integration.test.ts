import { dateValue,numberValue,plain,present,sparseCalculations,stringValue } from './helpers/financial-fixtures';

import { array,record as objectValue } from './helpers/dynamic-values';

import { captureProposal } from '../src/lib/captureJson';
import { routeHandlers,integrationLoader as sourceLoader,withFixtureDb } from './helpers/integration-fixtures';

import { faultingTransactions } from './helpers/financial-persistence';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { test } from 'node:test';

const connectionString = process.env.AFP_TEST_DATABASE_URL;

test('Fase 5 PostgreSQL: revisión, fuentes y cotejo manual sin alterar decisiones personales', { skip: !connectionString }, async t => {
  const url = new URL(present(connectionString));
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && /^\/afp_test\w*$/.test(url.pathname) && !url.search);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const user = await db.user.create({ data: { email: `${randomUUID()}@example.test` } });
  const other = await db.user.create({ data: { email: `${randomUUID()}@example.test` } });
  const load = sourceLoader({ '@/lib/prisma': { prisma: db },
    'next/server': { NextResponse: { json: (body: unknown, opts = {}) => ({ body: plain(body), status: opts.status || 200, headers: new Headers(opts.headers) }) } },
    '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async token => ({ data: { user: token === 'a' ? user : token === 'b' ? other : null } }) } }) },
  });
  const processing = load('src/lib/captureProcessing.ts'), reconciliation = load('src/lib/captureReconciliation.ts');
  const configuration = load('src/lib/captureConfiguration.ts'), service = load('src/lib/captureService.ts');
  const protocol = sparseCalculations(load('src/lib/captureProtocol.ts'));
  const card = await db.card.create({ data: { userId: user.id, name: 'Tarjeta ficticia', usualCutDay: 25, usualDueDay: 15 } });
  const category = await db.category.create({ data: { userId: user.id, name: 'Categoría ficticia' } });
  const foreign = await db.card.create({ data: { userId: other.id, name: 'Ajena', usualCutDay: 25, usualDueDay: 15 } });
  const secret = randomBytes(32).toString('base64url');
  const device = await db.captureDevice.create({ data: { userId: user.id, name: 'Teléfono ficticio', secretHash: protocol.captureHash(secret), approvedAt: new Date() } });
  const credential = { id: device.id, secretHash: protocol.captureHash(secret) };
  const period = { cardId: card.id, startDate: '2026-10-01', endDate: '2026-10-25' };
  const correction = { cardId: card.id, merchant: 'Compra corregida', amount: '250.50', date: '2026-10-21', categoryId: category.id, currency: 'MXN' };
  const movement = (data?: Partial<import('@prisma/client').Prisma.CaptureMovementUncheckedCreateInput>) => db.captureMovement.create({ data: { userId: user.id, reason: 'UNKNOWN_FORMAT', proposal: { original: 'Aviso ficticio incompleto' }, ...data } });
  const request = (body: unknown, query = '', token = 'a', method = 'PATCH') => new Request(`http://localhost/api/test?${query}`, { method, headers: { authorization: token ? `Bearer ${token}` : '', 'Content-Type': 'application/json' }, ...(method === 'GET' ? {} : { body: JSON.stringify(body) }) });
  const reconcile = (input: Record<string, unknown>) => reconciliation.reconcileCaptureStatement(db, user.id, { ...period, ...input });
  let first: import('@prisma/client').CaptureMovement, expense: import('@prisma/client').DailyExpense | null;
  try {
    await t.test('rutas exigen Bearer antes del cuerpo y no aceptan la credencial Capture', async () => {
      for (const route of ['reconciliation', 'movements', 'configuration'] as const) for (const method of ['GET', 'PATCH'] as const) for (const authorization of ['', 'Bearer expired', `Capture ${device.id}.${secret}`] as const) {
        const result = await present(routeHandlers(load(`src/app/api/captures/${route}/route`))[method])({ headers: new Headers({ authorization }), get body() { throw new Error('No leer'); } });
        assert.equal(result.status, 401); assert.equal(present(result.headers).get('cache-control'), 'private, no-store');
      }
    });
    await t.test('corrige aviso desconocido, conserva propuesta original y valida calendario/propietario', async () => {
      first = await movement();
      for (const invalid of [{ ...correction, date: '2026-02-30' }, { ...correction, amount: '-1' }, { ...correction, amount: '1.001' }, { ...correction, currency: 'USD' }] as const) {
        await assert.rejects(processing.resolveCaptureMovement(db, user.id, { id: first.id, action: 'correct', correction: invalid, expectedCorrection: 'null' }), e => objectValue(e).status === 400);
      }
      await assert.rejects(processing.resolveCaptureMovement(db, user.id, { id: first.id, action: 'correct', correction: { ...correction, cardId: foreign.id }, expectedCorrection: 'null' }), e => objectValue(e).status === 404);
      const fixed = await processing.resolveCaptureMovement(db, user.id, { id: first.id, action: 'correct', correction, expectedCorrection: 'null' });
      assert.deepEqual(present(fixed).proposal, first.proposal); assert.deepEqual(present(fixed).correction, correction);
      await assert.rejects(processing.resolveCaptureMovement(db, user.id, { id: first.id, action: 'correct', correction, expectedCorrection: 'null' }), e => objectValue(e).status === 409);
      // PostgreSQL JSONB orders keys independently of the validation schema.
      // A second edit uses the exact snapshot returned to the browser.
      const repeated = await processing.resolveCaptureMovement(db, user.id, { id: first.id, action: 'correct', correction, expectedCorrection: JSON.stringify(present(fixed).correction) });
      assert.deepEqual(present(repeated).correction, present(fixed).correction);
    });
    await t.test('registro explícito concurrente crea un gasto pendiente y no habilita formatos sintéticos', async () => {
      const rows = await Promise.all(Array.from({ length: 5 }, () => processing.resolveCaptureMovement(db, user.id, { id: first.id, action: 'register' })));
      assert.equal(new Set(rows.map(row => present(row).expenseId)).size, 1);
      expense = await db.dailyExpense.findUnique({ where: { id: present(present(rows[0]).expenseId) } });
      assert.equal(present(expense).reconciliationStatus, 'PENDING'); assert.equal(present(expense).reconciledAt, null); assert.equal(present(expense).categoryId, category.id);
      await assert.rejects(configuration.configureCapture(db, user.id, { action: 'automation', cardId: card.id, parserKey: 'bbva.purchase.es.v1', mode: 'AUTOMATIC' }), e => objectValue(e).status === 409);
    });
    await t.test('dos cargos iguales mantienen multiplicidad mediante otra compra explícita', async () => {
      const second = await movement();
      await processing.resolveCaptureMovement(db, user.id, { id: second.id, action: 'correct', correction, expectedCorrection: 'null' });
      const candidate = await processing.resolveCaptureMovement(db, user.id, { id: second.id, action: 'register' });
      assert.equal(present(candidate).reason, 'POSSIBLE_DUPLICATE'); assert.equal(present(candidate).expenseId, null);
      await processing.resolveCaptureMovement(db, user.id, { id: second.id, action: 'distinct' });
      assert.equal(await db.dailyExpense.count({ where: { userId: user.id, amount: '250.50' } }), 2);
    });
    await t.test('vincular evidencia conserva notas, categoría y aportación del registro', async () => {
      await db.dailyExpense.update({ where: { id: present(expense).id }, data: { notes: 'Nota personal', cashContributionAmount: '50.50' } });
      const before = await db.dailyExpense.findUnique({ where: { id: present(expense).id } });
      const row = await movement({ proposal: correction });
      await processing.resolveCaptureMovement(db, user.id, { id: row.id, action: 'link', expenseId: present(expense).id });
      assert.deepEqual(await db.dailyExpense.findUnique({ where: { id: present(expense).id } }), before);
      await assert.rejects(processing.resolveCaptureMovement(db, other.id, { id: row.id, action: 'link', expenseId: present(expense).id }), e => objectValue(e).status === 404);
    });
    await t.test('cotejo individual conserva cargos completos y no confirma otro cargo igual', async () => {
      const data = await reconciliation.captureStatement(db, user.id, period);
      assert.equal(data.total, '501.00'); assert.equal(data.confirmed, '0.00');
      const row = data.records.find(row => row.id === present(expense).id);
      await reconcile({ action: 'confirm', type: present(row).type, recordId: present(row).id, fingerprint: present(row).fingerprint });
      const after = await reconciliation.captureStatement(db, user.id, period);
      assert.equal(after.confirmed, '250.50'); assert.equal(after.records.filter(row => row.matched).length, 1);
      const saved = await db.dailyExpense.findUnique({ where: { id: present(expense).id } });
      assert.equal(present(saved).notes, 'Nota personal'); assert.equal(present(saved).cashContributionAmount.toFixed(2), '50.50'); assert.equal(present(saved).reconciliationStatus, 'CONFIRMED');
    });
    await t.test('bandeja deriva Conciliado y separa los cuatro estados, con paginación propia', async () => {
      const route = load('src/app/api/captures/movements/route.ts');
      const result = await route.GET(request(null, 'status=RECONCILED', 'a', 'GET'));
      assert.ok(array(result.body.movements).length >= 2); assert.ok(array(result.body.movements).every(row => objectValue(row).inboxState === 'RECONCILED'));
      const foreignResult = await route.GET(request(null, `id=${first.id}`, 'b', 'GET')); assert.equal(foreignResult.status, 404);
      assert.equal((await route.GET(request(null, 'id=wrong', 'a', 'GET'))).status, 400);
      assert.equal((await route.GET(request(null, `cursor=${first.id}`, 'b', 'GET'))).status, 404);
    });
    await t.test('total cero y notas se guardan; un borrador desactualizado no sobrescribe otro', async () => {
      const data = await reconciliation.captureStatement(db, user.id, period);
      await reconcile({ action: 'save', chargesTotal: '0', notes: 'Sin cargo en este estado; investigar fecha.', expectedUpdatedAt: present(data.statement).updatedAt.toISOString() });
      const after = await reconciliation.captureStatement(db, user.id, period);
      assert.equal(after.difference, '-501.00'); assert.equal(after.records.length, 2);
      await assert.rejects(reconcile({ action: 'save', chargesTotal: '1', notes: 'Anterior', expectedUpdatedAt: present(data.statement).updatedAt.toISOString() }), e => objectValue(e).status === 409);
      assert.equal(await db.dailyExpense.count({ where: { userId: user.id } }), 2);
    });
    await t.test('edición personal conserva cotejo; cambio financiero lo retira y exige cotejar de nuevo', async () => {
      const api = load('src/app/api/expenses/route.ts');
      const before = await reconciliation.captureStatement(db, user.id, period);
      const row = before.records.find(row => row.id === present(expense).id);
      const body = { id: present(expense).id, date: '2026-10-21', amount: '250.50', concept: 'Nombre personal', paymentMethod: 'CARD', cardId: card.id, categoryId: category.id, notes: 'Nota editada' };
      assert.equal((await api.PATCH(request(body))).status, 200);
      assert.ok(present((await db.dailyExpense.findUnique({ where: { id: present(expense).id } }))).reconciledAt);
      assert.equal((await api.PATCH(request({ ...body, amount: '251.50' }))).status, 200);
      const after = await db.dailyExpense.findUnique({ where: { id: present(expense).id } });
      assert.equal(present(after).reconciledAt, null); assert.equal(present(after).reconciliationStatus, 'PENDING'); assert.equal(present(after).cashContributionAmount.toFixed(2), '50.50');
      await assert.rejects(reconcile({ action: 'confirm', type: 'EXPENSE', recordId: present(expense).id, fingerprint: present(row).fingerprint }), e => objectValue(e).status === 409);
      assert.equal(present((await reconciliation.captureStatement(db, user.id, period)).records.find(row => row.id === present(expense).id)).changed, true);
    });
    await t.test('faltante reintentado concurrentemente conserva recibo incluso tras eliminar el gasto', async () => {
      const operationId = randomUUID(), data = { action: 'missing', expense: { ...correction, amount: '99.99' }, operationId, confirmDistinct: true };
      const results = await Promise.all(Array.from({ length: 5 }, () => reconcile(data)));
      assert.equal(new Set(results.map(row => objectValue(row).expenseId)).size, 1);
      const id = stringValue(objectValue(present(results[0])).expenseId);
      assert.equal(present((await db.dailyExpense.findUnique({ where: { id } }))).reconciliationStatus, 'PENDING');
      await assert.rejects(reconcile({ ...data, expense: { ...data.expense, amount: '100.00' } }), e => objectValue(e).status === 409);
      await db.dailyExpense.delete({ where: { id } });
      assert.equal(objectValue((await reconcile(data))).expenseId, id); assert.equal(await db.dailyExpense.count({ where: { id } }), 0);
    });
    await t.test('guardar notas tras cotejar cargos usa versión de metadatos y no borra cambios de otra pantalla', async () => {
      const before = await reconciliation.captureStatement(db, user.id, period);
      const metadata = JSON.stringify([String(present(before.statement).chargesTotal), present(before.statement).notes]);
      const row = before.records[0];
      await reconcile({ action: 'confirm', recordId: present(row).id, type: present(row).type, fingerprint: present(row).fingerprint });
      const saved = await reconcile({ action: 'save', expectedUpdatedAt: present(before.statement).updatedAt.toISOString(), expectedMetadata: metadata, notes: 'Notas conservadas después de cotejar', chargesTotal: '501.00' });
      assert.equal(objectValue(saved).notes, 'Notas conservadas después de cotejar');
      await assert.rejects(reconcile({ action: 'save', expectedUpdatedAt: dateValue(objectValue(saved).updatedAt).toISOString(), expectedMetadata: metadata, notes: 'Borrador anterior', chargesTotal: '0' }), e => objectValue(e).status === 409);
    });
    await t.test('faltantes exigen confirmar multiplicidad y tarjeta/período propios', async () => {
      for (const changes of [{ confirmDistinct: false }, { expense: { ...correction, cardId: foreign.id } }, { expense: { ...correction, date: '2026-09-30' } }] as const) {
        await assert.rejects(reconcile({ action: 'missing', expense: correction, operationId: randomUUID(), confirmDistinct: true, ...changes }), e => [400, 409].includes(numberValue(objectValue(e).status)));
      }
      await assert.rejects(reconciliation.captureStatement(db, other.id, period), e => objectValue(e).status === 404);
      await assert.rejects(reconciliation.captureStatement(db, user.id, { ...period, endDate: '2026-12-31' }), e => objectValue(e).status === 400);
    });
    await t.test('fallo al guardar el cotejo revierte también el alta faltante', async () => {
      const before = await db.dailyExpense.count({ where: { userId: user.id } });
      const failing = faultingTransactions(db, { before(model, method) { if (model === 'captureStatement' && method === 'update') throw new Error('rollback real'); } });
      await assert.rejects(withFixtureDb(reconciliation.reconcileCaptureStatement, failing, user.id, { ...period, action: 'missing', expense: correction, operationId: randomUUID(), confirmDistinct: true }), /rollback real/);
      assert.equal(await db.dailyExpense.count({ where: { userId: user.id } }), before);
    });
    await t.test('MSI suma la cuota del ciclo y conserva la propuesta al convertir', async () => {
      const row = await movement({ proposal: { ...correction, amount: '1200.00' }, correction: { ...correction, amount: '1200.00' } });
      await processing.resolveCaptureMovement(db, user.id, { id: row.id, action: 'register' });
      const converted = await processing.resolveCaptureMovement(db, user.id, { id: row.id, action: 'convertToInstallments', months: 12 });
      const data = await reconciliation.captureStatement(db, user.id, period);
      const quota = data.records.find(record => record.id === present(converted).installmentPurchaseId);
      assert.equal(present(quota).chargeAmount, '100'); assert.equal(present(quota).type, 'INSTALLMENT');
      await reconcile({ action: 'confirm', recordId: present(quota).id, type: present(quota).type, fingerprint: present(quota).fingerprint });
      assert.ok(present((await db.installmentPurchase.findUnique({ where: { id: present(quota).id } }))).reconciledAt);
      await reconcile({ action: 'unconfirm', recordId: present(quota).id, type: present(quota).type, fingerprint: present(quota).fingerprint });
      assert.equal(present((await db.installmentPurchase.findUnique({ where: { id: present(quota).id } }))).reconciliationStatus, 'PENDING');
    });
    await t.test('alias y reglas se administran con propietarios y sin activar automatización', async () => {
      const alias = await configuration.configureCapture(db, user.id, { action: 'alias', cardId: card.id, sourcePackage: 'com.bancomer.mbanking', kind: 'DIGITAL', value: '0001', verified: true, evidence: 'Ejemplo ficticio comprobado' });
      assert.equal(objectValue(alias).value, '0001');
      await assert.rejects(configuration.configureCapture(db, other.id, { action: 'deleteAlias', id: objectValue(alias).id }), e => objectValue(e).status === 404);
      await configuration.configureCapture(db, user.id, { action: 'deleteAlias', id: objectValue(alias).id });
      const rule = await configuration.configureCapture(db, user.id, { action: 'rule', cardId: card.id, merchant: 'COMERCIO', categoryId: category.id });
      await configuration.configureCapture(db, user.id, { action: 'deleteRule', id: objectValue(rule).id });
      assert.equal(await db.captureAutomation.count({ where: { userId: user.id, mode: 'AUTOMATIC' } }), 0);
    });
    await t.test('evidencia de una MSI manual exige vincular o distinguir sin duplicar ni cambiar notas/persona', async () => {
      const purchase = await db.installmentPurchase.create({ data: { userId: user.id, cardId: card.id, categoryId: category.id, purchaseDate: new Date('2026-10-21T12:00:00Z'), concept: 'MSI manual personal', totalAmount: '1700', months: 10, notes: 'Conservar esta nota' } });
      const row = await movement({ proposal: { ...correction, amount: '1700.00' }, correction: { ...correction, amount: '1700.00' } });
      const detected = await processing.resolveCaptureMovement(db, user.id, { id: row.id, action: 'register' });
      assert.equal(present(detected).reason, 'POSSIBLE_DUPLICATE'); assert.equal(present(detected).expenseId, null);
      assert.ok((await processing.captureCandidates(db, user.id, captureProposal(row.correction))).some(item => item.type === 'INSTALLMENT' && item.id === purchase.id));
      await assert.rejects(processing.resolveCaptureMovement(db, other.id, { id: row.id, action: 'linkInstallment', installmentPurchaseId: purchase.id }), e => objectValue(e).status === 404);
      const linked = await processing.resolveCaptureMovement(db, user.id, { id: row.id, action: 'linkInstallment', installmentPurchaseId: purchase.id });
      assert.equal(present(linked).installmentPurchaseId, purchase.id);
      assert.deepEqual(await db.installmentPurchase.findUnique({ where: { id: purchase.id } }), purchase);
      assert.equal(await db.dailyExpense.count({ where: { userId: user.id, amount: '1700' } }), 0);
    });
    await t.test('convertir un cargo ya cotejado exige cotejar la cuota nueva sin heredar su confirmación', async () => {
      const row = await movement({ proposal: { ...correction, amount: '2400.00' }, correction: { ...correction, amount: '2400.00' } });
      const registered = await processing.resolveCaptureMovement(db, user.id, { id: row.id, action: 'register' });
      const data = await reconciliation.captureStatement(db, user.id, period);
      const record = data.records.find(item => item.id === present(registered).expenseId);
      await reconcile({ action: 'confirm', recordId: present(record).id, type: present(record).type, fingerprint: present(record).fingerprint });
      const converted = await processing.resolveCaptureMovement(db, user.id, { id: row.id, action: 'convertToInstallments', months: 12 });
      const purchase = await db.installmentPurchase.findUnique({ where: { id: present(present(converted).installmentPurchaseId) } });
      assert.equal(present(purchase).reconciledAt, null); assert.equal(present(purchase).reconciliationStatus, 'PENDING');
    });
    await t.test('pausa por fuente exige propietario; configuración limita paquetes y no cambia selección local', async () => {
      await assert.rejects(service.changeCaptureDevice(db, other.id, { deviceId: device.id, action: 'source', sourcePackage: 'com.bancomer.mbanking', paused: true }), e => objectValue(e).status === 404);
      await service.changeCaptureDevice(db, user.id, { deviceId: device.id, action: 'source', sourcePackage: 'com.bancomer.mbanking', paused: true });
      const status = await service.getCaptureDevice(db, credential);
      assert.deepEqual(status.configuration.pausedPackages, ['com.bancomer.mbanking']); assert.deepEqual(Array.from(status.configuration.allowedPackages), Array.from(protocol.capturePackages));
      await assert.rejects(service.changeCaptureDevice(db, user.id, { deviceId: device.id, action: 'source', sourcePackage: 'unknown', paused: true }), e => objectValue(e).status === 400);
    });
    await t.test('reporte nativo guarda datos acotados, nunca secretos; usuario web no suplanta el reporte', async () => {
      const route = load('src/app/api/captures/device/route.ts');
      const input = { action: 'report', version: 1, active: true, listenerConnected: true, notificationAccess: true, batteryExempt: false, deliveryPaused: false, selectedPackages: ['com.bancomer.mbanking'], pausedPackages: ['com.bancomer.mbanking'] };
      const nativeRequest = (body: unknown) => new Request('http://localhost/api/captures/device', { method: 'POST', headers: { authorization: `Capture ${device.id}.${secret}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      assert.equal((await route.POST(nativeRequest(input))).status, 200);
      assert.equal((await route.POST(nativeRequest({ ...input, secret }))).status, 400);
      assert.equal((await route.POST(request(input))).status, 401);
      const found = await db.captureDevice.findUnique({ where: { id: device.id }, select: protocol.deviceSelect });
      assert.ok(present(found).reportedAt); assert.equal(objectValue(present(present(found).reportedState)).batteryExempt, false); assert.ok(!JSON.stringify(found).includes(secret));
    });
  } finally { await db.user.deleteMany({ where: { id: { in: [user.id, other.id] } } }); await db.$disconnect(); }
});
