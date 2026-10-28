const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { sourceLoader } = require('./helpers/load-source.ts');
const connectionString = process.env.AFP_TEST_DATABASE_URL;

test('Fase 7 PostgreSQL: activación gradual, evidencia propia y recuperación de nueve tarjetas', { skip: !connectionString }, async t => {
  const url = new URL(connectionString);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && /^\/afp_test\w*$/.test(url.pathname) && !url.search);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const user = await db.user.create({ data: { email: `rollout-${randomUUID()}@example.test` } });
  const other = await db.user.create({ data: { email: `rollout-other-${randomUUID()}@example.test` } });
  const base = sourceLoader()('src/lib/captureParsers.ts');
  const protocol = sourceLoader()('src/lib/captureProtocol.ts');
  const wallet = 'com.google.android.apps.walletnfcrel';
  // Contratos ficticios SOLO en este cargador. Ningún analizador nuevo ni un
  // interruptor de verificación se incorpora al producto sin muestras reales.
  const parsers = protocol.capturePackages.map((sourcePackage, i) => ({ key: `synthetic.${i}.v1`, sourcePackage, verified: true }));
  const load = sourceLoader({ '@/lib/captureParsers': { ...base, captureParsers: parsers, interpretCapture: event => ({
    ...base.interpretCapture({ ...event, sourcePackage: event.sourcePackage === wallet ? wallet : 'com.bancomer.mbanking' }),
    parserKey: parsers.find(parser => parser.sourcePackage === event.sourcePackage).key, verified: true,
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
  ];
  const cards = [];
  for (const [i, [name, sourcePackage, supportsWallet]] of rows.entries()) {
    const card = await db.card.create({ data: { userId: user.id, name, usualCutDay: 25, usualDueDay: 15 } });
    cards.push({ ...card, sourcePackage, supportsWallet, physical: String(1000 + i), digital: String(2000 + i), wallet: String(3000 + i) });
    for (const kind of ['PHYSICAL', 'DIGITAL', ...(supportsWallet ? ['WALLET'] : [])]) await configuration.configureCapture(db, user.id, {
      action: 'alias', cardId: card.id, sourcePackage: kind === 'WALLET' ? wallet : sourcePackage, kind,
      value: String((kind === 'PHYSICAL' ? 1000 : kind === 'DIGITAL' ? 2000 : 3000) + i), verified: true, evidence: 'Alias ficticio del test',
    });
  }
  let sequence = 100;
  const parser = sourcePackage => parsers.find(parser => parser.sourcePackage === sourcePackage);
  const mode = (card, sourcePackage = card.sourcePackage, value = 'AUTOMATIC') => configuration.configureCapture(db, user.id, {
    action: 'automation', cardId: card.id, parserKey: parser(sourcePackage).key, mode: value,
  });
  const event = (card, options = {}) => {
    const sourcePackage = options.sourcePackage || card.sourcePackage;
    const kind = sourcePackage === wallet ? 'Wallet' : options.kind || 'física';
    return protocol.validateCaptureEvent({ contractVersion: 1, eventId: randomUUID(), sourcePackage,
      notificationKeyHash: createHash('sha256').update(randomUUID()).digest('hex'),
      postedAt: '2026-10-21T20:00:00Z', receivedAt: '2026-10-21T20:00:01Z', fields: {
        'android.title': sourcePackage === wallet ? 'Pago realizado' : 'Compra aprobada',
        'android.text': `Importe: MXN ${options.amount || `${++sequence}.25`}\nComercio: ${options.merchant || 'COMERCIO FICTICIO'}\nTarjeta ${kind}: *${kind === 'Wallet' ? card.wallet : kind === 'digital' ? card.digital : card.physical}\nFecha: 21/10/2026 13:00:00`,
        ...(options.fields || {}),
      } });
  };
  const send = async input => {
    await service.receiveCaptureEvent(db, credential, input);
    return (await db.captureEvent.findUnique({ where: { deviceId_eventId: { deviceId: device.id, eventId: input.eventId } }, include: { movement: true } })).movement;
  };
  const review = async (movement, changes = {}) => {
    const p = movement.proposal;
    await processing.resolveCaptureMovement(db, user.id, { id: movement.id, action: 'correct', expectedCorrection: 'null',
      correction: { cardId: p.cardId, date: p.date, amount: p.amount, currency: p.currency, merchant: p.merchant, categoryId: category.id, ...changes } });
    const registered = await processing.resolveCaptureMovement(db, user.id, { id: movement.id, action: 'register' });
    assert.equal(registered.status, 'REGISTERED');
    const period = { cardId: p.cardId, startDate: '2026-10-01', endDate: '2026-10-25' };
    const record = (await reconciliation.captureStatement(db, user.id, period)).records.find(row => row.id === registered.expenseId);
    await reconciliation.reconcileCaptureStatement(db, user.id, { ...period, action: 'confirm', type: record.type, recordId: record.id, fingerprint: record.fingerprint });
    return registered;
  };
  const readiness = async (card, sourcePackage = card.sourcePackage) => (await configuration.captureConfiguration(db, user.id)).rollout
    .find(row => row.cardId === card.id).sources.find(row => row.sourcePackage === sourcePackage).formats[0];
  try {
    await t.test('registro real: nueve tarjetas, fuentes explícitas, cero formatos activables y sin atribuir canales', async () => {
      const data = await real.captureConfiguration(db, user.id);
      assert.equal(data.rollout.length, 9);
      for (const card of cards) {
        const coverage = data.rollout.find(row => row.cardId === card.id);
        assert.equal(coverage.sources.length, 2);
        assert.ok(coverage.sources.some(source => source.sourcePackage === card.sourcePackage));
        for (const source of coverage.sources) for (const format of source.formats) assert.equal(format.canEnable, false);
        await assert.rejects(real.configureCapture(db, user.id, { action: 'automation', cardId: card.id, parserKey: 'wallet.purchase.es.v1', mode: 'AUTOMATIC' }), error => error.status === 409);
      }
      assert.equal(await db.dailyExpense.count({ where: { userId: user.id } }), 0);
      assert.ok(!JSON.stringify(data.rollout).includes('1000'));
      assert.equal(data.rollout[0].verifiedChannels, undefined);
    });
    for (const card of cards) {
      await t.test(`${card.name}: observación propia, cotejo, activación y separación del resto`, async () => {
        await assert.rejects(mode(card), error => error.status === 409);
        const observed = await send(event(card));
        assert.equal(observed.status, 'OBSERVED'); assert.equal(observed.expenseId, null);
        await review(observed);
        assert.equal((await readiness(card)).reviewedCaptures, 1);
        await Promise.all(Array.from({ length: 4 }, () => mode(card)));
        assert.equal(await db.captureAutomation.count({ where: { userId: user.id, cardId: card.id, mode: 'AUTOMATIC' } }), 1);
        if (card.name === 'HSBC 1' || card.name === 'BANAMEX 1') {
          const sibling = cards.find(row => row.name === card.name.replace('1', '2'));
          await assert.rejects(mode(sibling), error => error.status === 409);
          assert.equal((await send(event(sibling))).status, 'OBSERVED');
        }
        if (card.supportsWallet) { await assert.rejects(mode(card, wallet), error => error.status === 409); assert.equal((await send(event(card, { sourcePackage: wallet }))).status, 'OBSERVED'); }
      });
      await t.test(`${card.name}: presencial, en línea, cargos parciales y suscripción (sintéticos)`, async () => {
        for (const options of [{}, { kind: 'digital' }, { merchant: 'AMAZON FICTICIO' }, { merchant: 'AMAZON FICTICIO' }, { merchant: 'MERCADO PAGO FICTICIO', kind: 'digital' }]) {
          const input = event(card, options), movement = await send(input);
          assert.equal(movement.status, 'REGISTERED');
          const expense = await db.dailyExpense.findUnique({ where: { id: movement.expenseId } });
          assert.equal(expense.cardId, card.id); assert.equal(expense.amount.toFixed(2), movement.proposal.amount);
          assert.equal((await send(input)).expenseId, expense.id);
        }
        const sub = await db.subscription.create({ data: { userId: user.id, name: `SUSCRIPCIÓN ${card.name}`, amount: '50.50', categoryId: category.id, paymentMethod: 'CARD', cardId: card.id, chargeDay: 1, startMonth: 10, startYear: 2026 } });
        await configuration.configureCapture(db, user.id, { action: 'rule', cardId: card.id, merchant: `SUSCRIPCIÓN ${card.name}`, categoryId: category.id, subscriptionId: sub.id });
        const movement = await send(event(card, { amount: '50.50', merchant: `SUSCRIPCIÓN ${card.name}` }));
        assert.equal(movement.status, 'REGISTERED');
        assert.equal((await db.dailyExpense.findUnique({ where: { id: movement.expenseId } })).subscriptionId, sub.id);
        assert.equal((await send(event(card, { amount: '50.51', merchant: `SUSCRIPCIÓN ${card.name}` }))).reason, 'SUBSCRIPTION_CONFLICT');
        const count = await db.dailyExpense.count({ where: { userId: user.id, cardId: card.id } });
        assert.equal((await send(event(card, { fields: { 'android.subText': 'pedido recibido' } }))).reason, 'SPECIAL_MOVEMENT');
        assert.equal(await db.dailyExpense.count({ where: { userId: user.id, cardId: card.id } }), count);
      });
    }
    await t.test('Wallet: revisión de seis tarjetas y habilitación independiente, incluidas dos Banamex', async () => {
      for (const card of cards.filter(card => card.supportsWallet)) {
        await review(await send(event(card, { sourcePackage: wallet })));
        await mode(card, wallet);
        const input = event(card, { sourcePackage: wallet });
        assert.equal((await send(input)).status, 'REGISTERED');
        assert.equal((await send(input)).expenseId, (await send(input)).expenseId);
      }
      for (const card of cards.filter(card => !card.supportsWallet)) await assert.rejects(mode(card, wallet), error => error.status === 409);
    });
    await t.test('colisión de alias incluso sin verificar bloquea reactivación; otra cuenta no aporta evidencia', async () => {
      const [first, second] = cards;
      await mode(first, first.sourcePackage, 'OBSERVATION');
      const alias = await db.captureCardAlias.create({ data: { userId: user.id, cardId: second.id, sourcePackage: first.sourcePackage, kind: 'PHYSICAL', value: first.physical } });
      assert.ok((await readiness(first)).blockers.includes('AMBIGUOUS_ALIAS'));
      await assert.rejects(mode(first), error => error.status === 409);
      await db.captureCardAlias.delete({ where: { id: alias.id } });
      await mode(first);
      assert.equal((await real.captureConfiguration(db, other.id)).rollout.length, 0);
      await assert.rejects(configuration.configureCapture(db, other.id, { action: 'automation', cardId: first.id, parserKey: parser(first.sourcePackage).key, mode: 'AUTOMATIC' }), error => error.status === 404);
    });
    await t.test('una propuesta corregida no valida el formato; completar un formato desconocido tampoco', async () => {
      const card = cards[0];
      await mode(card, card.sourcePackage, 'OBSERVATION');
      const before = (await readiness(card)).reviewedCaptures;
      const observed = await send(event(card));
      await review(observed, { amount: '999.99' });
      assert.equal((await readiness(card)).reviewedCaptures, before);
      const input = event(card, { fields: { 'android.title': 'Desconocido' } });
      const unknown = await send(input);
      await processing.resolveCaptureMovement(db, user.id, { id: unknown.id, action: 'correct', expectedCorrection: 'null', correction: {
        cardId: card.id, date: '2026-10-21', amount: '997.99', currency: 'MXN', merchant: 'COMERCIO FICTICIO', categoryId: category.id,
      } });
      assert.equal((await readiness(card)).reviewedCaptures, before);
    });
    await t.test('pausa de fuente y vuelta a observación preservan filas y otras tarjetas; reintentos no reprocesan', async () => {
      const card = cards[0]; await mode(card);
      const input = event(card), original = await send(input);
      const prior = await db.dailyExpense.findMany({ where: { userId: user.id }, orderBy: { id: 'asc' } });
      const eventsBefore = await db.captureEvent.count({ where: { userId: user.id } });
      await service.changeCaptureDevice(db, user.id, { deviceId: device.id, action: 'source', sourcePackage: card.sourcePackage, paused: true });
      await mode(card, card.sourcePackage, 'OBSERVATION');
      assert.equal((await send(input)).expenseId, original.expenseId);
      assert.equal(await db.captureEvent.count({ where: { userId: user.id } }), eventsBefore);
      assert.equal((await send(event(card))).status, 'OBSERVED');
      assert.deepEqual(await db.dailyExpense.findMany({ where: { userId: user.id }, orderBy: { id: 'asc' } }), prior);
      assert.equal(await db.captureAutomation.count({ where: { userId: user.id, cardId: { not: card.id }, mode: 'AUTOMATIC' } }), 13);
      await service.changeCaptureDevice(db, user.id, { deviceId: device.id, action: 'source', sourcePackage: card.sourcePackage, paused: false });
      await mode(card);
      assert.equal((await send(event(card))).status, 'REGISTERED');
    });
    await t.test('solo lectura no altera movimientos; versión nueva no hereda observaciones anteriores', async () => {
      const before = await db.captureMovement.findMany({ where: { userId: user.id }, orderBy: { id: 'asc' } });
      await configuration.captureConfiguration(db, user.id);
      assert.deepEqual(await db.captureMovement.findMany({ where: { userId: user.id }, orderBy: { id: 'asc' } }), before);
      const rollout = load('src/lib/captureRollout.ts');
      const aliases = await db.captureCardAlias.findMany({ where: { userId: user.id } });
      const movements = await rollout.captureRolloutMovements(db, user.id);
      assert.equal(rollout.captureFormatReadiness({ ...parser(cards[0].sourcePackage), key: 'synthetic.new.v2' }, cards[0].id, aliases, movements).canEnable, false);
    });
    await t.test('un formato retirado conserva una salida a observación sin reactivarse ni crear formatos arbitrarios', async () => {
      const card = cards[0], parserKey = 'synthetic.retired.v0';
      const old = await db.captureAutomation.create({ data: { userId: user.id, cardId: card.id, parserKey, mode: 'AUTOMATIC' } });
      const coverage = (await configuration.captureConfiguration(db, user.id)).rollout.find(row => row.cardId === card.id);
      assert.equal(coverage.retiredFormats[0].parserKey, parserKey);
      assert.equal(coverage.retiredFormats[0].mode, 'AUTOMATIC');
      await configuration.configureCapture(db, user.id, { action: 'automation', cardId: card.id, parserKey, mode: 'OBSERVATION' });
      assert.equal((await db.captureAutomation.findUnique({ where: { id: old.id } })).mode, 'OBSERVATION');
      await assert.rejects(configuration.configureCapture(db, user.id, { action: 'automation', cardId: card.id, parserKey, mode: 'AUTOMATIC' }), error => error.status === 400);
      await assert.rejects(configuration.configureCapture(db, user.id, { action: 'automation', cardId: card.id, parserKey: 'arbitrary.v0', mode: 'OBSERVATION' }), error => error.status === 400);
    });
  } finally { await db.user.deleteMany({ where: { id: { in: [user.id, other.id] } } }); await db.$disconnect(); }
});
