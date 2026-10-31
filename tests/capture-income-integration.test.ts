import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { integrationLoader, transactionFixture, withFixtureDb } from './helpers/integration-fixtures';
import { record } from './helpers/dynamic-values';
import { present, plain } from './helpers/financial-fixtures';
const connectionString = process.env.AFP_TEST_DATABASE_URL;
test('ingresos BBVA: nómina estimada inmediata, confirmación, duplicidad, aislamiento y rollback', { skip: !connectionString }, async t => {
 const url = new URL(present(connectionString)); assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && /^\/afp_test\w*$/.test(url.pathname) && !url.search);
 const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
 const user = await db.user.create({ data: { email: `income-${randomUUID()}@example.test` } });
 const other = await db.user.create({ data: { email: `income-other-${randomUUID()}@example.test` } });
 const load = integrationLoader({ '@/lib/prisma': { prisma: db }, '@/lib/calendar/schedule': { scheduleCalendarSync() {} }, 'next/server': { NextResponse: { json: (body: unknown, options = {}) => ({ body: plain(body), status: options.status || 200 }) } }, '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async token => ({ data: { user: token === 'owner' ? user : token === 'other' ? other : null } }) } }) } });
 const service = load('src/lib/captureService.ts'), processing = load('src/lib/captureProcessing.ts'), config = load('src/lib/captureConfiguration.ts');
 const money = load('src/lib/money/service.ts'), sources = load('src/lib/money/sources.ts');
 const account = await db.moneyAccount.create({ data: { userId: user.id, name: 'Cuenta QA', kind: 'BANK', openingBalance: 100, asOf: new Date('2026-10-01'), baseline: {} } });
 const type = await db.incomeType.create({ data: { userId: user.id, name: 'Nómina QA' } });
 const device = await db.captureDevice.create({ data: { userId: user.id, name: 'Ficticio', approvedAt: new Date(), secretHash: randomUUID() } });
 const credential = { id: device.id, secretHash: device.secretHash };
 const make = (body = 'Abono de nomina a TDD 0123 30 octubre 04:26h ', suffix = randomUUID(), postedAt = '2026-10-30T11:19:00Z') => ({ contractVersion: 1 as const, eventId: randomUUID(), sourcePackage: 'com.bancomer.mbanking', notificationKeyHash: suffix.replaceAll('-', '').padEnd(64, 'a'), postedAt, receivedAt: '2026-10-30T12:00:00Z', fields: { 'android.title': 'BBVA', 'android.text': body } });
 const send = async (e: ReturnType<typeof make>) => { await service.receiveCaptureEvent(db, credential, e); return present((await db.captureEvent.findUniqueOrThrow({ where: { deviceId_eventId: { deviceId: device.id, eventId: e.eventId } }, include: { movement: true } })).movement); };
 const balance = async () => { const data = await money.loadMoneyData(db, user.id); return present(sources.accountBalances(data.accounts, sources.buildSources(data, '2026-10-31').events, '2026-10-31')[0]); };
 const reusedKey = randomUUID();
 let sample: Awaited<ReturnType<typeof send>>, estimated: Awaited<ReturnType<typeof send>>;
 const policy = { action: 'incomePolicy', parserKey: 'bbva.payroll.es.v1', accountSuffix: '0123', accountId: account.id, incomeTypeId: type.id, currency: 'MXN', datePolicy: 'NOTIFICATION_POSTED_AT', mode: 'AUTOMATIC', estimatedFirstHalfAmount: '800.50', estimatedSecondHalfAmount: '700.25' };
 try {
 await t.test('sin regla solo propone ingreso y rechaza cuenta ajena o muestra ausente', async () => {
  sample = await send(make()); assert.equal(sample.reason, 'INCOME_AMOUNT_REQUIRED'); assert.equal(await db.income.count({ where: { userId: user.id } }), 0);
  await assert.rejects(config.configureCapture(db, user.id, policy));
  await assert.rejects(config.configureCapture(db, other.id, { ...policy, verifiedMovementId: sample.id }));
  await config.configureCapture(db, user.id, { ...policy, verifiedMovementId: sample.id });
  await processing.resolveCaptureMovement(db, user.id, { id: sample.id, action: 'reinterpret' });
  assert.equal(await db.income.count({ where: { userId: user.id } }), 0);
 });
 await t.test('nueva nómina concurrente suma una vez y marca el saldo aproximado', async () => {
  const e = make(undefined, reusedKey, '2026-10-30T11:21:00Z');
  const results = await Promise.all([send(e), send(e), send(e)]); estimated = results[0]!;
  assert.ok(results.every(r => r.id === estimated.id)); assert.equal(estimated.reason, 'INCOME_ESTIMATED');
  const b = await balance(); assert.equal(b.balance, 800.25); assert.equal(b.estimatedIncomeAmount, 700.25);
  assert.equal(await db.income.count({ where: { userId: user.id, isEstimated: true } }), 1);
  assert.equal((await send({ ...e, eventId: randomUUID() })).id, estimated.id);
 });
 await t.test('confirma el real sobre el mismo ingreso y conserva el importe estimado original', async () => {
  const posting = await db.captureMoneyPosting.findUniqueOrThrow({ where: { movementId: estimated.id }, include: { income: true } });
  await assert.rejects(processing.resolveCaptureMovement(db, user.id, { id: estimated.id, action: 'confirmIncome', income: { amount: '690.10', expectedUpdatedAt: 'stale', confirmedReceived: true } }));
  await processing.resolveCaptureMovement(db, user.id, { id: estimated.id, action: 'confirmIncome', income: { amount: '690.10', expectedUpdatedAt: posting.income!.updatedAt.toISOString(), confirmedReceived: true } });
  assert.equal(await db.income.count({ where: { userId: user.id } }), 1); const b = await balance(); assert.equal(b.balance, 790.1); assert.equal(b.estimatedIncomeAmount, 0);
  const after = await db.income.findUniqueOrThrow({ where: { id: posting.incomeId! } }); assert.equal(after.isEstimated, false); assert.equal(Number(after.amount), 690.1);
 });
 await t.test('nómina idéntica o revisión posterior queda pendiente', async () => {
  const duplicate = await send(make()); assert.equal(duplicate.reason, 'INCOME_POSSIBLE_DUPLICATE');
  assert.equal(await db.income.count({ where: { userId: user.id } }), 1);
 });
 await t.test('depósito exige una muestra propia completa y no hereda la regla de nómina', async () => {
  const deposit = await send(make('Abono a tu cuenta *0123 de $123.45')); assert.equal(deposit.reason, 'INCOME_POLICY_REQUIRED');
  await assert.rejects(config.configureCapture(db, user.id, { ...policy, parserKey: 'bbva.account-deposit.es.v1', verifiedMovementId: sample.id }));
  await processing.resolveCaptureMovement(db, user.id, { id: deposit.id, action: 'registerIncome', income: { accountId: account.id, incomeTypeId: type.id, amount: '123.45', date: '2026-10-30', concept: 'Depósito QA', currency: 'MXN', confirmedReceived: true } });
  await config.configureCapture(db, user.id, { ...policy, parserKey: 'bbva.account-deposit.es.v1', verifiedMovementId: deposit.id });
  const automatic = await send(make('Abono a tu cuenta *0123 de $200.00')); assert.equal(automatic.reason, 'INCOME_REGISTERED'); assert.equal((await balance()).balance, 1113.55);
 });
 await t.test('borrado conserva recibo y un reintento no recrea el ingreso', async () => {
  const posting = await db.captureMoneyPosting.findUniqueOrThrow({ where: { movementId: estimated.id } }); await db.income.delete({ where: { id: posting.incomeId! } });
  await processing.resolveCaptureMovement(db, user.id, { id: estimated.id, action: 'registerIncome', income: {} });
  assert.equal((await db.captureMoneyPosting.findUniqueOrThrow({ where: { movementId: estimated.id } })).incomeId, null);
  const before = await db.income.count({ where: { userId: user.id } });
  assert.equal((await send(make())).reason, 'INCOME_POSSIBLE_DUPLICATE');
  assert.equal(await db.income.count({ where: { userId: user.id } }), before);
 });
 await t.test('aviso inválido y operación abortada no crean dinero', async () => {
  const bad = await send(make('Abono a tu cuenta *0123 de $-5.00')); assert.notEqual(bad.reason, 'INCOME_REGISTERED');
  const pending = await send(make('Abono a tu cuenta *0999 de $55.00'));
  const count = await db.income.count({ where: { userId: user.id } });
  await assert.rejects(db.$transaction(async tx => {
    await withFixtureDb(processing.resolveCaptureMovement, transactionFixture(tx), user.id, { id: pending.id, action: 'registerIncome', income: { accountId: account.id, incomeTypeId: type.id, amount: '55.00', date: '2026-10-30', concept: 'Rollback', currency: 'MXN', confirmedReceived: true } });
    throw Error('rollback');
  }));
  assert.equal((await db.captureMovement.findUniqueOrThrow({ where: { id: pending.id } })).status, 'REVIEW');
  assert.equal(await db.captureMoneyPosting.count({ where: { movementId: pending.id } }), 0);
  assert.equal(await db.income.count({ where: { userId: user.id } }), count);
 });
 await t.test('primera quincena usa su estimación y permite reutilizar la clave bancaria en otra fecha', async () => {
  const before = (await balance()).balance;
  const row = await send(make('Abono de nomina a TDD 0123 15 octubre 04:26h ', reusedKey, '2026-10-15T11:21:00Z'));
  assert.equal(row.reason, 'INCOME_ESTIMATED'); assert.equal((await balance()).balance, before + 800.5);
  const income = await db.income.findFirstOrThrow({ where: { userId: user.id, capturePostings: { some: { movementId: row.id } } } });
  assert.equal(Number(income.amount), 800.5);
 });
 await t.test('API filtra ingresos y protege sus detalles y reglas por propietario', async () => {
  const route = load('src/app/api/captures/movements/route.ts');
  const req = (query: string, token = 'owner') => new Request(`http://localhost/api/captures/movements?${query}`, { headers: { authorization: `Bearer ${token}` } });
  const result = await route.GET(req('kind=INCOME')); assert.equal(result.status, 200);
  assert.ok(Array.isArray(result.body.movements) && result.body.movements.length > 0);
  assert.equal((await route.GET(req(`id=${sample.id}`, 'other'))).status, 404);
  assert.equal((await route.GET(req('kind=INCOME', 'expired'))).status, 401);
  const detail = await route.GET(req(`id=${estimated.id}`)); assert.equal(detail.status, 200); assert.ok(detail.body.incomeDetail);
  const missingAmount = await route.GET(req(`id=${sample.id}`));
  const candidates = record(missingAmount.body.incomeDetail).candidates;
  assert.ok(Array.isArray(candidates) && candidates.length > 0, 'un aviso sin importe permite elegir un ingreso existente');
 });
 } finally { await db.user.deleteMany({ where: { id: { in: [user.id, other.id] } } }); await db.$disconnect(); }
});
