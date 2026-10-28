const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomUUID, randomBytes } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { sourceLoader } = require('./helpers/load-source.ts');
const fixture = name => require(`./fixtures/captures/${name}.json`).event;
const connectionString = process.env.AFP_TEST_DATABASE_URL;

test('Wallet principal y respaldo bancario persistente: API y PostgreSQL', { skip: !connectionString }, async t => {
  const url = new URL(connectionString);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && /^\/afp_test\w*$/.test(url.pathname) && !url.search);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const user = await db.user.create({ data: { email: `fallback-${randomUUID()}@example.test` } });
  const other = await db.user.create({ data: { email: `fallback-other-${randomUUID()}@example.test` } });
  const mocks = { '@/lib/prisma': { prisma: db }, '@/lib/calendar/schedule': { scheduleCalendarSync: () => {} },
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body: JSON.parse(JSON.stringify(body)), status: options.status || 200, headers: new Headers(options.headers) }) } },
    '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async token => ({ data: { user: token === 'owner' ? user : token === 'other' ? other : null }, error: null }) } }) },
  };
  const load = sourceLoader(mocks), protocol = load('src/lib/captureProtocol.ts'), config = load('src/lib/captureConfiguration.ts');
  const processing = load('src/lib/captureProcessing.ts'), worker = load('src/lib/captureBankFallbackWorker.ts');
  const route = load('src/app/api/captures/events/route.ts'), configRoute = load('src/app/api/captures/configuration/route.ts');
  const secret = randomBytes(32).toString('base64url');
  const device = await db.captureDevice.create({ data: { userId: user.id, name: 'Teléfono ficticio', approvedAt: new Date(), secretHash: protocol.captureHash(secret) } });
  const category = await db.category.create({ data: { userId: user.id, name: 'Categoría ficticia' } });
  const cases = [
    ['Banamex A ficticia', 'banamex-card-charge.es.v1', 'wallet-banamex-purchase.es.v1', '0123'],
    ['Banamex B ficticia', 'banamex-joy-card-charge.es.v1', 'wallet-banamex2-purchase.es.v1', '0456'],
    ['Nu ficticia', 'nu-card-purchase.es.v1', 'wallet-nu-purchase.es.v1', '0123'],
    ['Santander ficticia', 'santander-card-purchase.es.v1', 'wallet-santander-purchase.es.v2', '0123'],
  ];
  const cards = [];
  const input = (sample, amount) => ({ ...sample, contractVersion: 1, eventId: randomUUID(), notificationKeyHash: protocol.captureHash(randomUUID()),
    fields: Object.fromEntries(Object.entries(sample.fields).map(([key, value]) => [key, value.replaceAll('123.45', amount)])) });
  const read = id => db.captureMovement.findUnique({ where: { id } });
  const post = event => route.POST(new Request('http://localhost/api/captures/events', { method: 'POST', headers: { authorization: `Capture ${device.id}.${secret}`, 'Content-Type': 'application/json' }, body: JSON.stringify(event) }));
  const send = async event => { const response = await post(event); assert.equal(response.status, 200, JSON.stringify(response.body)); return (await db.captureEvent.findUnique({ where: { deviceId_eventId: { deviceId: device.id, eventId: event.eventId } }, include: { movement: true } })).movement; };
  const configure = (body, token = 'owner') => configRoute.PATCH(new Request('http://localhost/api/captures/configuration', { method: 'PATCH', headers: { authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
  const resolve = body => processing.resolveCaptureMovement(db, user.id, body);
  const count = () => db.dailyExpense.count({ where: { userId: user.id } });
  const due = async movement => worker.runBankFallbacks(db, { now: new Date(movement.fallbackDueAt) });
  let n = 200;
  const amount = () => `${++n}.01`;
  try {
    await t.test('activación por tarjeta exige Wallet, alias inequívoco y muestra bancaria cotejada propia', async () => {
      for (const [name, bankName, walletName, alias] of cases) {
        const card = await db.card.create({ data: { userId: user.id, name, usualCutDay: 25, usualDueDay: 15 } });
        const bank = fixture(bankName), wallet = fixture(walletName);
        await config.configureCapture(db, user.id, { action: 'alias', cardId: card.id, sourcePackage: bank.sourcePackage, kind: 'PHYSICAL', value: alias, verified: true, evidence: 'Muestra ficticia local' });
        const wm = await send(input(wallet, '123.45'));
        await resolve({ id: wm.id, action: 'correct', expectedCorrection: 'null', correction: { cardId: card.id, amount: '123.45', date: wm.proposal.date, currency: 'MXN', merchant: wm.proposal.merchant, categoryId: category.id } });
        const registered = await resolve({ id: wm.id, action: 'register' });
        await db.dailyExpense.update({ where: { id: registered.expenseId }, data: { reconciledAt: new Date(), reconciliationStatus: 'CONFIRMED' } });
        const bm = await send(input(bank, '123.45'));
        const action = { action: 'bankFallback', cardId: card.id, bankSourcePackage: bank.sourcePackage, bankDatePolicy: name.startsWith('Nu') ? 'NOTIFICATION_POSTED_AT' : 'BANK_OPERATION', mode: 'AUTOMATIC', currency: 'MXN', purchasesOnly: true, waitMinutes: 15, evidenceMovementId: bm.id };
        assert.equal((await configure(action)).status, 409);
        await resolve({ id: bm.id, action: 'link', expenseId: registered.expenseId });
        assert.equal((await configure(action)).status, 409);
        await config.configureCapture(db, user.id, { action: 'automation', cardId: card.id, parserKey: wm.parserKey, mode: 'AUTOMATIC', datePolicy: 'NOTIFICATION_POSTED_AT' });
        assert.equal((await configure(action, 'other')).status, 404);
        assert.equal((await configure(action, 'invalid')).status, 401);
        assert.equal((await configure({ ...action, purchasesOnly: false })).status, 400);
        assert.equal((await configure({ ...action, waitMinutes: 0 })).status, 400);
        const result = await configure(action); assert.equal(result.status, 200, JSON.stringify(result.body));
        const policy = await db.captureBankFallback.findUnique({ where: { userId_cardId: { userId: user.id, cardId: card.id } } });
        await configure(action); assert.deepEqual(await db.captureBankFallback.findUnique({ where: { id: policy.id } }), policy);
        cards.push({ card, bank, wallet, action, bankKey: bm.parserKey, walletKey: wm.parserKey });
      }
      assert.equal(await count(), 4);
    });
    for (const c of cards) {
      await t.test(`${c.card.name}: antes de 15 minutos no registra; al vencer crea un solo gasto pendiente`, async () => {
        const before = await count(), event = input(c.bank, amount());
        const responses = await Promise.all(Array.from({ length: 8 }, () => post(event)));
        for (const response of responses) assert.equal(response.status, 200);
        const m = await send(event); assert.equal(m.reason, 'BANK_FALLBACK_WAIT'); assert.equal(m.expenseId, null);
        const raw = await db.captureEvent.findFirst({ where: { movementId: m.id } });
        assert.equal(m.fallbackDueAt.getTime() - raw.createdAt.getTime(), 900000);
        await worker.runBankFallbacks(db, { now: new Date(m.fallbackDueAt.getTime() - 1) }); assert.equal(await count(), before);
        const results = await Promise.all(Array.from({ length: 8 }, () => due(m)));
        assert.equal(results.reduce((sum, result) => sum + result.registered, 0), 1);
        const after = await read(m.id), expense = await db.dailyExpense.findUnique({ where: { id: after.expenseId } });
        assert.equal(after.reason, 'BANK_FALLBACK_REGISTERED'); assert.equal(after.fallbackDueAt, null);
        assert.equal(expense.reconciliationStatus, 'PENDING'); assert.equal(expense.cardId, c.card.id);
        assert.equal(expense.date.toISOString().slice(0, 10), m.proposal.date); assert.equal(await count(), before + 1);
        assert.deepEqual(await db.captureEvent.findFirst({ where: { movementId: m.id } }), raw);
        await send(event); await due(m); assert.equal(await count(), before + 1);
      });
      await t.test(`${c.card.name}: banco antes, después y simultáneo con Wallet conserva prioridad y un gasto`, async () => {
        for (const order of ['bank', 'wallet', 'concurrent']) {
          const a = amount(), before = await count(); let b, w;
          if (order === 'bank') { b = await send(input(c.bank, a)); w = await send(input(c.wallet, a)); }
          if (order === 'wallet') { w = await send(input(c.wallet, a)); b = await send(input(c.bank, a)); }
          if (order === 'concurrent') [b, w] = await Promise.all([send(input(c.bank, a)), send(input(c.wallet, a))]);
          assert.equal(w.status, 'REGISTERED'); assert.equal(b.expenseId, null);
          if (b.fallbackDueAt) await due(b);
          assert.equal((await read(b.id)).reason, 'POSSIBLE_DUPLICATE'); assert.equal(await count(), before + 1);
        }
      });
    }
    const c = cards[0], nu = cards[2], santander = cards[3];
    await t.test('Wallet tardío conserva fecha, concepto, notas y monto editados; vinculación explícita no suma gasto', async () => {
      const a = amount(), before = await count(), b = await send(input(c.bank, a)); await due(b);
      const registered = await read(b.id), expense = await db.dailyExpense.update({ where: { id: registered.expenseId }, data: { concept: 'Mi concepto corregido', notes: 'Mi nota personal', date: new Date('2026-10-19T12:00:00Z') } });
      const event = input(c.wallet, a); event.postedAt = '2026-10-21T07:00:00Z'; event.receivedAt = '2026-10-21T07:00:01Z';
      const w = await send(event); assert.equal(w.reason, 'POSSIBLE_DUPLICATE');
      await resolve({ id: w.id, action: 'link', expenseId: expense.id });
      assert.deepEqual(await db.dailyExpense.findUnique({ where: { id: expense.id } }), expense); assert.equal(await count(), before + 1);
      const b2 = await send(input(c.bank, amount())); await due(b2); const r2 = await read(b2.id);
      await db.dailyExpense.update({ where: { id: r2.expenseId }, data: { amount: '999.99' } });
      assert.equal((await send(input(c.wallet, b2.proposal.amount))).reason, 'POSSIBLE_DUPLICATE');
    });
    await t.test('Nu usa día de publicación en México; el retraso de entrega no desplaza el día', async () => {
      const event = input(nu.bank, amount()); event.postedAt = '2026-10-21T05:59:00Z'; event.receivedAt = '2026-10-22T08:00:00Z';
      const b = await send(event); assert.equal(b.proposal.date, '2026-10-20'); await due(b);
      assert.equal((await read(b.id)).status, 'REGISTERED');
    });
    await t.test('Santander no permite saltarse el respaldo activando de nuevo el banco inmediato', async () => {
      await assert.rejects(config.configureCapture(db, user.id, { action: 'automation', cardId: santander.card.id, parserKey: santander.bankKey, mode: 'AUTOMATIC' }), e => e.status === 409);
    });
    await t.test('pausar cancela pendientes; reactivar no procesa avisos antiguos ni reinicia su espera', async () => {
      const b = await send(input(c.bank, amount()));
      assert.equal((await configure({ ...c.action, mode: 'OBSERVATION' })).status, 200);
      assert.equal((await read(b.id)).fallbackDueAt, null);
      const paused = await send(input(c.bank, amount())); assert.equal(paused.reason, 'BANK_FALLBACK_PAUSED');
      await configure(c.action); await due(b); assert.equal((await read(b.id)).expenseId, null); assert.equal((await read(paused.id)).expenseId, null);
      const raw = await db.captureEvent.findFirst({ where: { movementId: paused.id } });
      await resolve({ id: paused.id, action: 'reinterpret' }); assert.equal((await read(paused.id)).fallbackDueAt, null);
      assert.deepEqual(await db.captureEvent.findUnique({ where: { id: raw.id } }), raw);
    });
    await t.test('pausa del teléfono, fuente, Wallet o revocación impide el respaldo pendiente', async () => {
      for (const change of [{ pausedAt: new Date() }, { revokedAt: new Date() }, { pausedPackages: [c.bank.sourcePackage] }, { reportedState: { deliveryPaused: true } }]) {
        const b = await send(input(c.bank, amount())); await db.captureDevice.update({ where: { id: device.id }, data: change });
        await due(b); assert.equal((await read(b.id)).expenseId, null); assert.equal((await read(b.id)).fallbackDueAt, null);
        await db.captureDevice.update({ where: { id: device.id }, data: { pausedAt: null, revokedAt: null, pausedPackages: [], reportedState: {} } });
      }
      const b = await send(input(c.bank, amount())); await config.configureCapture(db, user.id, { action: 'automation', cardId: c.card.id, parserKey: c.walletKey, mode: 'OBSERVATION' });
      await due(b); assert.equal((await read(b.id)).expenseId, null);
      await config.configureCapture(db, user.id, { action: 'automation', cardId: c.card.id, parserKey: c.walletKey, mode: 'AUTOMATIC', datePolicy: 'NOTIFICATION_POSTED_AT' });
    });
    await t.test('corregir o descartar durante la espera detiene el registro automático', async () => {
      const b = await send(input(c.bank, amount()));
      await resolve({ id: b.id, action: 'correct', expectedCorrection: 'null', correction: { cardId: c.card.id, amount: b.proposal.amount, date: b.proposal.date, currency: 'MXN', merchant: 'Revisión personal', categoryId: category.id } });
      await due(b); assert.equal((await read(b.id)).expenseId, null); assert.equal((await read(b.id)).fallbackDueAt, null);
      const d = await send(input(c.bank, amount())); await resolve({ id: d.id, action: 'discard' }); await due(d); assert.equal((await read(d.id)).status, 'DISCARDED');
    });
    await t.test('alias nuevo ambiguo, moneda contradictoria, retiro explícito y formato distinto requieren revisión', async () => {
      const before = await count(), b = await send(input(c.bank, amount()));
      const alias = await db.captureCardAlias.create({ data: { userId: user.id, cardId: cards[1].card.id, sourcePackage: c.bank.sourcePackage, kind: 'DIGITAL', value: '9123', verifiedAt: new Date() } });
      await due(b); assert.equal((await read(b.id)).expenseId, null);
      assert.equal((await send(input(c.bank, amount()))).reason, 'AMBIGUOUS_CARD'); await db.captureCardAlias.delete({ where: { id: alias.id } });
      for (const extra of ['USD', 'CHF', 'BRL', '₹', 'Retiro de efectivo en cajero', 'Retiro en efectivo', 'devolución']) {
        const event = input(c.bank, amount()); event.fields['android.subText'] = extra;
        const m = await send(event); assert.equal(m.fallbackDueAt, null); assert.equal(m.expenseId, null);
      }
      const unknown = input(nu.bank, amount()); unknown.fields = { 'android.title': 'Un formato desconocido', 'android.text': 'Compra $20' };
      assert.equal((await send(unknown)).fallbackDueAt, null); assert.equal(await count(), before);
    });
    await t.test('dos compras bancarias iguales quedan en revisión sin elegir una por importe', async () => {
      const before = await count(), a = amount(), b1 = await send(input(c.bank, a)), b2 = await send(input(c.bank, a));
      assert.equal(b2.reason, 'POSSIBLE_DUPLICATE'); await due(b1); assert.equal((await read(b1.id)).reason, 'POSSIBLE_DUPLICATE'); assert.equal(await count(), before);
    });
    await t.test('revisión del mismo aviso durante la espera detiene el original aunque cambie el importe', async () => {
      const event = input(c.bank, amount()), original = await send(event);
      const revision = input(c.bank, amount()); revision.notificationKeyHash = event.notificationKeyHash;
      assert.equal((await send(revision)).reason, 'NOTIFICATION_REVISION');
      await due(original); assert.equal((await read(original.id)).reason, 'NOTIFICATION_REVISION'); assert.equal((await read(original.id)).expenseId, null);
    });
    await t.test('Wallet sigue registrando con respaldo pausado aunque el banco llegue primero', async () => {
      const a = amount(); await configure({ ...c.action, mode: 'OBSERVATION' });
      const b = await send(input(c.bank, a)); assert.equal(b.reason, 'BANK_FALLBACK_PAUSED');
      assert.equal((await send(input(c.wallet, a))).status, 'REGISTERED'); await configure(c.action);
    });
    await t.test('Wallet y el trabajador concurrentes conservan exactamente un gasto', async () => {
      const a = amount(), before = await count(), b = await send(input(nu.bank, a));
      await Promise.all([send(input(nu.wallet, a)), due(b), due(b)]);
      assert.equal(await count(), before + 1);
    });
    await t.test('fallo transitorio conserva vencimiento y el siguiente proceso recupera sin duplicar', async () => {
      const b = await send(input(nu.bank, amount())), raw = await read(b.id);
      const broken = { captureMovement: db.captureMovement, $transaction: async () => { throw new Error('Corte simulado'); } };
      const failed = await worker.runBankFallbacks(broken, { now: new Date(b.fallbackDueAt) }); assert.ok(failed.failed >= 1);
      assert.deepEqual(await read(b.id), raw); await due(b); assert.equal((await read(b.id)).status, 'REGISTERED');
    });
    await t.test('fallo después de crear el gasto revierte toda la transacción y permite reintento', async () => {
      const before = await count(), b = await send(input(nu.bank, amount()));
      const broken = { captureMovement: db.captureMovement, $transaction: callback => db.$transaction(async tx => callback({ ...tx,
        captureMovement: { ...tx.captureMovement, update: args => args.data.status === 'REGISTERED'
          ? Promise.reject(new Error('Fallo simulado al asociar gasto')) : tx.captureMovement.update(args) },
      })) };
      assert.equal((await worker.runBankFallbacks(broken, { now: new Date(b.fallbackDueAt) })).failed, 1);
      assert.equal(await count(), before); assert.equal((await read(b.id)).reason, 'BANK_FALLBACK_WAIT');
      assert.deepEqual((await read(b.id)).fallbackDueAt, b.fallbackDueAt);
      await due(b); assert.equal(await count(), before + 1);
    });
    await t.test('gasto borrado no resucita al llegar Wallet; otras cuentas y reglas se conservan', async () => {
      const b = await send(input(nu.bank, amount())); await due(b); const r = await read(b.id);
      await processing.archiveCapturedExpense(db, await db.dailyExpense.findUnique({ where: { id: r.expenseId } })); await db.dailyExpense.delete({ where: { id: r.expenseId } });
      const before = await count(); assert.equal((await send(input(nu.wallet, b.proposal.amount))).reason, 'POSSIBLE_DUPLICATE'); assert.equal(await count(), before);
      assert.equal(await db.dailyExpense.count({ where: { userId: other.id } }), 0);
      assert.equal(await db.installmentPurchase.count({ where: { userId: user.id } }), 0);
      assert.equal(await db.capturePaymentPolicy.count({ where: { userId: user.id } }), 0);
    });
    await t.test('endpoint del programador exige secreto, no filtra usuarios y devuelve fallo recuperable', async () => {
      const env = { CRON_SECRET: 's'.repeat(40) }, r = sourceLoader(mocks, { process: { env } })('src/app/api/cron/capture-bank-fallback/route.ts');
      const request = token => new Request('http://localhost/api/cron/capture-bank-fallback', { method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {} });
      assert.equal((await r.POST(request())).status, 401); assert.equal((await r.POST(request('wrong'))).status, 401);
      const response = await r.POST(request(env.CRON_SECRET)); assert.equal(response.status, 200); assert.equal(response.body.users, undefined);
      const brokenRoute = sourceLoader({ ...mocks, '@/lib/captureBankFallbackWorker': { runBankFallbacks: async () => ({ registered: 0, failed: 1, users: [] }) } }, { process: { env } })('src/app/api/cron/capture-bank-fallback/route.ts');
      assert.equal((await brokenRoute.POST(request(env.CRON_SECRET))).status, 503);
    });
  } finally {
    await db.captureBankFallback.deleteMany({ where: { userId: user.id } });
    await db.user.deleteMany({ where: { id: { in: [user.id, other.id] } } }); await db.$disconnect();
  }
});
