import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { fixtureDatabase } from './helpers/fixture-database';
import { integrationLoader, withFixtureDb } from './helpers/integration-fixtures';
import { plain, present, sparseCalculations } from './helpers/financial-fixtures';
import { faultingTransactions } from './helpers/financial-persistence';
import { getCyclePaymentAmounts } from '../src/lib/calculations/cardCyclePayments';

const connectionString = process.env.AFP_TEST_DATABASE_URL;

test('BBVA: pagos por saldo pendiente, diferencia máxima de $1 y vencimiento ±1 día', { skip: !connectionString }, async t => {
  const db = await fixtureDatabase(present(connectionString));
  const load = integrationLoader({ '@/lib/prisma': { prisma: db }, '@/lib/calendar/schedule': { scheduleCalendarSync() {} } });
  const protocol = sparseCalculations(load('src/lib/captureProtocol.ts'));
  const service = load('src/lib/captureService.ts'), configuration = load('src/lib/captureConfiguration.ts');
  const money = load('src/lib/money/service.ts'), sources = load('src/lib/money/sources.ts');
  const inbox = load('src/lib/captureInbox.ts');
  const owners: string[] = [];
  async function fixture(options: { statementAmount?: string | null; paidAmount?: string; credit?: string; mode?: string; cutDate?: string } = {}) {
    const user = await db.user.create({ data: { email: `bbva-payment-match-${randomUUID()}@example.test` } }); owners.push(user.id);
    const account = await db.moneyAccount.create({ data: { userId: user.id, name: 'Cuenta origen ficticia', kind: 'BANK', openingBalance: 10000, asOf: new Date('2026-10-20'), baseline: {} } });
    const card = await db.card.create({ data: { userId: user.id, name: 'Tarjeta ficticia', usualCutDay: 5, usualDueDay: 25 } });
    const cycle = await db.cardCycle.create({ data: { userId: user.id, cardId: card.id, year: 2026, month: 10,
      startDate: new Date('2026-09-06'), cutDate: new Date(options.cutDate || '2026-10-05'), dueDate: new Date('2026-10-25T12:00:00Z'),
      statementAmount: options.statementAmount === undefined ? '741.25' : options.statementAmount,
      paidAmount: options.paidAmount, postCutCreditAmount: options.credit || '0' } });
    const device = await db.captureDevice.create({ data: { userId: user.id, name: 'Teléfono ficticio', approvedAt: new Date(), secretHash: protocol.captureHash(randomBytes(32).toString('hex')) } });
    const credential = { id: device.id, secretHash: device.secretHash };
    await configuration.configureCapture(db, user.id, { action: 'moneyPolicy', kind: 'BBVA_DEBIT', fromAccountId: account.id,
      accountSuffixes: ['0123'], treatAsExpense: true, currency: 'MXN', datePolicy: 'NOTIFICATION_POSTED_AT', mode: options.mode || 'AUTOMATIC' });
    const event = (amount = '741.25', postedAt = '2026-10-25T18:00:00Z', suffix = '0123') => protocol.validateCaptureEvent({
      contractVersion: 1 as const, eventId: randomUUID(), sourcePackage: 'com.bancomer.mbanking', notificationKeyHash: protocol.captureHash(randomUUID()),
      postedAt, receivedAt: new Date(Date.parse(postedAt) + 1000).toISOString(),
      fields: { 'android.title': 'Aviso de cargo en tu cuenta', 'android.text': `Cargo a tu cuenta *${suffix} de $${amount}` },
    });
    const send = async (input = event()) => {
      await service.receiveCaptureEvent(db, credential, input);
      return present(present(await db.captureEvent.findUnique({ where: { deviceId_eventId: { deviceId: device.id, eventId: input.eventId } }, include: { movement: true } })).movement);
    };
    const balance = async () => {
      const data = await money.loadMoneyData(db, user.id);
      return Number(present(sources.accountBalances(data.accounts, sources.buildSources(data, '2026-10-29').events, '2026-10-29').find(row => row.id === account.id)).balance);
    };
    return { user, account, card, cycle, credential, event, send, balance };
  }
  try {
    await t.test('pago tardío: prioriza el abono, conserva el aviso y descuenta una sola vez de la cuenta', async () => {
      const f = await fixture(), input = f.event('741.25', '2026-10-26T18:00:00Z'), movement = await f.send(input);
      assert.equal(movement.reason, 'BBVA_PAYMENT_MATCHED'); assert.equal(movement.cardId, f.card.id); assert.equal(movement.expenseId, null);
      assert.equal(inbox.captureMovementKind(movement), 'PAYMENT');
      const payment = present(await db.moneyCardPayment.findFirst({ where: { cycleId: f.cycle.id } }));
      assert.equal(String(payment.amount), '741.25'); assert.equal(payment.date.toISOString().slice(0, 10), '2026-10-26');
      assert.equal(present(await db.cardCycle.findUnique({ where: { id: f.cycle.id } })).status, 'PAID');
      assert.equal(await db.dailyExpense.count({ where: { userId: f.user.id } }), 0); assert.equal(await f.balance(), 9258.75);
      const posting = present(await db.captureMoneyPosting.findUnique({ where: { movementId: movement.id } }));
      assert.equal(posting.kind, 'CARD_PAYMENT'); assert.equal(posting.cardPaymentId, payment.id);
      const stored = present(await db.captureEvent.findUnique({ where: { deviceId_eventId: { deviceId: f.credential.id, eventId: input.eventId } } }));
      assert.deepEqual(stored.fields, plain(input.fields));
      assert.equal(await db.captureMovement.count({ where: { userId: f.user.id, ...inbox.captureKindWhere('PAYMENT') } }), 1);
    });
    await t.test('admite un día antes, el día de vencimiento y un día después', async () => {
      for (const date of ['24', '25', '26']) {
        const f = await fixture(), row = await f.send(f.event('741.25', `2026-10-${date}T18:00:00Z`));
        assert.equal(row.reason, 'BBVA_PAYMENT_MATCHED');
      }
    });
    await t.test('fuera del margen de días conserva el gasto genérico', async () => {
      for (const date of ['23', '27']) {
        const f = await fixture(), row = await f.send(f.event('741.25', `2026-10-${date}T18:00:00Z`));
        assert.equal(row.reason, 'BBVA_DEBIT_AUTOMATIC'); assert.ok(row.expenseId);
        assert.equal(await db.moneyCardPayment.count({ where: { userId: f.user.id } }), 0);
      }
    });
    await t.test('diferencia de $1 exacto: registra el importe real, pendiente o excedente sin redondearlo al estado', async () => {
      for (const [amount, pending, excess] of [['740.25', 1, 0], ['742.25', 0, 1]] as const) {
        const f = await fixture(), row = await f.send(f.event(amount)); assert.equal(row.reason, 'BBVA_PAYMENT_MATCHED');
        const cycle = present(await db.cardCycle.findUnique({ where: { id: f.cycle.id } }));
        assert.equal(String(cycle.paidAmount), amount); assert.equal(getCyclePaymentAmounts(cycle).pendingAmount, pending);
        assert.equal(getCyclePaymentAmounts(cycle).excessAmount, excess); assert.equal(await f.balance(), 10000 - Number(amount));
      }
    });
    await t.test('una diferencia de $1.01 no identifica un pago', async () => {
      for (const amount of ['740.24', '742.26']) {
        const f = await fixture(); assert.equal((await f.send(f.event(amount))).reason, 'BBVA_DEBIT_AUTOMATIC');
      }
    });
    await t.test('compara el pendiente después de abonos parciales y devoluciones aplicadas al corte', async () => {
      const f = await fixture({ statementAmount: '1000', paidAmount: '100', credit: '158.75' });
      assert.equal((await f.send()).reason, 'BBVA_PAYMENT_MATCHED');
      const cycle = present(await db.cardCycle.findUnique({ where: { id: f.cycle.id } }));
      assert.equal(String(cycle.paidAmount), '841.25'); assert.equal(getCyclePaymentAmounts(cycle).pendingAmount, 0);
    });
    await t.test('dos tarjetas compatibles quedan por revisar, aunque una coincida exactamente', async () => {
      const f = await fixture(), card = await db.card.create({ data: { userId: f.user.id, name: 'Segunda tarjeta ficticia', usualCutDay: 5, usualDueDay: 25 } });
      await db.cardCycle.create({ data: { userId: f.user.id, cardId: card.id, year: 2026, month: 10, startDate: f.cycle.startDate, cutDate: f.cycle.cutDate, dueDate: f.cycle.dueDate, statementAmount: '742' } });
      const row = await f.send(); assert.equal(row.reason, 'BBVA_PAYMENT_MATCH_AMBIGUOUS'); assert.equal(row.status, 'REVIEW');
      assert.equal(inbox.captureMovementKind(row), 'MONEY');
      assert.equal(await db.captureMovement.count({ where: { userId: f.user.id, ...inbox.captureKindWhere('PENDING') } }), 1);
      assert.equal(await db.captureMovement.count({ where: { userId: f.user.id, ...inbox.captureKindWhere('OTHER') } }), 0);
      assert.equal(await db.dailyExpense.count({ where: { userId: f.user.id } }), 0); assert.equal(await f.balance(), 10000);
      assert.equal(await db.moneyCardPayment.count({ where: { userId: f.user.id } }), 0);
    });
    await t.test('ignora cortes liquidados, sin estado capturado o todavía abiertos', async () => {
      for (const options of [{ paidAmount: '741.25' }, { statementAmount: null }, { cutDate: '2026-10-26' }]) {
        const f = await fixture(options); assert.equal((await f.send()).reason, 'BBVA_DEBIT_AUTOMATIC');
      }
    });
    await t.test('el estado PAID guardado no sustituye la comprobación del saldo pendiente', async () => {
      const f = await fixture(); await db.cardCycle.update({ where: { id: f.cycle.id }, data: { status: 'PAID' } });
      assert.equal((await f.send()).reason, 'BBVA_PAYMENT_MATCHED');
    });
    await t.test('la tarjeta de otro propietario no interviene en la coincidencia', async () => {
      const f = await fixture(), foreign = await fixture(); const row = await f.send();
      assert.equal(row.cardId, f.card.id); assert.equal(present(await db.cardCycle.findUnique({ where: { id: foreign.cycle.id } })).paidAmount, null);
    });
    await t.test('regla pausada o terminación desconocida no habilitan pagos', async () => {
      const paused = await fixture({ mode: 'OBSERVATION' }), unknown = await fixture();
      assert.equal((await paused.send()).reason, 'MONEY_OBSERVATION');
      assert.equal((await unknown.send(unknown.event('741.25', undefined, '9999'))).reason, 'ACCOUNT_DEBIT_REVIEW');
      for (const f of [paused, unknown]) assert.equal(await db.moneyCardPayment.count({ where: { userId: f.user.id } }), 0);
    });
    await t.test('usa el día del aviso en México y el día bancario UTC del vencimiento', async () => {
      const f = await fixture(); await db.cardCycle.update({ where: { id: f.cycle.id }, data: { dueDate: new Date('2026-10-23T23:59:59.999Z') } });
      const row = await f.send(f.event('741.25', '2026-10-25T05:59:59Z')); assert.equal(row.reason, 'BBVA_PAYMENT_MATCHED');
      assert.equal(present(await db.moneyCardPayment.findFirst({ where: { userId: f.user.id } })).date.toISOString().slice(0, 10), '2026-10-24');
    });
    await t.test('entregas concurrentes, respuesta repetida y otro UUID no duplican el pago ni crean un gasto', async () => {
      const f = await fixture(), event = f.event();
      const rows = await Promise.all(Array.from({ length: 6 }, () => f.send(event)));
      assert.ok(rows.every(row => row.id === rows[0]!.id));
      assert.equal((await f.send({ ...event, eventId: randomUUID() })).id, rows[0]!.id);
      assert.equal((await f.send()).reason, 'MONEY_POSSIBLE_DUPLICATE');
      assert.equal(await db.moneyCardPayment.count({ where: { userId: f.user.id } }), 1);
      assert.equal(await db.dailyExpense.count({ where: { userId: f.user.id } }), 0); assert.equal(await f.balance(), 9258.75);
    });
    await t.test('un fallo al guardar la evidencia revierte el abono, la cuenta y la recepción completa', async () => {
      const f = await fixture(), event = f.event();
      const broken = faultingTransactions(db, { before(model, method) { if (model === 'captureMoneyPosting' && method === 'create') throw new Error('Fallo ficticio'); } }, false);
      await assert.rejects(withFixtureDb(service.receiveCaptureEvent, broken, f.credential, event), /Fallo ficticio/);
      assert.equal(present(await db.cardCycle.findUnique({ where: { id: f.cycle.id } })).paidAmount, null);
      assert.equal(await db.moneyCardPayment.count({ where: { userId: f.user.id } }), 0);
      assert.equal(await db.captureEvent.count({ where: { userId: f.user.id } }), 0); assert.equal(await f.balance(), 10000);
    });
    await t.test('la API manual no permite excedentes por añadir la opción interna al cuerpo', async () => {
      const f = await fixture();
      await assert.rejects(money.mutateMoney(db, f.user.id, { action: 'CARD_PAYMENT', operationId: randomUUID(), accountId: f.account.id,
        cycleId: f.cycle.id, amount: '742.25', date: '2026-10-25', matchedPaymentOverage: true }));
      assert.equal(await db.moneyCardPayment.count({ where: { userId: f.user.id } }), 0); assert.equal(await f.balance(), 10000);
    });
    await t.test('revertir el pago restaura el saldo y el recibo anterior no vuelve a aplicarlo', async () => {
      const f = await fixture(), event = f.event(), row = await f.send(event);
      const posting = present(await db.captureMoneyPosting.findUnique({ where: { movementId: row.id } }));
      await money.mutateMoney(db, f.user.id, { action: 'REVERSE_PAYMENT', operationId: randomUUID(), id: present(posting.cardPaymentId) });
      await f.send(event); assert.equal(await f.balance(), 10000);
      assert.equal(getCyclePaymentAmounts(present(await db.cardCycle.findUnique({ where: { id: f.cycle.id } }))).pendingAmount, 741.25);
    });
  } finally { await db.user.deleteMany({ where: { id: { in: owners } } }); await db.$disconnect(); }
});
