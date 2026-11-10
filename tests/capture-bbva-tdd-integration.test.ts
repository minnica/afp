import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { fixtureDatabase } from './helpers/fixture-database';
import { integrationLoader, withFixtureDb } from './helpers/integration-fixtures';
import { plain, present } from './helpers/financial-fixtures';
import { faultingTransactions } from './helpers/financial-persistence';
import { loadMoneyData } from '../src/lib/money/data';
import { accountBalances, buildSources } from '../src/lib/money/sources';

test('TDD: recepción, regla BBVA, gasto único y efecto financiero con PostgreSQL', { skip: !process.env.AFP_TEST_DATABASE_URL }, async t => {
  const db = await fixtureDatabase(present(process.env.AFP_TEST_DATABASE_URL));
  const load = integrationLoader({ '@/lib/prisma': { prisma: db }, '@/lib/calendar/schedule': { scheduleCalendarSync() {} } });
  const service = load('src/lib/captureService.ts'), config = load('src/lib/captureConfiguration.ts'), processing = load('src/lib/captureProcessing.ts');
  const protocol = load('src/lib/captureProtocol.ts'), inbox = load('src/lib/captureInbox.ts');
  const owners: string[] = [];
  async function fixture(mode = 'AUTOMATIC', configured = true) {
    const user = await db.user.create({ data: { email: `tdd-${randomUUID()}@example.test` } }); owners.push(user.id);
    const bank = await db.moneyAccount.create({ data: { userId: user.id, name: 'Banco ficticio', kind: 'BANK', openingBalance: 1000, asOf: new Date('2026-10-01'), baseline: {} } });
    const cash = await db.moneyAccount.create({ data: { userId: user.id, name: 'Caja ficticia', kind: 'CASH', openingBalance: 500, asOf: new Date('2026-10-01'), baseline: {} } });
    await db.moneyRoute.create({ data: { userId: user.id, key: 'default:expense', accountId: cash.id } });
    const device = await db.captureDevice.create({ data: { userId: user.id, name: 'Teléfono ficticio', approvedAt: new Date(), secretHash: protocol.captureHash(randomBytes(32).toString('hex')) } });
    const credential = { id: device.id, secretHash: device.secretHash };
    if (configured) await config.configureCapture(db, user.id, { action: 'moneyPolicy', kind: 'BBVA_DEBIT', fromAccountId: bank.id, accountSuffixes: ['0123'], treatAsExpense: true, currency: 'MXN', datePolicy: 'NOTIFICATION_POSTED_AT', mode });
    const event = (amount = '67.89', clock = '23:41', suffix = '0123') => protocol.validateCaptureEvent({
      contractVersion: 1 as const, eventId: randomUUID(), sourcePackage: 'com.bancomer.mbanking', notificationKeyHash: protocol.captureHash(randomUUID()),
      postedAt: `2026-10-26T05:${clock.slice(3)}:30Z`, receivedAt: `2026-10-26T05:${clock.slice(3)}:31Z`,
      fields: { 'android.title': 'Compra con TDD', 'android.text': `Compra con TDD ${suffix} en MERPAGO*TIENDA FICTICIA $${amount} 25 octubre ${clock}h` },
    });
    const send = async (input = event()) => { await service.receiveCaptureEvent(db, credential, input); return present(present(await db.captureEvent.findUnique({ where: { deviceId_eventId: { deviceId: device.id, eventId: input.eventId } }, include: { movement: true } })).movement); };
    const balances = async () => { const data = await loadMoneyData(db, user.id); return accountBalances(data.accounts, buildSources(data, '2026-10-26').events, '2026-10-26'); };
    return { user, bank, cash, device, credential, event, send, balances };
  }
  try {
    await t.test('guarda el comercio como gasto de débito, resta solo al banco y aparece en Gastos de Captura', async () => {
      const f = await fixture(), input = f.event();
      const rows = await Promise.all(Array.from({ length: 5 }, () => f.send(input))); assert.ok(rows.every(r => r.id === rows[0]!.id));
      const row = present(rows[0]); assert.equal(row.reason, 'BBVA_DEBIT_AUTOMATIC'); assert.equal(row.status, 'REGISTERED');
      const expense = await db.dailyExpense.findUniqueOrThrow({ where: { id: present(row.expenseId) } });
      assert.equal(expense.paymentMethod, 'DEBIT'); assert.equal(expense.debitAccountId, f.bank.id); assert.equal(expense.cardId, null);
      assert.equal(expense.concept, 'MERPAGO*TIENDA FICTICIA'); assert.equal(expense.date.toISOString().slice(0, 10), '2026-10-25');
      assert.equal(inbox.captureMovementKind(row), 'EXPENSE');
      assert.equal(await db.captureMovement.count({ where: { userId: f.user.id, ...inbox.captureKindWhere('EXPENSE') } }), 1);
      assert.equal(await db.captureMovement.count({ where: { userId: f.user.id, ...inbox.captureKindWhere('MONEY') } }), 0);
      assert.equal((await f.send({ ...input, eventId: randomUUID() })).id, row.id);
      assert.equal((await f.send()).reason, 'MONEY_POSSIBLE_DUPLICATE');
      assert.equal(await db.dailyExpense.count({ where: { userId: f.user.id } }), 1);
      const balances = await f.balances(); assert.equal(balances.find(a => a.id === f.bank.id)?.balance, 932.11); assert.equal(balances.find(a => a.id === f.cash.id)?.balance, 500);
    });
    await t.test('una compra explícita no liquida tarjetas ni deudas por coincidir en importe y fecha', async () => {
      const f = await fixture(), person = await db.person.create({ data: { userId: f.user.id, name: 'Persona ficticia' } });
      const debt = await db.payableAccount.create({ data: { userId: f.user.id, personId: person.id, concept: 'Deuda ficticia', originalAmount: '67.89', originDate: new Date('2026-10-01'), expectedDate: new Date('2026-10-25'), originType: 'MANUAL' } });
      const card = await db.card.create({ data: { userId: f.user.id, name: 'Tarjeta ficticia', usualCutDay: 5, usualDueDay: 25 } });
      const cycle = await db.cardCycle.create({ data: { userId: f.user.id, cardId: card.id, year: 2026, month: 10, startDate: new Date('2026-09-06'), cutDate: new Date('2026-10-05'), dueDate: new Date('2026-10-25'), statementAmount: '67.89' } });
      const row = await f.send(); assert.equal(row.reason, 'BBVA_DEBIT_AUTOMATIC');
      assert.equal((await db.dailyExpense.findUniqueOrThrow({ where: { id: present(row.expenseId) } })).payableAccountId, null);
      assert.equal((await db.payableAccount.findUniqueOrThrow({ where: { id: debt.id } })).status, 'ACTIVE');
      assert.equal((await db.cardCycle.findUniqueOrThrow({ where: { id: cycle.id } })).paidAmount, null); assert.equal(await db.moneyCardPayment.count({ where: { userId: f.user.id } }), 0);
    });
    await t.test('pausa, ausencia de regla y terminación ajena no producen gastos', async () => {
      for (const f of [await fixture('OBSERVATION'), await fixture('AUTOMATIC', false)]) {
        const row = await f.send(); assert.equal(row.status, 'REVIEW'); assert.equal(row.expenseId, null);
        assert.equal(inbox.captureMovementKind(row), 'MONEY'); assert.equal(await db.captureMovement.count({ where: { userId: f.user.id, ...inbox.captureKindWhere('PENDING') } }), 1);
      }
      const f = await fixture(); assert.equal((await f.send(f.event('67.89', '23:41', '9999'))).expenseId, null);
      await db.moneyAccount.update({ where: { id: f.bank.id }, data: { asOf: new Date('2026-10-26') } });
      assert.equal((await f.send(f.event('68.90'))).reason, 'MONEY_BEFORE_REFERENCE');
    });
    await t.test('horas distintas permiten compras iguales y misma hora conserva duplicidad', async () => {
      const f = await fixture(), first = await f.send(), second = await f.send(f.event('67.89', '23:42'));
      assert.equal(second.reason, 'BBVA_DEBIT_AUTOMATIC'); assert.notEqual(second.expenseId, first.expenseId);
      assert.equal((await f.send(f.event('67.89', '23:42'))).reason, 'MONEY_POSSIBLE_DUPLICATE');
      const original = f.event('68.90', '23:43'); await f.send(original);
      const revised = { ...original, eventId: randomUUID(), fields: { ...original.fields, 'android.text': original.fields['android.text']!.replace('68.90', '69.90') } };
      assert.equal((await f.send(revised)).reason, 'NOTIFICATION_REVISION');
      assert.equal(await db.dailyExpense.count({ where: { userId: f.user.id } }), 3);
    });
    await t.test('un gasto manual o un gasto eliminado mantiene la protección contra repetición', async () => {
      const f = await fixture(), first = await f.send();
      await db.dailyExpense.delete({ where: { id: present(first.expenseId) } });
      assert.equal((await f.send()).reason, 'MONEY_POSSIBLE_DUPLICATE');
      const category = await db.category.findFirstOrThrow({ where: { userId: f.user.id } });
      await db.dailyExpense.create({ data: { userId: f.user.id, date: new Date('2026-10-25'), amount: '68.90', concept: 'Compra manual ficticia', paymentMethod: 'DEBIT', debitAccountId: f.bank.id, categoryId: category.id } });
      assert.equal((await f.send(f.event('68.90', '23:42'))).reason, 'MONEY_POSSIBLE_DUPLICATE');
    });
    await t.test('un fallo al guardar la evidencia revierte el gasto y toda la recepción', async () => {
      const f = await fixture(), input = f.event();
      const broken = faultingTransactions(db, { before(model, method) { if (model === 'captureMoneyPosting' && method === 'create') throw new Error('Fallo ficticio'); } }, false);
      await assert.rejects(withFixtureDb(service.receiveCaptureEvent, broken, f.credential, input), /Fallo ficticio/);
      assert.equal(await db.dailyExpense.count({ where: { userId: f.user.id } }), 0); assert.equal(await db.captureEvent.count({ where: { userId: f.user.id } }), 0);
    });
    await t.test('reinterpretar un aviso histórico conserva el original y requiere registro expreso', async () => {
      const f = await fixture(), input = f.event();
      const old = await db.captureMovement.create({ data: { userId: f.user.id, parserKey: 'bbva.debit-card-charge.es.v1', reason: 'INCOMPLETE_FORMAT', proposal: {} } });
      const event = await db.captureEvent.create({ data: { userId: f.user.id, deviceId: f.device.id, eventId: input.eventId, contractVersion: 1, sourcePackage: input.sourcePackage, notificationKeyHash: input.notificationKeyHash, postedAt: new Date(input.postedAt), receivedAt: new Date(input.receivedAt), fields: input.fields, requestHash: protocol.captureHash(randomUUID()), movementId: old.id, interpretation: { reason: old.reason, proposal: {} } } });
      const row = present(await processing.resolveCaptureMovement(db, f.user.id, { id: old.id, action: 'reinterpret' }));
      assert.equal(row.parserKey, 'bbva.debit-purchase.es.v1'); assert.equal(row.reason, 'MONEY_OBSERVATION'); assert.equal(row.expenseId, null);
      const args = { id: old.id, action: 'registerDebitExpense' as const, money: { fromAccountId: f.bank.id, amount: '67.89', date: '2026-10-25', concept: 'MERPAGO*TIENDA FICTICIA', currency: 'MXN' as const } };
      await processing.resolveCaptureMovement(db, f.user.id, args); await processing.resolveCaptureMovement(db, f.user.id, args);
      assert.equal(await db.dailyExpense.count({ where: { userId: f.user.id } }), 1);
      assert.deepEqual((await db.captureEvent.findUniqueOrThrow({ where: { id: event.id } })).interpretation, plain(event.interpretation));
      await assert.rejects(processing.resolveCaptureMovement(db, f.user.id, { id: old.id, action: 'reinterpret' }));
    });
  } finally { await db.user.deleteMany({ where: { id: { in: owners } } }); await db.$disconnect(); }
});
