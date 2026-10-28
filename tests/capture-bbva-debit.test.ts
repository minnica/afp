import { plain,present,sparseCalculations,stringValue } from './helpers/financial-fixtures';
import { integrationLoader as sourceLoader,transactionFixture,withFixtureDb } from './helpers/integration-fixtures';

import type { CaptureInput } from './helpers/integration-fixtures';

import { array,record as objectValue } from './helpers/dynamic-values';

// Datos ficticios. PostgreSQL local, sin credenciales ni avisos personales.
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { test } from 'node:test';

const { interpretCapture } = sparseCalculations(sourceLoader()('src/lib/captureParsers.ts'));
const notice = (body: unknown, extra = {}) => ({ sourcePackage: 'com.bancomer.mbanking', postedAt: '2026-10-26T04:06:00Z', receivedAt: '2026-10-26T04:07:00Z', fields: { 'android.title': 'BBVA', 'android.text': body, ...extra } });
test('BBVA: admite las variantes exactas de cuatro y cinco cifras, sin inferir receptor ni moneda', () => {
  for (const suffix of ['0123', '90123'] as const) {
    for (const body of [`Cargo a tu cuenta *${suffix} de $123.45 `, `Tienes un cargo a tu cuenta *${suffix} de $123.45. Información ficticia.`] as const) {
      const row = interpretCapture(notice(body));
      assert.equal(row.reason, 'ACCOUNT_DEBIT_REVIEW'); assert.equal(row.proposal.accountSuffix, suffix);
      assert.equal(row.proposal.amount, '123.45'); assert.equal(row.proposal.date, '2026-10-25');
      assert.equal(row.proposal.merchant, 'Cargo BBVA'); assert.equal(row.proposal.currency, undefined); assert.equal(row.proposal.cardId, undefined);
    }
  }
});
test('BBVA: importes ambiguos, moneda extranjera, devolución, contradicción y otra app quedan sin propuesta de gasto', () => {
  const base = 'Cargo a tu cuenta *90123 de $123.45';
  const events = [notice(base.replace('123.45', '1,23.45')), notice(base.replace('90123', '123456')), notice(base + ' USD'), notice(base, { 'android.subText': 'USD' }), notice(base, { 'android.subText': 'Devolución' }), notice(base, { 'android.bigText': base.replace('123.45', '321.00') }), { ...notice(base), sourcePackage: 'com.nu.production' }];
  for (const event of events) assert.notEqual(interpretCapture(event).reason, 'ACCOUNT_DEBIT_REVIEW');
});
const connectionString = process.env.AFP_TEST_DATABASE_URL;
test('BBVA: regla, efecto financiero, corrección e idempotencia con PostgreSQL', { skip: !connectionString }, async t => {
  const url = new URL(present(connectionString)); assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && /^\/afp_test\w*$/.test(url.pathname));
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const users = await Promise.all(['owner', 'other'].map(x => db.user.create({ data: { email: `bbva-${x}-${randomUUID()}@example.test` } }))), [user, other] = users;
  const load = sourceLoader({ '@/lib/prisma': { prisma: db }, '@/lib/calendar/schedule': { scheduleCalendarSync() {} }, 'next/server': { NextResponse: { json: (body: unknown, opts = {}) => ({ body: plain(body), status: opts.status || 200 }) } }, '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async token => ({ data: { user: token === 'owner' ? user : other } }) } }) } });
  const protocol = sparseCalculations(load('src/lib/captureProtocol.ts')), service = load('src/lib/captureService.ts'), processing = load('src/lib/captureProcessing.ts');
  const config = load('src/lib/captureConfiguration.ts'), money = load('src/lib/money/service.ts'), sources = load('src/lib/money/sources.ts');
  const route = load('src/app/api/captures/movements/route.ts');
  const account = (u: { name: string | null; id: string; createdAt: Date; email: string; } | undefined, name: string) => db.moneyAccount.create({ data: { userId: present(u).id, name, kind: 'BANK', openingBalance: 10000, asOf: new Date('2026-10-24'), baseline: {} } });
  const bbva = await account(user, 'Cuenta QA'), destination = await account(user, 'Destino QA'), foreign = await account(other, 'Ajena QA');
  const device = await db.captureDevice.create({ data: { userId: present(user).id, name: 'QA', approvedAt: new Date(), secretHash: protocol.captureHash(randomBytes(32).toString('hex')) } });
  const credential = { id: device.id, secretHash: device.secretHash };
  const make = (amount: string, suffix = '90123') => protocol.validateCaptureEvent({ contractVersion: 1 as const, eventId: randomUUID(), notificationKeyHash: protocol.captureHash(randomUUID()), ...notice(`Cargo a tu cuenta *${suffix} de $${amount}`) });
  const send = async (event: CaptureInput) => { await service.receiveCaptureEvent(db, credential, event); return present((await db.captureEvent.findUnique({ where: { deviceId_eventId: { deviceId: device.id, eventId: event.eventId } }, include: { movement: true } }))).movement; };
  const rule = { action: 'moneyPolicy', kind: 'BBVA_DEBIT', fromAccountId: bbva.id, accountSuffixes: ['0123', '90123'], treatAsExpense: true, currency: 'MXN', datePolicy: 'NOTIFICATION_POSTED_AT', mode: 'AUTOMATIC' };
  const correct = (id: string, correction: unknown, owner = present(user).id) => processing.resolveCaptureMovement(db, owner, { id, action: 'correctDebitType', correction });
  const balances = async () => { const data = await money.loadMoneyData(db, present(user).id); return sources.accountBalances(data.accounts, sources.buildSources(data, '2026-10-26').events, '2026-10-26'); };
  const balance = async (id: string) => Number(present((await balances()).find(a => a.id === id)).balance);
  const request = (query: string, token = 'owner') => new Request(`http://localhost/api/captures/movements?${query}`, { headers: { authorization: `Bearer ${token}` } });
  let first: import('@prisma/client').CaptureMovement | null | undefined, cycle: import('@prisma/client').CardCycle;
  try {
    await t.test('requiere aceptación explícita y cuenta propia; no aplica avisos pasados al guardar', async () => {
      const row = await send(make('123.45')); assert.equal(present(row).reason, 'ACCOUNT_DEBIT_REVIEW');
      await assert.rejects(config.configureCapture(db, present(user).id, { ...rule, treatAsExpense: undefined }), e => objectValue(e).status === 400);
      await assert.rejects(config.configureCapture(db, present(user).id, { ...rule, fromAccountId: foreign.id }), e => objectValue(e).status === 404);
      await assert.rejects(config.configureCapture(db, present(user).id, { ...rule, accountSuffixes: [] }), e => objectValue(e).status === 400);
      await config.configureCapture(db, present(user).id, rule);
      assert.equal(await db.dailyExpense.count({ where: { userId: present(user).id } }), 0);
      const reinterpreted = await processing.resolveCaptureMovement(db, present(user).id, { id: present(row).id, action: 'reinterpret' }); assert.equal(present(reinterpreted).reason, 'MONEY_OBSERVATION');
      assert.equal(await db.dailyExpense.count({ where: { userId: present(user).id } }), 0);
      const registered = await processing.resolveCaptureMovement(db, present(user).id, { id: present(row).id, action: 'registerDebitExpense', money: { fromAccountId: bbva.id, amount: '123.45', date: '2026-10-25', concept: 'Cargo BBVA', currency: 'MXN' } });
      assert.equal(present(registered).status, 'REGISTERED');
    });
    await t.test('registra una sola vez, resta saldo y clasifica como débito sin buscar destinatario', async () => {
      const event = make('111.11'); const rows = await Promise.all(Array.from({ length: 4 }, () => send(event))); first = rows[0];
      assert.ok(rows.every(r => present(r).id === present(first).id && present(r).reason === 'BBVA_DEBIT_AUTOMATIC'));
      const expense = await db.dailyExpense.findUnique({ where: { id: present(present(first).expenseId) }, include: { category: true } });
      assert.equal(present(expense).paymentMethod, 'DEBIT'); assert.equal(present(expense).debitAccountId, bbva.id); assert.equal(present(expense).cardId, null); assert.equal(present(expense).category.name, 'Por clasificar'); assert.equal(present(expense).concept, 'Cargo BBVA');
      assert.equal(await balance(bbva.id), 9765.44);
      assert.equal(present((await send({ ...event, eventId: randomUUID() }))).id, present(first).id);
      assert.equal(present((await send(make('111.11')))).reason, 'MONEY_POSSIBLE_DUPLICATE');
      assert.equal(await balance(bbva.id), 9765.44);
      const revised = { ...event, eventId: randomUUID(), fields: { ...event.fields, 'android.text': 'Cargo a tu cuenta *90123 de $112.12' } };
      assert.equal(present((await send(revised))).reason, 'NOTIFICATION_REVISION');
      assert.equal(await balance(bbva.id), 9765.44);
      const short = await send(make('12.34', '0123')); assert.equal(present(short).reason, 'BBVA_DEBIT_AUTOMATIC');
      const detail = await route.GET(request(`id=${present(first).id}`)); assert.equal(detail.status, 200); assert.equal(objectValue(objectValue(detail.body.moneyDetail).posting).kind, 'DEBIT_EXPENSE');
    });
    await t.test('pausas, otras terminaciones y avisos previos al saldo no producen gastos', async () => {
      const before = await db.dailyExpense.count({ where: { userId: present(user).id } });
      assert.equal(present((await send(make('13.33', '80123')))).reason, 'ACCOUNT_DEBIT_REVIEW');
      const old = make('14.44'); old.postedAt = '2026-10-23T12:00:00Z'; assert.equal(present((await send(old))).reason, 'MONEY_BEFORE_REFERENCE');
      await config.configureCapture(db, present(user).id, { ...rule, mode: 'OBSERVATION' }); assert.equal(present((await send(make('15.55')))).reason, 'MONEY_OBSERVATION');
      assert.equal(await db.dailyExpense.count({ where: { userId: present(user).id } }), before); await config.configureCapture(db, present(user).id, rule);
    });
    await t.test('corregir a retiro conserva saldo e historial, retira el gasto y no se repite', async () => {
      const before = await balance(bbva.id);
      await Promise.all([correct(present(first).id, { kind: 'WITHDRAWAL' }), correct(present(first).id, { kind: 'WITHDRAWAL' })]);
      assert.equal(await balance(bbva.id), before); assert.equal(await db.dailyExpense.findUnique({ where: { id: present(present(first).expenseId) } }), null);
      assert.ok(await db.expenseTombstone.findUnique({ where: { expenseId: present(present(first).expenseId) } }));
      const row = await db.captureMoneyPosting.findUnique({ where: { movementId: present(first).id } }); assert.equal(present(row).kind, 'WITHDRAWAL'); assert.equal(present(row).originalRecordId, present(first).expenseId);
      await assert.rejects(correct(present(first).id, { kind: 'TRANSFER', toAccountId: destination.id }), e => objectValue(e).status === 409);
      await processing.resolveCaptureMovement(db, present(user).id, { id: present(first).id, action: 'registerDebitExpense', money: {} }); assert.equal(await balance(bbva.id), before);
      await money.mutateMoney(db, present(user).id, { action: 'REVERSE_WITHDRAWAL', operationId: randomUUID(), id: present(row).withdrawalId });
      assert.equal(await balance(bbva.id), Math.round((before + 111.11) * 100) / 100);
    });
    await t.test('corregir a transferencia mueve el destino sin otra salida y rechaza cuentas ajenas', async () => {
      const row = await send(make('222.22')), fromBefore = await balance(bbva.id), toBefore = await balance(destination.id);
      await assert.rejects(correct(present(row).id, { kind: 'TRANSFER', toAccountId: foreign.id }), e => objectValue(e).status === 404);
      await assert.rejects(correct(present(row).id, { kind: 'TRANSFER', toAccountId: bbva.id }), e => objectValue(e).status === 409);
      await assert.rejects(correct(present(row).id, { kind: 'WITHDRAWAL' }, present(other).id), e => objectValue(e).status === 404);
      await correct(present(row).id, { kind: 'TRANSFER', toAccountId: destination.id }); await correct(present(row).id, { kind: 'TRANSFER', toAccountId: destination.id });
      assert.equal(await balance(bbva.id), fromBefore); assert.equal(await balance(destination.id), toBefore + 222.22);
      const expenses = await route.GET(request('kind=EXPENSE&status=REGISTERED')); assert.equal(expenses.status, 200); assert.ok(!array(expenses.body.movements).some(r => [present(first).id, present(row).id].includes(stringValue(objectValue(r).id))));
      const movements = await route.GET(request('kind=MONEY&status=REGISTERED')); assert.ok(array(movements.body.movements).some(r => objectValue(r).id === present(row).id && objectValue(r).kind === 'MONEY'));
    });
    await t.test('corregir a pago abona el corte, conserva la salida y aparece solo en Pagos', async () => {
      const card = await db.card.create({ data: { userId: present(user).id, name: 'Crédito QA', usualCutDay: 10, usualDueDay: 25 } });
      cycle = await db.cardCycle.create({ data: { userId: present(user).id, cardId: card.id, month: 10, year: 2026, startDate: new Date('2026-09-11'), cutDate: new Date('2026-10-10'), dueDate: new Date('2026-10-25'), statementAmount: 500 } });
      const row = await send(make('333.33')), before = await balance(bbva.id);
      const detail = await route.GET(request(`id=${present(row).id}`)); assert.ok(array(objectValue(detail.body.moneyDetail).cycles).some(c => objectValue(c).id === cycle.id));
      await correct(present(row).id, { kind: 'CARD_PAYMENT', cycleId: cycle.id }); await correct(present(row).id, { kind: 'CARD_PAYMENT', cycleId: cycle.id });
      assert.equal(Number(present((await db.cardCycle.findUnique({ where: { id: cycle.id } }))).paidAmount), 333.33); assert.equal(await balance(bbva.id), before);
      const paymentRows = await route.GET(request('kind=PAYMENT&status=REGISTERED')); assert.ok(array(paymentRows.body.movements).some(r => objectValue(r).id === present(row).id && objectValue(r).kind === 'PAYMENT'));
      const expenseRows = await route.GET(request('kind=EXPENSE&status=REGISTERED')); assert.ok(!array(expenseRows.body.movements).some(r => objectValue(r).id === present(row).id));
      const saved = await route.GET(request(`id=${present(row).id}`)); assert.equal(objectValue(objectValue(objectValue(objectValue(objectValue(saved.body.moneyDetail).posting).cardPayment).cycle).card).name, 'Crédito QA');
    });
    await t.test('errores y duplicados conservan el gasto original, sin efectos parciales', async () => {
      const row = await send(make('444.44')), before = await balance(bbva.id);
      await assert.rejects(correct(present(row).id, { kind: 'CARD_PAYMENT', cycleId: randomUUID() }), e => objectValue(e).status === 404);
      await assert.rejects(correct(present(row).id, { kind: 'CARD_PAYMENT', cycleId: cycle.id }), e => objectValue(e).status === 409);
      assert.ok(await db.dailyExpense.findUnique({ where: { id: present(present(row).expenseId) } })); assert.equal(await balance(bbva.id), before);
      await db.moneyWithdrawal.create({ data: { userId: present(user).id, accountId: bbva.id, date: new Date('2026-10-25'), amount: '444.44', concept: 'Ya registrado QA' } });
      await assert.rejects(correct(present(row).id, { kind: 'WITHDRAWAL' }), e => objectValue(e).status === 409);
      const counts = await db.moneyTransfer.count({ where: { userId: present(user).id } });
      await assert.rejects(db.$transaction(async tx => { await withFixtureDb(processing.resolveCaptureMovement, transactionFixture(tx), present(user).id, { id: present(row).id, action: 'correctDebitType', correction: { kind: 'TRANSFER', toAccountId: destination.id } }); throw Error('rollback QA'); }), /rollback QA/);
      assert.ok(await db.dailyExpense.findUnique({ where: { id: present(present(row).expenseId) } })); assert.equal(await db.moneyTransfer.count({ where: { userId: present(user).id } }), counts);
      assert.equal(present((await send(make('444.44')))).reason, 'MONEY_POSSIBLE_DUPLICATE');
      await db.dailyExpense.update({ where: { id: present(present(row).expenseId) }, data: { amount: '1.23' } });
      await assert.rejects(correct(present(row).id, { kind: 'TRANSFER', toAccountId: destination.id }), e => objectValue(e).status === 409);
    });
  } finally { await db.user.deleteMany({ where: { id: { in: users.map(u => u.id) } } }); await db.$disconnect(); }
});
