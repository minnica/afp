import { record as objectValue } from './helpers/dynamic-values';
import { present,sparseCalculations } from './helpers/financial-fixtures';
import type { CaptureInput } from './helpers/integration-fixtures';

type FixtureCard = import('@prisma/client').Card & { sourcePackage: string; supportsWallet: boolean; physical: string; digital: string; wallet: string };

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';
import { createHash,randomBytes,randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { integrationLoader as sourceLoader } from './helpers/integration-fixtures';
const connectionString = process.env.AFP_TEST_DATABASE_URL;

test('Fase 7 PostgreSQL: activación gradual, evidencia propia y recuperación de nueve tarjetas', { skip: !connectionString }, async t => {
  const url = new URL(present(connectionString));
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && /^\/afp_test\w*$/.test(url.pathname) && !url.search);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const user = await db.user.create({ data: { email: `rollout-${randomUUID()}@example.test` } });
  const other = await db.user.create({ data: { email: `rollout-other-${randomUUID()}@example.test` } });
  const base = sparseCalculations(sourceLoader()('src/lib/captureParsers.ts'));
  const protocol = sparseCalculations(sourceLoader()('src/lib/captureProtocol.ts'));
  const wallet = 'com.google.android.apps.walletnfcrel';
  // Contratos ficticios SOLO en este cargador. Ningún analizador nuevo ni un
  // interruptor de verificación se incorpora al producto sin muestras reales.
  const parsers = protocol.capturePackages.map((sourcePackage, i) => ({ key: `synthetic.${i}.v1`, sourcePackage, verified: true }));
  const load = sourceLoader({ '@/lib/captureParsers': { ...base, captureParsers: parsers, interpretCapture: event => ({
    ...base.interpretCapture({ ...event, sourcePackage: event.sourcePackage === wallet ? wallet : 'com.bancomer.mbanking' }),
    parserKey: present(parsers.find(parser => parser.sourcePackage === event.sourcePackage)).key, verified: true,
  }) } });
  const configuration = load('src/lib/captureConfiguration.ts');
  const service = load('src/lib/captureService.ts');
  const processing = load('src/lib/captureProcessing.ts');
  const reconciliation = load('src/lib/captureReconciliation.ts');
  const real = sourceLoader()('src/lib/captureConfiguration.ts');
  const category = await db.category.create({ data: { userId: user.id, name: 'Pruebas ficticias' } });
  const device = await db.captureDevice.create({ data: { userId: user.id, name: 'Ficticio Fase 7', approvedAt: new Date(), secretHash: protocol.captureHash(randomBytes(32).toString('base64url')) } });
  const credential = { id: device.id, secretHash: device.secretHash };
  const rows = [
    ['BBVA', 'com.bancomer.mbanking', true], ['HSBC 1', 'mx.hsbc.hsbcmexico', false], ['HSBC 2', 'mx.hsbc.hsbcmexico', false],
    ['BANAMEX 1', 'com.citibanamex.banamexmobile', true], ['BANAMEX 2', 'com.citibanamex.banamexmobile', true],
    ['SANTANDER', 'mx.bancosantander.supermovil', true], ['NU', 'com.nu.production', true],
    ['DIDI', 'com.didiglobal.cashloan', true], ['MERCADOPAGO', 'com.mercadopago.wallet', false],
  ] as const;
  const cards: (FixtureCard)[] = [];
  for (const [i, [name, sourcePackage, supportsWallet]] of rows.entries()) {
    const card = await db.card.create({ data: { userId: user.id, name, usualCutDay: 25, usualDueDay: 15 } });
    cards.push({ ...card, sourcePackage, supportsWallet, physical: String(1000 + i), digital: String(2000 + i), wallet: String(3000 + i) });
    for (const kind of ['PHYSICAL', 'DIGITAL', ...(supportsWallet ? ['WALLET'] : [])] as const) await configuration.configureCapture(db, user.id, {
      action: 'alias', cardId: card.id, sourcePackage: kind === 'WALLET' ? wallet : sourcePackage, kind,
      value: String((kind === 'PHYSICAL' ? 1000 : kind === 'DIGITAL' ? 2000 : 3000) + i), verified: true, evidence: 'Alias ficticio del test',
    });
  }
  let sequence = 100;
  const parser = (sourcePackage: string) => parsers.find(parser => parser.sourcePackage === sourcePackage);
  const mode = (card: FixtureCard, sourcePackage = card.sourcePackage, value = 'AUTOMATIC') => configuration.configureCapture(db, user.id, {
    action: 'automation', cardId: card.id, parserKey: present(parser(sourcePackage)).key, mode: value,
  });
  const event = (card: FixtureCard, options: { sourcePackage?: string; kind?: string; alias?: string; amount?: string; reference?: string; merchant?: string; fields?: Record<string, string> } = {}) => {
    const sourcePackage = options.sourcePackage || card.sourcePackage;
    const kind = sourcePackage === wallet ? 'Wallet' : options.kind || 'física';
    return protocol.validateCaptureEvent({ contractVersion: 1 as const, eventId: randomUUID(), sourcePackage,
      notificationKeyHash: createHash('sha256').update(randomUUID()).digest('hex'),
      postedAt: '2026-10-21T20:00:00Z', receivedAt: '2026-10-21T20:00:01Z', fields: {
        'android.title': sourcePackage === wallet ? 'Pago realizado' : 'Compra aprobada',
        'android.text': `Importe: MXN ${options.amount || `${++sequence}.25`}\nComercio: ${options.merchant || 'COMERCIO FICTICIO'}\nTarjeta ${kind}: *${kind === 'Wallet' ? card.wallet : kind === 'digital' ? card.digital : card.physical}\nFecha: 21/10/2026 13:00:00`,
        ...(options.fields || {}),
      } });
  };
  const send = async (input: CaptureInput) => {
    await service.receiveCaptureEvent(db, credential, input);
    return present((await db.captureEvent.findUnique({ where: { deviceId_eventId: { deviceId: device.id, eventId: input.eventId } }, include: { movement: true } }))).movement;
  };
  const review = async (movement: unknown, changes = {}) => {
    const p = objectValue(present(movement)).proposal;
    await processing.resolveCaptureMovement(db, user.id, { id: objectValue(present(movement)).id, action: 'correct', expectedCorrection: 'null',
      correction: { cardId: objectValue(present(p)).cardId, date: objectValue(present(p)).date, amount: objectValue(present(p)).amount, currency: objectValue(present(p)).currency, merchant: objectValue(present(p)).merchant, categoryId: category.id, ...changes } });
    const registered = await processing.resolveCaptureMovement(db, user.id, { id: objectValue(present(movement)).id, action: 'register' });
    assert.equal(present(registered).status, 'REGISTERED');
    const period = { cardId: objectValue(present(p)).cardId, startDate: '2026-10-01', endDate: '2026-10-25' };
    const record = (await reconciliation.captureStatement(db, user.id, period)).records.find(row => row.id === present(registered).expenseId);
    await reconciliation.reconcileCaptureStatement(db, user.id, { ...period, action: 'confirm', type: present(record).type, recordId: present(record).id, fingerprint: present(record).fingerprint });
    return registered;
  };
  const readiness = async (card: FixtureCard, sourcePackage = card.sourcePackage) => present(present((await configuration.captureConfiguration(db, user.id)).rollout
    .find(row => row.cardId === card.id)).sources.find(row => row.sourcePackage === sourcePackage)).formats[0];
  try {
    await t.test('registro real: nueve tarjetas, fuentes explícitas, cero formatos activables y sin atribuir canales', async () => {
      const data = await real.captureConfiguration(db, user.id);
      assert.equal(data.rollout.length, 9);
      for (const card of cards) {
        const coverage = data.rollout.find(row => row.cardId === card.id);
        assert.equal(present(coverage).sources.length, 2);
        assert.ok(present(coverage).sources.some(source => source.sourcePackage === card.sourcePackage));
        for (const source of present(coverage).sources) for (const format of source.formats) assert.equal(format.canEnable, false);
        await assert.rejects(real.configureCapture(db, user.id, { action: 'automation', cardId: card.id, parserKey: 'wallet.purchase.es.v1', mode: 'AUTOMATIC' }), error => objectValue(error).status === 409);
      }
      assert.equal(await db.dailyExpense.count({ where: { userId: user.id } }), 0);
      assert.ok(!JSON.stringify(data.rollout).includes('1000'));
      assert.equal(objectValue(present(data.rollout[0])).verifiedChannels, undefined);
    });
    for (const card of cards) {
      await t.test(`${card.name}: observación propia, cotejo, activación y separación del resto`, async () => {
        await assert.rejects(mode(card), error => objectValue(error).status === 409);
        const observed = await send(event(card));
        assert.equal(present(observed).status, 'OBSERVED'); assert.equal(present(observed).expenseId, null);
        await review(observed);
        assert.equal(present((await readiness(card))).reviewedCaptures, 1);
        await Promise.all(Array.from({ length: 4 }, () => mode(card)));
        assert.equal(await db.captureAutomation.count({ where: { userId: user.id, cardId: card.id, mode: 'AUTOMATIC' } }), 1);
        if (card.name === 'HSBC 1' || card.name === 'BANAMEX 1') {
          const sibling = cards.find(row => row.name === card.name.replace('1', '2'));
          await assert.rejects(mode(present(sibling)), error => objectValue(error).status === 409);
          assert.equal(present((await send(event(present(sibling))))).status, 'OBSERVED');
        }
        if (card.supportsWallet) { await assert.rejects(mode(card, wallet), error => objectValue(error).status === 409); assert.equal(present((await send(event(card, { sourcePackage: wallet })))).status, 'OBSERVED'); }
      });
      await t.test(`${card.name}: presencial, en línea, cargos parciales y suscripción (sintéticos)`, async () => {
        for (const options of [{}, { kind: 'digital' }, { merchant: 'AMAZON FICTICIO' }, { merchant: 'AMAZON FICTICIO' }, { merchant: 'MERCADO PAGO FICTICIO', kind: 'digital' }] as const) {
          const input = event(card, options), movement = await send(input);
          assert.equal(present(movement).status, 'REGISTERED');
          const expense = await db.dailyExpense.findUnique({ where: { id: present(present(movement).expenseId) } });
          assert.equal(present(expense).cardId, card.id); assert.equal(present(expense).amount.toFixed(2), objectValue(present(present(movement).proposal)).amount);
          assert.equal(present((await send(input))).expenseId, present(expense).id);
        }
        const sub = await db.subscription.create({ data: { userId: user.id, name: `SUSCRIPCIÓN ${card.name}`, amount: '50.50', categoryId: category.id, paymentMethod: 'CARD', cardId: card.id, chargeDay: 1, startMonth: 10, startYear: 2026 } });
        await configuration.configureCapture(db, user.id, { action: 'rule', cardId: card.id, merchant: `SUSCRIPCIÓN ${card.name}`, categoryId: category.id, subscriptionId: sub.id });
        const movement = await send(event(card, { amount: '50.50', merchant: `SUSCRIPCIÓN ${card.name}` }));
        assert.equal(present(movement).status, 'REGISTERED');
        assert.equal(present((await db.dailyExpense.findUnique({ where: { id: present(present(movement).expenseId) } }))).subscriptionId, sub.id);
        assert.equal(present((await send(event(card, { amount: '50.51', merchant: `SUSCRIPCIÓN ${card.name}` })))).reason, 'SUBSCRIPTION_CONFLICT');
        const count = await db.dailyExpense.count({ where: { userId: user.id, cardId: card.id } });
        assert.equal(present((await send(event(card, { fields: { 'android.subText': 'pedido recibido' } })))).reason, 'SPECIAL_MOVEMENT');
        assert.equal(await db.dailyExpense.count({ where: { userId: user.id, cardId: card.id } }), count);
      });
    }
    await t.test('Wallet: revisión de seis tarjetas y habilitación independiente, incluidas dos Banamex', async () => {
      for (const card of cards.filter(card => card.supportsWallet)) {
        await review(await send(event(card, { sourcePackage: wallet })));
        await mode(card, wallet);
        const input = event(card, { sourcePackage: wallet });
        assert.equal(present((await send(input))).status, 'REGISTERED');
        assert.equal(present((await send(input))).expenseId, present((await send(input))).expenseId);
      }
      for (const card of cards.filter(card => !card.supportsWallet)) await assert.rejects(mode(card, wallet), error => objectValue(error).status === 409);
    });
    await t.test('colisión de alias incluso sin verificar bloquea reactivación; otra cuenta no aporta evidencia', async () => {
      const [first, second] = cards;
      await mode(present(first), present(first).sourcePackage, 'OBSERVATION');
      const alias = await db.captureCardAlias.create({ data: { userId: user.id, cardId: present(second).id, sourcePackage: present(first).sourcePackage, kind: 'PHYSICAL', value: present(first).physical } });
      assert.ok(present((await readiness(present(first)))).blockers.includes('AMBIGUOUS_ALIAS'));
      await assert.rejects(mode(present(first)), error => objectValue(error).status === 409);
      await db.captureCardAlias.delete({ where: { id: alias.id } });
      await mode(present(first));
      assert.equal((await real.captureConfiguration(db, other.id)).rollout.length, 0);
      await assert.rejects(configuration.configureCapture(db, other.id, { action: 'automation', cardId: present(first).id, parserKey: present(parser(present(first).sourcePackage)).key, mode: 'AUTOMATIC' }), error => objectValue(error).status === 404);
    });
    await t.test('una propuesta corregida no valida el formato; completar un formato desconocido tampoco', async () => {
      const card = cards[0];
      await mode(present(card), present(card).sourcePackage, 'OBSERVATION');
      const before = present((await readiness(present(card)))).reviewedCaptures;
      const observed = await send(event(present(card)));
      await review(observed, { amount: '999.99' });
      assert.equal(present((await readiness(present(card)))).reviewedCaptures, before);
      const input = event(present(card), { fields: { 'android.title': 'Desconocido' } });
      const unknown = await send(input);
      await processing.resolveCaptureMovement(db, user.id, { id: present(unknown).id, action: 'correct', expectedCorrection: 'null', correction: {
        cardId: present(card).id, date: '2026-10-21', amount: '997.99', currency: 'MXN', merchant: 'COMERCIO FICTICIO', categoryId: category.id,
      } });
      assert.equal(present((await readiness(present(card)))).reviewedCaptures, before);
    });
    await t.test('pausa de fuente y vuelta a observación preservan filas y otras tarjetas; reintentos no reprocesan', async () => {
      const card = cards[0]; await mode(present(card));
      const input = event(present(card)), original = await send(input);
      const prior = await db.dailyExpense.findMany({ where: { userId: user.id }, orderBy: { id: 'asc' } });
      const eventsBefore = await db.captureEvent.count({ where: { userId: user.id } });
      await service.changeCaptureDevice(db, user.id, { deviceId: device.id, action: 'source', sourcePackage: present(card).sourcePackage, paused: true });
      await mode(present(card), present(card).sourcePackage, 'OBSERVATION');
      assert.equal(present((await send(input))).expenseId, present(original).expenseId);
      assert.equal(await db.captureEvent.count({ where: { userId: user.id } }), eventsBefore);
      assert.equal(present((await send(event(present(card))))).status, 'OBSERVED');
      assert.deepEqual(await db.dailyExpense.findMany({ where: { userId: user.id }, orderBy: { id: 'asc' } }), prior);
      assert.equal(await db.captureAutomation.count({ where: { userId: user.id, cardId: { not: present(card).id }, mode: 'AUTOMATIC' } }), 13);
      await service.changeCaptureDevice(db, user.id, { deviceId: device.id, action: 'source', sourcePackage: present(card).sourcePackage, paused: false });
      await mode(present(card));
      assert.equal(present((await send(event(present(card))))).status, 'REGISTERED');
    });
    await t.test('solo lectura no altera movimientos; versión nueva no hereda observaciones anteriores', async () => {
      const before = await db.captureMovement.findMany({ where: { userId: user.id }, orderBy: { id: 'asc' } });
      await configuration.captureConfiguration(db, user.id);
      assert.deepEqual(await db.captureMovement.findMany({ where: { userId: user.id }, orderBy: { id: 'asc' } }), before);
      const rollout = sparseCalculations(load('src/lib/captureRollout.ts'));
      const aliases = await db.captureCardAlias.findMany({ where: { userId: user.id } });
      const movements = await rollout.captureRolloutMovements(db, user.id);
      assert.equal(rollout.captureFormatReadiness({ ...parser(present(cards[0]).sourcePackage), key: 'synthetic.new.v2' }, present(cards[0]).id, aliases, movements).canEnable, false);
    });
    await t.test('un formato retirado conserva una salida a observación sin reactivarse ni crear formatos arbitrarios', async () => {
      const card = cards[0], parserKey = 'synthetic.retired.v0';
      const old = await db.captureAutomation.create({ data: { userId: user.id, cardId: present(card).id, parserKey, mode: 'AUTOMATIC' } });
      const coverage = (await configuration.captureConfiguration(db, user.id)).rollout.find(row => row.cardId === present(card).id);
      assert.equal(present(present(coverage).retiredFormats[0]).parserKey, parserKey);
      assert.equal(present(present(coverage).retiredFormats[0]).mode, 'AUTOMATIC');
      await configuration.configureCapture(db, user.id, { action: 'automation', cardId: present(card).id, parserKey, mode: 'OBSERVATION' });
      assert.equal(present((await db.captureAutomation.findUnique({ where: { id: old.id } }))).mode, 'OBSERVATION');
      await assert.rejects(configuration.configureCapture(db, user.id, { action: 'automation', cardId: present(card).id, parserKey, mode: 'AUTOMATIC' }), error => objectValue(error).status === 400);
      await assert.rejects(configuration.configureCapture(db, user.id, { action: 'automation', cardId: present(card).id, parserKey: 'arbitrary.v0', mode: 'OBSERVATION' }), error => objectValue(error).status === 400);
    });
  } finally { await db.user.deleteMany({ where: { id: { in: [user.id, other.id] } } }); await db.$disconnect(); }
});
