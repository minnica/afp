import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { integrationLoader, transactionFixture, withFixtureDb } from './helpers/integration-fixtures';
import { present, plain, dynamicRoute } from './helpers/financial-fixtures';
import { record, array } from './helpers/dynamic-values';
const connectionString = process.env.AFP_TEST_DATABASE_URL;
test('BBVA y cuentas por pagar: fecha/importe exactos, una salida de dinero y ambigüedades', { skip: !connectionString }, async t => {
 const url = new URL(present(connectionString)); assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && /^\/afp_test\w*$/.test(url.pathname) && !url.search);
 const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
 const user = await db.user.create({ data: { email: `payable-capture-${randomUUID()}@example.test` } }), other = await db.user.create({ data: { email: `payable-capture-other-${randomUUID()}@example.test` } });
 const load = integrationLoader({ '@/lib/prisma': { prisma: db }, '@/lib/calendar/schedule': { scheduleCalendarSync() {} }, 'next/server': { NextResponse: { json: (body: unknown, opts = {}) => ({ body: plain(body), status: opts.status || 200 }) } }, '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async token => ({ data: { user: token === 'owner' ? user : token === 'other' ? other : null } }) } }) } });
 const service = load('src/lib/captureService.ts'), config = load('src/lib/captureConfiguration.ts'), processing = load('src/lib/captureProcessing.ts'), matching = load('src/lib/capturePayables.ts');
 const money = load('src/lib/money/service.ts'), sources = load('src/lib/money/sources.ts');
 const payableRoute = dynamicRoute(load('src/app/api/payables/route.ts')), expenseRoute = load('src/app/api/expenses/route.ts'), captureRoute = load('src/app/api/captures/movements/route.ts');
 const account = await db.moneyAccount.create({ data: { userId: user.id, name: 'BBVA QA', kind: 'BANK', openingBalance: 10000, asOf: new Date('2026-10-01'), baseline: {} } });
 const second = await db.moneyAccount.create({ data: { userId: user.id, name: 'Otra QA', kind: 'BANK', openingBalance: 0, asOf: new Date('2026-10-01'), baseline: {} } });
 const person = await db.person.create({ data: { userId: user.id, name: 'Persona ficticia' } });
 const foreignPerson = await db.person.create({ data: { userId: other.id, name: 'Persona ajena' } });
 const device = await db.captureDevice.create({ data: { userId: user.id, approvedAt: new Date(), name: 'QA', secretHash: randomUUID() } });
 const credential = { id: device.id, secretHash: device.secretHash };
 const payable = (amount: string, date = '2026-10-30', owner = user, personId = person.id) => db.payableAccount.create({ data: { userId: owner.id, personId, concept: `Deuda QA ${amount}`, originalAmount: amount, originDate: new Date('2026-10-01'), expectedDate: new Date(date + 'T12:00:00Z'), originType: 'MANUAL' } });
 const make = (amount: string, clock = '23:52', key = randomUUID(), postedAt = '2026-10-31T06:00:26Z') => ({ contractVersion: 1 as const, eventId: randomUUID(), sourcePackage: 'com.bancomer.mbanking', notificationKeyHash: key.replaceAll('-', '').padEnd(64, 'a'), postedAt, receivedAt: '2026-10-31T06:00:27Z', fields: { 'android.title': 'Aviso de cargo en tu cuenta', 'android.text': `Tienes un cargo a tu cuenta *0123 de $${amount}. Esta información te ayuda a tener control en tus finanzas. Abre para más detalles. 30 de octubre de 2026, ${clock} h` } });
 const send = async (e: ReturnType<typeof make>) => { await service.receiveCaptureEvent(db, credential, e); return present((await db.captureEvent.findUniqueOrThrow({ where: { deviceId_eventId: { deviceId: device.id, eventId: e.eventId } }, include: { movement: true } })).movement); };
 const balance = async () => { const data = await money.loadMoneyData(db, user.id); return present(sources.accountBalances(data.accounts, sources.buildSources(data, '2026-10-31').events, '2026-10-31').find(a => a.id === account.id)).balance; };
 const request = (body: unknown, token = 'owner', method = 'PATCH', query = '') => new Request(`http://localhost/api/expenses?${query}`, { method, headers: { authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
 const rule = { action: 'moneyPolicy', kind: 'BBVA_DEBIT', fromAccountId: account.id, accountSuffixes: ['0123'], treatAsExpense: true, currency: 'MXN', datePolicy: 'NOTIFICATION_POSTED_AT', mode: 'AUTOMATIC' };
 try {
 await config.configureCapture(db, user.id, rule);
 await t.test('una coincidencia exacta liquida la deuda y descuenta una vez con fecha bancaria', async () => {
  const debt = await payable('120.00'), event = make('120.00'); const before = await balance();
  const results = await Promise.all([send(event), send(event), send(event)]); const row = results[0]!;
  assert.ok(results.every(r => r.id === row.id)); assert.equal(row.reason, 'BBVA_PAYABLE_MATCHED');
  const expense = await db.dailyExpense.findUniqueOrThrow({ where: { id: row.expenseId! } });
  assert.equal(expense.payableAccountId, debt.id); assert.equal(expense.date.toISOString().slice(0, 10), '2026-10-30'); assert.equal(expense.debitAccountId, account.id);
  assert.equal((await db.payableAccount.findUniqueOrThrow({ where: { id: debt.id } })).status, 'PAID_OFF'); assert.equal(await balance(), before - 120);
  assert.equal((await send({ ...event, eventId: randomUUID() })).id, row.id);
 });
 await t.test('una deuda creada desde la API participa en la automatización del mismo propietario', async () => {
  const created = await payableRoute.POST(request({ personId: person.id, concept: 'Deuda API QA', originalAmount: '85.00', originDate: '2026-10-01', expectedDate: '2026-10-30' }, 'owner', 'POST'));
  assert.equal(created.status, 200); const debtId = record(created.body.payable).id;
  const row = await send(make('85.00')); assert.equal(row.reason, 'BBVA_PAYABLE_MATCHED');
  assert.equal((await db.dailyExpense.findUniqueOrThrow({ where: { id: row.expenseId! } })).payableAccountId, debtId);
 });
 await t.test('pagos parciales previos comparan el saldo pendiente, con centavos exactos', async () => {
  const debt = await payable('200.25'); const category = await db.category.findUniqueOrThrow({ where: { userId_name: { userId: user.id, name: 'Por clasificar' } } });
  await db.dailyExpense.create({ data: { userId: user.id, date: new Date('2026-10-10'), amount: '50.25', concept: 'Abono previo', paymentMethod: 'CASH', payableAccountId: debt.id, categoryId: category.id } });
  const row = await send(make('150.00', '23:53')); assert.equal(row.reason, 'BBVA_PAYABLE_MATCHED'); assert.equal((await db.dailyExpense.findUniqueOrThrow({ where: { id: row.expenseId! } })).payableAccountId, debt.id);
  assert.equal((await db.payableAccount.findUniqueOrThrow({ where: { id: debt.id } })).status, 'PAID_OFF');
 });
 await t.test('la cuenta de débito real prevalece sobre la ruta genérica de efectivo', async () => {
  const route = await db.moneyRoute.create({ data: { userId: user.id, key: 'default:expense', accountId: second.id } });
  const debt = await payable('84.00'), row = await send(make('84.00'));
  assert.equal(row.reason, 'BBVA_PAYABLE_MATCHED');
  const expense = await db.dailyExpense.findUniqueOrThrow({ where: { id: row.expenseId! } });
  assert.equal(expense.payableAccountId, debt.id); assert.equal(expense.debitAccountId, account.id);
  await db.moneyRoute.delete({ where: { id: route.id } });
 });
 await t.test('dos operaciones de igual importe con horas bancarias distintas se registran ambas', async () => {
  const a = await send(make('90.00', '23:49')), b = await send(make('90.00', '23:50')); assert.equal(a.reason, 'BBVA_DEBIT_AUTOMATIC'); assert.equal(b.reason, 'BBVA_DEBIT_AUTOMATIC'); assert.notEqual(a.expenseId, b.expenseId);
  assert.equal((await send(make('90.00', '23:49'))).reason, 'MONEY_POSSIBLE_DUPLICATE');
  const edited = await send(make('94.00', '23:49'));
  await db.dailyExpense.update({ where: { id: edited.expenseId! }, data: { amount: '95.00' } });
  assert.equal((await send(make('95.00', '23:50'))).reason, 'MONEY_POSSIBLE_DUPLICATE');
 });
 await t.test('una revisión del mismo aviso solo permite otro cargo si cambia la hora bancaria', async () => {
  const key = randomUUID(); const a = await send(make('91.00', '23:49', key)); const b = await send(make('91.00', '23:50', key)); assert.notEqual(a.expenseId, b.expenseId); assert.equal(b.reason, 'BBVA_DEBIT_AUTOMATIC');
  const revision = make('92.00', '23:50', key); assert.equal((await send(revision)).reason, 'NOTIFICATION_REVISION');
 });
 await t.test('dos deudas con misma fecha/importe quedan pendientes sin escoger una', async () => {
  const debts = await Promise.all([payable('33.00'), payable('33.00')]), before = await balance(); const row = await send(make('33.00'));
  assert.equal(row.reason, 'BBVA_PAYABLE_MATCH_AMBIGUOUS'); assert.equal(row.expenseId, null); assert.equal(await balance(), before);
  assert.ok((await db.payableAccount.findMany({ where: { id: { in: debts.map(d => d.id) } } })).every(d => d.status === 'ACTIVE'));
  const inbox = await captureRoute.GET(new Request('http://localhost/api/captures/movements?kind=PENDING', { headers: { authorization: 'Bearer owner' } })); assert.equal(inbox.status, 200); assert.ok(array(inbox.body.movements).some(r => record(r).id === row.id));
  const foreign = await payable('33.00', '2026-10-30', other, foreignPerson.id);
  await assert.rejects(processing.resolveCaptureMovement(db, user.id, { id: row.id, action: 'registerDebitExpense', money: { fromAccountId: account.id, payableAccountId: foreign.id, amount: '33.00', date: '2026-10-30', concept: 'QA', currency: 'MXN' } }));
  const resolved = await processing.resolveCaptureMovement(db, user.id, { id: row.id, action: 'registerDebitExpense', money: { fromAccountId: account.id, payableAccountId: debts[1]!.id, amount: '33.00', date: '2026-10-30', concept: 'Pago confirmado QA', currency: 'MXN' } });
  assert.equal((await db.dailyExpense.findUniqueOrThrow({ where: { id: resolved!.expenseId! } })).payableAccountId, debts[1]!.id);
 });
 await t.test('no cruza propietarios, cuentas bancarias, fechas, importes ni deudas canceladas', async () => {
  const foreign = await payable('44.00', '2026-10-30', other, foreignPerson.id); await payable('45.00', '2026-10-29'); const routed = await payable('46.00');
  await db.moneyRoute.create({ data: { userId: user.id, key: `payable:${routed.id}`, accountId: second.id } });
  const cancelled = await payable('47.00'); await db.payableAccount.update({ where: { id: cancelled.id }, data: { status: 'CANCELLED' } });
  await payable('48.01');
  for (const amount of ['44.00', '45.00', '46.00', '47.00', '48.00']) { const row = await send(make(amount)); assert.equal(row.reason, 'BBVA_DEBIT_AUTOMATIC'); assert.equal((await db.dailyExpense.findUniqueOrThrow({ where: { id: row.expenseId! } })).payableAccountId, null); }
  assert.equal((await db.payableAccount.findUniqueOrThrow({ where: { id: foreign.id } })).status, 'ACTIVE');
 });
 await t.test('una cuenta por pagar y un corte de tarjeta compatibles conservan revisión', async () => {
  await payable('350.00'); const card = await db.card.create({ data: { userId: user.id, name: 'Tarjeta QA', usualCutDay: 15, usualDueDay: 30 } });
  await db.cardCycle.create({ data: { userId: user.id, cardId: card.id, month: 10, year: 2026, startDate: new Date('2026-09-15'), cutDate: new Date('2026-10-15'), dueDate: new Date('2026-10-30'), statementAmount: 350, datesConfirmedAt: new Date() } });
  const row = await send(make('350.00')); assert.equal(row.reason, 'BBVA_DESTINATION_MATCH_AMBIGUOUS'); assert.equal(row.expenseId, null); assert.equal(await db.moneyCardPayment.count({ where: { userId: user.id } }), 0);
 });
 await t.test('los préstamos no amortizan capital a partir de un cargo genérico', async () => {
  const loan = await payable('55.00'); await db.payableAccount.update({ where: { id: loan.id }, data: { accountType: 'LOAN', currentBalance: 55 } });
  const row = await send(make('55.00')); assert.equal(row.reason, 'BBVA_DEBIT_AUTOMATIC'); assert.equal((await db.dailyExpense.findUniqueOrThrow({ where: { id: row.expenseId! } })).payableAccountId, null);
 });
 await t.test('editar y borrar un pago con débito recalcula deuda y cuenta', async () => {
  const debt = await payable('66.00'), row = await send(make('66.00')); const expense = await db.dailyExpense.findUniqueOrThrow({ where: { id: row.expenseId! } }), before = await balance();
  const edit = { id: expense.id, date: '2026-10-30', paymentMethod: 'DEBIT', debitAccountId: account.id, amount: '60.00', concept: expense.concept, categoryId: expense.categoryId };
  assert.equal((await expenseRoute.PATCH(request(edit, 'other'))).status, 404); assert.equal((await expenseRoute.PATCH(request(edit))).status, 200);
  assert.equal((await db.payableAccount.findUniqueOrThrow({ where: { id: debt.id } })).status, 'ACTIVE'); assert.equal(await balance(), before + 6);
  assert.equal((await expenseRoute.DELETE(request(null, 'owner', 'DELETE', `id=${expense.id}`))).status, 200); assert.equal(await balance(), before + 66);
  await processing.resolveCaptureMovement(db, user.id, { id: row.id, action: 'registerDebitExpense', money: {} }); assert.equal(await db.dailyExpense.count({ where: { id: expense.id } }), 0);
  assert.equal((await send(make('66.00'))).reason, 'MONEY_POSSIBLE_DUPLICATE');
  assert.equal((await db.payableAccount.findUniqueOrThrow({ where: { id: debt.id } })).status, 'ACTIVE');
 });
 await t.test('un gasto previo se vincula y corrige de fecha sin otra salida de dinero', async () => {
  const row = await send(make('77.00')), before = await balance(), debt = await payable('77.00');
  const expenseId = row.expenseId!;
  await db.dailyExpense.update({ where: { id: expenseId }, data: { date: new Date('2026-10-31T12:00:00Z') } });
  // Reproduce the unedited legacy receipt from the former notification-date policy.
  await db.$executeRaw`UPDATE daily_expenses SET "updatedAt" = "createdAt" WHERE id = ${expenseId}`;
  const posting = await db.captureMoneyPosting.findUniqueOrThrow({ where: { movementId: row.id } });
  await db.captureMoneyPosting.update({ where: { id: posting.id }, data: { snapshot: { ...record(posting.snapshot), date: '2026-10-31' } } });
  const original = await db.captureEvent.findFirstOrThrow({ where: { movementId: row.id } });
  const inspect = await matching.inspectCapturedPayable(db, await db.captureMovement.findUniqueOrThrow({ where: { id: row.id } })); assert.equal(inspect.candidates.length, 1);
  const foreignAttempt = await captureRoute.PATCH(new Request('http://localhost/api/captures/movements', { method: 'PATCH', headers: { authorization: 'Bearer other', 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row.id, action: 'matchPayable' }) }));
  assert.equal(foreignAttempt.status, 404);
  await processing.resolveCaptureMovement(db, user.id, { id: row.id, action: 'matchPayable' }); await processing.resolveCaptureMovement(db, user.id, { id: row.id, action: 'matchPayable' });
  const updated = await db.dailyExpense.findUniqueOrThrow({ where: { id: expenseId } }); assert.equal(updated.payableAccountId, debt.id); assert.equal(updated.date.toISOString().slice(0, 10), '2026-10-30'); assert.equal(await balance(), before);
  assert.deepEqual((await db.captureEvent.findUniqueOrThrow({ where: { id: original.id } })).interpretation, original.interpretation);
 });
 await t.test('gastos editados o incluidos en referencia no se reasocian automáticamente', async () => {
  const row = await send(make('78.00')); await payable('78.00'); await db.dailyExpense.update({ where: { id: row.expenseId! }, data: { concept: 'Concepto personal' } });
  await assert.rejects(processing.resolveCaptureMovement(db, user.id, { id: row.id, action: 'matchPayable' }));
  const baselineRow = await send(make('79.00')); await payable('79.00'); await db.moneyAccount.update({ where: { id: account.id }, data: { baseline: { [`expense:${baselineRow.expenseId}`]: { [account.id]: -7900 } } } });
  await assert.rejects(processing.resolveCaptureMovement(db, user.id, { id: baselineRow.id, action: 'matchPayable' }));
  await db.moneyAccount.update({ where: { id: account.id }, data: { baseline: {} } });
 });
 await t.test('rollback revierte gasto, recibo y liquidación de deuda juntos', async () => {
  const debt = await payable('81.00'), e = make('81.00'); const count = await db.dailyExpense.count({ where: { userId: user.id } });
  await assert.rejects(db.$transaction(async tx => { await withFixtureDb(service.receiveCaptureEvent, transactionFixture(tx), credential, e); throw Error('rollback QA'); }));
  assert.equal(await db.dailyExpense.count({ where: { userId: user.id } }), count); assert.equal((await db.payableAccount.findUniqueOrThrow({ where: { id: debt.id } })).status, 'ACTIVE');
 });
 } finally { await db.user.deleteMany({ where: { id: { in: [user.id, other.id] } } }); await db.$disconnect(); }
});
