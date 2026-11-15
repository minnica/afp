import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { fixtureDatabase } from './helpers/fixture-database';
import { integrationLoader, withFixtureDb } from './helpers/integration-fixtures';
import { plain, present } from './helpers/financial-fixtures';
import { faultingTransactions } from './helpers/financial-persistence';
import { loadMoneyData } from '../src/lib/money/data';
import { accountBalances, buildSources } from '../src/lib/money/sources';

test('Nu: transferencias iguales en días distintos y protección de evidencias', { skip: !process.env.AFP_TEST_DATABASE_URL }, async t => {
  const db = await fixtureDatabase(present(process.env.AFP_TEST_DATABASE_URL));
  const load = integrationLoader({ '@/lib/prisma': { prisma: db }, '@/lib/calendar/schedule': { scheduleCalendarSync() {} } });
  const protocol = load('src/lib/captureProtocol.ts'), service = load('src/lib/captureService.ts');
  const config = load('src/lib/captureConfiguration.ts'), processing = load('src/lib/captureProcessing.ts');
  const owners: string[] = [];
  async function fixture() {
    const user = await db.user.create({ data: { email: `nu-transfer-${randomUUID()}@example.test` } }); owners.push(user.id);
    const from = await db.moneyAccount.create({ data: { userId: user.id, name: 'Ahorro ficticio', kind: 'SAVINGS', openingBalance: 1000, asOf: new Date('2026-10-01'), baseline: {} } });
    const to = await db.moneyAccount.create({ data: { userId: user.id, name: 'Banco ficticio', kind: 'BANK', openingBalance: 1000, asOf: new Date('2026-10-01'), baseline: {} } });
    const device = await db.captureDevice.create({ data: { userId: user.id, name: 'Teléfono ficticio', approvedAt: new Date(), secretHash: protocol.captureHash(randomBytes(32).toString('hex')) } });
    const credential = { id: device.id, secretHash: device.secretHash };
    const policy = { action: 'moneyPolicy', kind: 'NU_TRANSFER', fromAccountId: from.id, toAccountId: to.id, destinationLabel: 'BANCO FICTICIO', currency: 'MXN', datePolicy: 'NOTIFICATION_POSTED_AT', mode: 'AUTOMATIC' };
    await config.configureCapture(db, user.id, policy);
    const event = (postedAt = '2026-10-25T18:00:00Z', key = randomUUID()) => protocol.validateCaptureEvent({
      contractVersion: 1 as const, eventId: randomUUID(), sourcePackage: 'com.nu.production', notificationKeyHash: protocol.captureHash(key),
      postedAt, receivedAt: new Date(Date.parse(postedAt) + 1000).toISOString(),
      fields: { 'android.title': 'Transferencia exitosa', 'android.text': 'Enviaste $275.40 a BANCO FICTICIO.' },
    });
    const send = async (input = event()) => {
      await service.receiveCaptureEvent(db, credential, input);
      return present((await db.captureEvent.findUniqueOrThrow({ where: { deviceId_eventId: { deviceId: device.id, eventId: input.eventId } }, include: { movement: true } })).movement);
    };
    const posting = (movementId: string) => db.captureMoneyPosting.findUniqueOrThrow({ where: { movementId } });
    const count = () => db.moneyTransfer.count({ where: { userId: user.id } });
    return { user, from, to, device, credential, policy, event, send, posting, count };
  }
  try {
    await t.test('dos días de México dentro del mismo día UTC registran dos transferencias; reintentos no suman otra', async () => {
      const f = await fixture(), first = f.event('2026-10-26T02:00:00Z'), second = f.event('2026-10-26T19:00:00Z');
      const a = await f.send(first);
      const original = await db.captureEvent.findUniqueOrThrow({ where: { deviceId_eventId: { deviceId: f.device.id, eventId: first.eventId } } });
      const repeated = await Promise.all(Array.from({ length: 4 }, () => f.send(second)));
      assert.ok(repeated.every(row => row.status === 'REGISTERED' && row.id !== a.id && row.id === repeated[0]!.id));
      assert.equal(await f.count(), 2);
      assert.equal((await f.send({ ...second, eventId: randomUUID() })).id, repeated[0]!.id);
      assert.equal(await f.count(), 2);
      assert.deepEqual(await db.captureEvent.findUniqueOrThrow({ where: { id: original.id } }), original);
      const data = await loadMoneyData(db, f.user.id), balances = accountBalances(data.accounts, buildSources(data, '2026-10-27').events, '2026-10-27');
      assert.equal(balances.find(a => a.id === f.from.id)?.balance, 449.2);
      assert.equal(balances.find(a => a.id === f.to.id)?.balance, 1550.8);
      assert.equal(await db.income.count({ where: { userId: f.user.id } }), 0);
      assert.equal(await db.dailyExpense.count({ where: { userId: f.user.id } }), 0);
    });
    await t.test('la recepción fuera de orden conserva ambas fechas', async () => {
      const f = await fixture(); await f.send(f.event('2026-10-26T18:00:00Z'));
      assert.equal((await f.send(f.event())).status, 'REGISTERED'); assert.equal(await f.count(), 2);
    });
    await t.test('mismo día y avisos junto a medianoche conservan revisión', async () => {
      for (const [first, second] of [
        ['2026-10-25T18:00:00Z', '2026-10-26T02:00:00Z'],
        ['2026-10-26T05:59:00Z', '2026-10-26T06:01:00Z'],
        ['2026-10-26T05:50:00Z', '2026-10-26T06:05:00Z'],
      ]) {
        const f = await fixture(); await f.send(f.event(first));
        assert.equal((await f.send(f.event(second))).reason, 'MONEY_POSSIBLE_DUPLICATE'); assert.equal(await f.count(), 1);
      }
    });
    await t.test('una clave de notificación reutilizada al día siguiente requiere revisión', async () => {
      const f = await fixture(), key = randomUUID(); await f.send(f.event(undefined, key));
      assert.equal((await f.send(f.event('2026-10-26T18:00:00Z', key))).reason, 'MONEY_POSSIBLE_DUPLICATE');
    });
    await t.test('una transferencia manual cercana sigue bloqueando el registro automático', async () => {
      const f = await fixture();
      await db.moneyTransfer.create({ data: { userId: f.user.id, fromAccountId: f.from.id, toAccountId: f.to.id, amount: '275.40', date: new Date('2026-10-25'), concept: 'Manual ficticia' } });
      assert.equal((await f.send(f.event('2026-10-26T18:00:00Z'))).reason, 'MONEY_POSSIBLE_DUPLICATE');
    });
    await t.test('ediciones, correcciones y reversiones conservan revisión', async () => {
      for (const change of ['concept', 'date', 'correction', 'reversal'] as const) {
        const f = await fixture(), first = await f.send(), posting = await f.posting(first.id);
        if (change === 'correction') await db.captureMovement.update({ where: { id: first.id }, data: { correction: { merchant: 'Revisión personal' } } });
        else await db.moneyTransfer.update({ where: { id: present(posting.transferId) }, data: change === 'concept' ? { concept: 'Editado' } : change === 'date' ? { date: new Date('2026-10-26') } : { reversedAt: new Date() } });
        assert.equal((await f.send(f.event('2026-10-26T18:00:00Z'))).reason, 'MONEY_POSSIBLE_DUPLICATE', change); assert.equal(await f.count(), 1);
      }
    });
    await t.test('varias evidencias o campos contradictorios no permiten asumir otra transferencia', async () => {
      const f = await fixture(), first = f.event(); await f.send(first); await f.send({ ...first, eventId: randomUUID() });
      assert.equal((await f.send(f.event('2026-10-26T18:00:00Z'))).reason, 'MONEY_POSSIBLE_DUPLICATE');
      const g = await fixture(); await g.send(); const input = g.event('2026-10-26T18:00:00Z');
      input.fields['android.bigText'] = 'Enviaste $276.40 a BANCO FICTICIO.';
      assert.equal((await g.send(input)).reason, 'CONFLICTING_FIELDS'); assert.equal(await g.count(), 1);
    });
    await t.test('una regla pausada y un destino diferente no registran nuevas transferencias', async () => {
      const f = await fixture(); await f.send();
      await config.configureCapture(db, f.user.id, { ...f.policy, mode: 'OBSERVATION' });
      assert.equal((await f.send(f.event('2026-10-26T18:00:00Z'))).reason, 'MONEY_OBSERVATION');
      const input = f.event('2026-10-26T19:00:00Z'); input.fields['android.text'] = 'Enviaste $275.40 a OTRO DESTINO.';
      assert.equal((await f.send(input)).reason, 'MONEY_POLICY_REQUIRED'); assert.equal(await f.count(), 1);
    });
    await t.test('un histórico pendiente requiere resolución expresa e idempotente, conservando su aviso', async () => {
      const f = await fixture(); await f.send(); const input = f.event('2026-10-25T19:00:00Z'), pending = await f.send(input);
      const original = await db.captureEvent.findUniqueOrThrow({ where: { deviceId_eventId: { deviceId: f.device.id, eventId: input.eventId } } });
      assert.equal(pending.reason, 'MONEY_POSSIBLE_DUPLICATE');
      await config.configureCapture(db, f.user.id, f.policy); assert.equal(await f.count(), 1);
      const resolution = { id: pending.id, action: 'registerMoneyTransfer' as const, money: { fromAccountId: f.from.id, toAccountId: f.to.id, amount: '275.40', date: '2026-10-25', concept: 'Transferencia confirmada', currency: 'MXN' as const, distinct: true } };
      await processing.resolveCaptureMovement(db, f.user.id, resolution); await processing.resolveCaptureMovement(db, f.user.id, resolution);
      assert.equal(await f.count(), 2);
      assert.deepEqual(plain(await db.captureEvent.findUniqueOrThrow({ where: { id: original.id } })), plain(original));
    });
    await t.test('fallar al guardar la segunda evidencia revierte toda esa recepción', async () => {
      const f = await fixture(); await f.send(); const input = f.event('2026-10-26T18:00:00Z');
      const broken = faultingTransactions(db, { before(model, method) { if (model === 'captureMoneyPosting' && method === 'create') throw Error('Fallo ficticio'); } }, false);
      await assert.rejects(withFixtureDb(service.receiveCaptureEvent, broken, f.credential, input), /Fallo ficticio/);
      assert.equal(await f.count(), 1); assert.equal(await db.captureEvent.count({ where: { userId: f.user.id } }), 1);
      assert.equal((await f.send(input)).status, 'REGISTERED'); assert.equal(await f.count(), 2);
    });
  } finally { await db.user.deleteMany({ where: { id: { in: owners } } }); await db.$disconnect(); }
});
