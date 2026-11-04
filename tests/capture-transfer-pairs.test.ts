import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { fixtureConnection, fixtureDatabase } from './helpers/fixture-database';
import { integrationLoader } from './helpers/integration-fixtures';
import { present } from './helpers/financial-fixtures';

const loadParsers = integrationLoader(), parsers = loadParsers('src/lib/captureParsers.ts');
const receipt = (body = 'Recibiste $845.30 en tu Cuenta Nu.', fields = {}) => ({ sourcePackage: 'com.nu.production',
  postedAt: '2026-10-26T18:00:00Z', receivedAt: '2026-10-26T18:01:00Z',
  fields: { 'android.title': '¡Recibiste una transferencia!', 'android.text': body, ...fields } });
test('recepción Nu: gramática real anonimizada, sin inventar remitente ni ingreso', () => {
  const decoded = parsers.interpretCapture(receipt());
  assert.equal(decoded.parserKey, 'nu.account-received.es.v1');
  assert.equal(decoded.reason, 'TRANSFER_PAIR_REQUIRED');
  assert.equal(decoded.proposal.amount, '845.30');
  assert.equal(decoded.proposal.date, '2026-10-26');
  assert.equal(decoded.proposal.movementType, 'TRANSFER_RECEIPT');
  assert.equal(decoded.proposal.fromAccountId, undefined);
  for (const body of ['Recibiste $0.00 en tu Cuenta Nu.', 'Recibiste $1,23.00 en tu Cuenta Nu.', 'Recibiste $845.30 USD en tu Cuenta Nu.', 'Recibiste $845.30 en tu Cuenta Nu. Cancelada.', 'Recibiste $845.30 en tu Cuenta Nu.\nOtro aviso']) {
    assert.equal(parsers.interpretCapture(receipt(body)).reason, 'INCOMPLETE_FORMAT', body);
  }
  assert.equal(parsers.interpretCapture(receipt(undefined, { 'android.bigText': 'Recibiste $123.00 en tu Cuenta Nu.' })).reason, 'CONFLICTING_FIELDS');
  assert.equal(parsers.interpretCapture({ ...receipt(), sourcePackage: 'com.example.untrusted' }).parserKey, undefined);
});

const connectionString = process.env.AFP_TEST_DATABASE_URL;
test('transferencias BBVA → Nu: evidencias, concurrencia, reemplazo y protecciones', { skip: !connectionString }, async t => {
  const db = await fixtureDatabase(fixtureConnection(connectionString));
  const user = await db.user.create({ data: { email: `transfer-pair-${randomUUID()}@example.test` } });
  const other = await db.user.create({ data: { email: `transfer-pair-other-${randomUUID()}@example.test` } });
  const load = integrationLoader({ '@/lib/prisma': { prisma: db }, '@/lib/calendar/schedule': { scheduleCalendarSync() {} } });
  const protocol = load('src/lib/captureProtocol.ts'), service = load('src/lib/captureService.ts'), processing = load('src/lib/captureProcessing.ts');
  const configuration = load('src/lib/captureConfiguration.ts'), money = load('src/lib/money/service.ts'), sources = load('src/lib/money/sources.ts');
  const account = (userId: string, name: string) => db.moneyAccount.create({ data: { userId, name, kind: 'BANK', openingBalance: 10000, asOf: new Date('2026-10-24'), baseline: {} } });
  const bbva = await account(user.id, 'Banco salida QA'), nu = await account(user.id, 'Cuenta destino QA'), foreign = await account(other.id, 'Ajena QA');
  await db.moneyAccount.update({ where: { id: nu.id }, data: { kind: 'SAVINGS' } });
  const device = await db.captureDevice.create({ data: { userId: user.id, name: 'Teléfono ficticio', approvedAt: new Date(), secretHash: protocol.captureHash(randomUUID()) } });
  const credential = { id: device.id, secretHash: device.secretHash };
  const rule = { action: 'moneyPolicy', kind: 'BBVA_NU_TRANSFER', fromAccountId: bbva.id, toAccountId: nu.id,
    accountSuffixes: ['0123', '00123'], pairByAmountAndTime: true, currency: 'MXN', datePolicy: 'NOTIFICATION_POSTED_AT', mode: 'AUTOMATIC' };
  const activate = async (extra = {}) => {
    const policy = await configuration.configureCapture(db, user.id, { ...rule, ...extra });
    await db.captureMoneyPolicy.updateMany({ where: { userId: user.id, kind: 'BBVA_NU_TRANSFER' }, data: { acceptedAt: new Date('2026-10-24') } });
    return policy;
  };
  const notice = (incoming: boolean, amount: string, time = '2026-10-26T18:00:00Z', suffix = '0123') => protocol.validateCaptureEvent({
    contractVersion: 1, eventId: randomUUID(), sourcePackage: incoming ? 'com.nu.production' : 'com.bancomer.mbanking',
    postedAt: time, receivedAt: '2026-10-27T12:00:00Z', notificationKeyHash: protocol.captureHash(randomUUID()),
    fields: incoming ? receipt(`Recibiste $${amount} en tu Cuenta Nu.`).fields : { 'android.title': 'Aviso de cargo en tu cuenta',
      'android.text': `Cargo a tu cuenta *${suffix} de $${amount} ` },
  });
  const send = async (event: ReturnType<typeof notice>) => {
    await service.receiveCaptureEvent(db, credential, event);
    return present((await db.captureEvent.findUniqueOrThrow({ where: { deviceId_eventId: { deviceId: device.id, eventId: event.eventId } }, include: { movement: true } })).movement);
  };
  const transfers = (amount: string) => db.moneyTransfer.count({ where: { userId: user.id, amount } });
  try {
    await t.test('sin regla no se acredita; aceptación explícita y cuentas propias', async () => {
      assert.equal((await send(notice(true, '101.00'))).reason, 'TRANSFER_PAIR_REQUIRED');
      assert.equal(await transfers('101.00'), 0);
      await assert.rejects(activate({ pairByAmountAndTime: undefined }));
      await assert.rejects(activate({ toAccountId: foreign.id }));
      await assert.rejects(activate({ toAccountId: bbva.id }));
      await assert.rejects(activate({ accountSuffixes: [] }));
      await activate();
      // Activating a rule never processes historical notices.
      assert.equal(await transfers('101.00'), 0);
    });
    await t.test('entrada primero: una transferencia, dos recibos y saldos conservados', async () => {
      const incoming = await send(notice(true, '102.00'));
      assert.equal(incoming.reason, 'TRANSFER_PAIR_WAITING');
      const debit = await send(notice(false, '102.00', '2026-10-26T18:00:23Z'));
      assert.equal(debit.reason, 'TRANSFER_PAIR_REGISTERED');
      const rows = await db.captureMoneyPosting.findMany({ where: { userId: user.id, movementId: { in: [debit.id, incoming.id] } } });
      assert.equal(rows.length, 2); assert.equal(rows[0]!.transferId, rows[1]!.transferId);
      assert.equal(await transfers('102.00'), 1);
      assert.equal(await db.dailyExpense.count({ where: { userId: user.id } }), 0);
      assert.equal(await db.income.count({ where: { userId: user.id } }), 0);
      const data = await money.loadMoneyData(db, user.id), balances = sources.accountBalances(data.accounts, sources.buildSources(data, '2026-10-27').events, '2026-10-27');
      assert.equal(Number(present(balances.find(a => a.id === bbva.id)).balance), 9898);
      assert.equal(Number(present(balances.find(a => a.id === nu.id)).balance), 10102);
      const original = await db.captureEvent.findFirstOrThrow({ where: { movementId: incoming.id } });
      assert.equal(original.interpretation && JSON.stringify(original.interpretation).includes('TRANSFER_PAIR_REQUIRED'), true);
    });
    await t.test('acepta Nu como cuenta de ahorro y rechaza efectivo como destino', async () => {
      assert.equal((await db.moneyAccount.findUniqueOrThrow({ where: { id: nu.id } })).kind, 'SAVINGS');
      const cash = await db.moneyAccount.create({ data: { userId: user.id, name: 'Efectivo QA', kind: 'CASH', openingBalance: 0, asOf: new Date('2026-10-24'), baseline: {} } });
      await assert.rejects(activate({ toAccountId: cash.id }));
      assert.equal((await db.captureMoneyPolicy.findUniqueOrThrow({ where: { userId_kind_destinationLabel: { userId: user.id, kind: 'BBVA_NU_TRANSFER', destinationLabel: '' } } })).toAccountId, nu.id);
    });
    await t.test('cargo primero: sustituye gasto genérico sin descontar dos veces', async () => {
      await configuration.configureCapture(db, user.id, { action: 'moneyPolicy', kind: 'BBVA_DEBIT', fromAccountId: bbva.id, accountSuffixes: ['0123', '00123'], treatAsExpense: true, currency: 'MXN', datePolicy: 'NOTIFICATION_POSTED_AT', mode: 'AUTOMATIC' });
      const debit = await send(notice(false, '103.00'));
      assert.equal(debit.reason, 'BBVA_DEBIT_AUTOMATIC');
      const expenseId = present(debit.expenseId);
      assert.equal((await send(notice(true, '103.00', '2026-10-26T18:00:23Z'))).reason, 'TRANSFER_PAIR_REGISTERED');
      assert.equal(await db.dailyExpense.findUnique({ where: { id: expenseId } }), null);
      assert.equal(await db.expenseTombstone.count({ where: { expenseId } }), 1);
      const resolved = await db.captureMovement.findUniqueOrThrow({ where: { id: debit.id } });
      assert.equal(resolved.originalExpenseId, expenseId); assert.equal(resolved.expenseId, null);
      assert.equal(await transfers('103.00'), 1);
      const data = await money.loadMoneyData(db, user.id), balances = sources.accountBalances(data.accounts, sources.buildSources(data, '2026-10-27').events, '2026-10-27');
      assert.equal(Number(present(balances.find(a => a.id === bbva.id)).balance), 9795);
      assert.equal(Number(present(balances.find(a => a.id === nu.id)).balance), 10205);
    });
    await t.test('reintentos y recepción simultánea aplican una sola vez', async () => {
      const debit = notice(false, '104.00'), incoming = notice(true, '104.00', '2026-10-26T18:00:20Z');
      await Promise.all([send(debit), send(incoming), send(debit), send(incoming)]);
      assert.equal(await transfers('104.00'), 1);
      const original = await send(incoming), repeated = await send({ ...incoming, eventId: randomUUID() });
      assert.equal(repeated.id, original.id);
      assert.equal(await transfers('104.00'), 1);
      assert.equal(await db.dailyExpense.count({ where: { userId: user.id, amount: '104.00' } }), 0);
    });
    await t.test('importe, terminación y ventana temporal deben coincidir exactamente', async () => {
      await send(notice(false, '105.00'));
      assert.equal((await send(notice(true, '105.00', '2026-10-26T18:05:01Z'))).reason, 'TRANSFER_PAIR_WAITING');
      await send(notice(false, '106.00', undefined, '1123'));
      assert.equal((await send(notice(true, '106.00'))).reason, 'TRANSFER_PAIR_WAITING');
      assert.equal((await send(notice(true, '105.01'))).reason, 'TRANSFER_PAIR_WAITING');
      assert.equal(await transfers('105.00'), 0); assert.equal(await transfers('106.00'), 0);
    });
    await t.test('varios avisos y comprobación recíproca impiden adivinar el destino', async () => {
      await send(notice(true, '107.00')); await send(notice(true, '107.00', '2026-10-26T18:00:15Z'));
      assert.equal((await send(notice(false, '107.00'))).reason, 'TRANSFER_PAIR_AMBIGUOUS');
      await send(notice(false, '108.00', '2026-10-26T18:00:00Z'));
      await send(notice(false, '108.00', '2026-10-26T18:08:00Z'));
      assert.equal((await send(notice(true, '108.00', '2026-10-26T18:04:00Z'))).reason, 'TRANSFER_PAIR_AMBIGUOUS');
      assert.equal(await transfers('107.00'), 0); assert.equal(await transfers('108.00'), 0);
    });
    for (const [index, change] of [
      { notes: 'Clasificación personal' }, { concept: 'Compra identificada' }, { amount: '9999.00' },
      { date: new Date('2026-10-25') }, { reconciledAt: new Date() },
    ].entries()) await t.test(`conserva gasto editado o conciliado: ${Object.keys(change)[0]}`, async () => {
      const amount = `${120 + index}.00`, debit = await send(notice(false, amount)), expenseId = present(debit.expenseId);
      await db.dailyExpense.update({ where: { id: expenseId }, data: change });
      assert.equal((await send(notice(true, amount))).reason, 'TRANSFER_PAIR_PROTECTED');
      assert.equal(await transfers(amount), 0);
      assert.ok(await db.dailyExpense.findUnique({ where: { id: expenseId } }));
    });
    await t.test('gasto eliminado no se recrea ni se convierte', async () => {
      const debit = await send(notice(false, '130.00'));
      await db.dailyExpense.delete({ where: { id: present(debit.expenseId) } });
      assert.equal((await send(notice(true, '130.00'))).reason, 'TRANSFER_PAIR_PROTECTED');
      assert.equal(await transfers('130.00'), 0);
    });
    await t.test('conserva clasificación y vínculos personales', async () => {
      const category = await db.category.create({ data: { userId: user.id, name: 'Clasificada QA' } });
      const person = await db.person.create({ data: { userId: user.id, name: 'Persona QA' } });
      for (const [amount, change] of [['140.00', { categoryId: category.id }], ['141.00', { personId: person.id }]] as const) {
        const debit = await send(notice(false, amount));
        await db.dailyExpense.update({ where: { id: present(debit.expenseId) }, data: change });
        assert.equal((await send(notice(true, amount))).reason, 'TRANSFER_PAIR_PROTECTED');
        assert.equal(await transfers(amount), 0);
      }
    });
    await t.test('un ingreso manual cercano bloquea una nueva acreditación', async () => {
      const type = await db.incomeType.create({ data: { userId: user.id, name: 'Ingreso QA' } });
      await db.income.create({ data: { userId: user.id, incomeTypeId: type.id, amount: '142.00', date: new Date('2026-10-26'), concept: 'Capturado a mano QA', source: 'QA' } });
      await send(notice(true, '142.00'));
      assert.equal((await send(notice(false, '142.00'))).reason, 'MONEY_POSSIBLE_DUPLICATE');
      assert.equal(await transfers('142.00'), 0);
    });
    await t.test('avisos de otro propietario no se usan como evidencia', async () => {
      const otherDevice = await db.captureDevice.create({ data: { userId: other.id, name: 'Otro teléfono QA', approvedAt: new Date(), secretHash: protocol.captureHash(randomUUID()) } });
      await service.receiveCaptureEvent(db, { id: otherDevice.id, secretHash: otherDevice.secretHash }, notice(true, '143.00'));
      const debit = await send(notice(false, '143.00'));
      assert.equal(debit.reason, 'BBVA_DEBIT_AUTOMATIC');
      assert.equal(await transfers('143.00'), 0);
      assert.equal(await db.moneyTransfer.count({ where: { userId: other.id } }), 0);
    });
    await t.test('la BD mantiene las restricciones y RLS de la regla', async () => {
      await assert.rejects(db.captureMoneyPolicy.updateMany({ where: { userId: user.id, kind: 'BBVA_NU_TRANSFER' }, data: { accountSuffixes: [] } }));
      await assert.rejects(db.captureMoneyPolicy.updateMany({ where: { userId: user.id, kind: 'BBVA_NU_TRANSFER' }, data: { toAccountId: bbva.id } }));
      const tables = await db.$queryRaw<Array<{ relrowsecurity: boolean }>>`SELECT relrowsecurity FROM pg_class WHERE oid='public.capture_money_policies'::regclass`;
      assert.equal(tables[0]?.relrowsecurity, true);
    });
    await t.test('registros manuales y transferencias revertidas bloquean duplicados', async () => {
      const record = await db.moneyTransfer.create({ data: { userId: user.id, fromAccountId: bbva.id, toAccountId: nu.id, amount: '131.00', date: new Date('2026-10-26'), concept: 'Manual QA', reversedAt: new Date() } });
      await send(notice(true, '131.00'));
      assert.equal((await send(notice(false, '131.00'))).reason, 'MONEY_POSSIBLE_DUPLICATE');
      assert.equal(await transfers('131.00'), 1); assert.equal((await db.moneyTransfer.findUniqueOrThrow({ where: { id: record.id } })).reversedAt?.toISOString(), record.reversedAt?.toISOString());
    });
    await t.test('regla pausada, avisos anteriores y reinterpretación no escriben dinero', async () => {
      await activate({ mode: 'OBSERVATION' });
      await send(notice(true, '132.00')); await send(notice(false, '132.00'));
      assert.equal(await transfers('132.00'), 0);
      await activate();
      await db.captureMoneyPolicy.updateMany({ where: { userId: user.id, kind: 'BBVA_NU_TRANSFER' }, data: { acceptedAt: new Date('2026-10-27') } });
      const incoming = await send(notice(true, '133.00')); await send(notice(false, '133.00'));
      assert.equal(await transfers('133.00'), 0);
      await activate();
      await processing.resolveCaptureMovement(db, user.id, { action: 'reinterpret', id: incoming.id });
      assert.equal(await transfers('133.00'), 0);
    });
    await t.test('cruce de medianoche usa fecha del cargo y respeta referencia de ambas cuentas', async () => {
      await send(notice(true, '134.00', '2026-10-27T06:00:10Z'));
      const row = await send(notice(false, '134.00', '2026-10-27T05:59:50Z', '00123'));
      assert.equal(row.reason, 'TRANSFER_PAIR_REGISTERED');
      assert.equal((await db.moneyTransfer.findFirstOrThrow({ where: { userId: user.id, amount: '134.00' } })).date.toISOString().slice(0, 10), '2026-10-26');
      await db.moneyAccount.update({ where: { id: nu.id }, data: { asOf: new Date('2026-10-27') } });
      await send(notice(true, '135.00'));
      assert.equal((await send(notice(false, '135.00'))).reason, 'MONEY_BEFORE_REFERENCE');
      assert.equal(await transfers('135.00'), 0);
      await db.moneyAccount.update({ where: { id: nu.id }, data: { asOf: new Date('2026-10-24') } });
    });
    await t.test('un fallo revierte transferencia, recibos y eliminación del gasto juntos', async () => {
      const debit = await send(notice(false, '136.00')), input = notice(true, '136.00');
      await assert.rejects(db.$transaction(async tx => {
        const event = await tx.captureEvent.create({ data: { userId: user.id, deviceId: device.id, eventId: input.eventId,
          contractVersion: 1, sourcePackage: input.sourcePackage, notificationKeyHash: input.notificationKeyHash,
          postedAt: new Date(input.postedAt), receivedAt: new Date(input.receivedAt), fields: input.fields, requestHash: protocol.captureHash(randomUUID()) } });
        await processing.processCaptureEvent(tx, event);
        assert.equal(await tx.moneyTransfer.count({ where: { userId: user.id, amount: '136.00' } }), 1);
        throw new Error('Fallo simulado tras los recibos');
      }, { timeout: 15000 }));
      assert.equal(await transfers('136.00'), 0);
      assert.ok(await db.dailyExpense.findUnique({ where: { id: present(debit.expenseId) } }));
      assert.equal(await db.captureEvent.count({ where: { eventId: input.eventId } }), 0);
    });
  } finally {
    for (const userId of [user.id, other.id]) {
      await db.captureMoneyPosting.deleteMany({ where: { userId } });
      await db.moneyTransfer.deleteMany({ where: { userId } });
      await db.user.delete({ where: { id: userId } });
    }
    await db.$disconnect();
  }
});
