import fs from 'node:fs';
import path from 'node:path';
import { plain,present,sparseCalculations,stringValue } from './helpers/financial-fixtures';
import { noticeSample,parseJson } from './helpers/integration-fixtures';

import type { CaptureInput,IntegrationMocks,NoticeSample } from './helpers/integration-fixtures';

import { record as objectValue } from './helpers/dynamic-values';
import { faultingTransactions } from './helpers/financial-persistence';
import { integrationLoader as sourceLoader,withFixtureDb } from './helpers/integration-fixtures';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { test } from 'node:test';

const fixture = (name: string) => noticeSample(objectValue(parseJson(fs.readFileSync(path.join(__dirname, `fixtures/captures/${name}.json`), 'utf8'))).event);
const connectionString = process.env.AFP_TEST_DATABASE_URL;

test('Wallet principal y respaldo bancario persistente: API y PostgreSQL', { skip: !connectionString }, async t => {
  const url = new URL(present(connectionString));
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && /^\/afp_test\w*$/.test(url.pathname) && !url.search);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const user = await db.user.create({ data: { email: `fallback-${randomUUID()}@example.test` } });
  const other = await db.user.create({ data: { email: `fallback-other-${randomUUID()}@example.test` } });
  const mocks: IntegrationMocks = { '@/lib/prisma': { prisma: db }, '@/lib/calendar/schedule': { scheduleCalendarSync: () => {} },
    'next/server': { NextResponse: { json: (body: unknown, options = {}) => ({ body: plain(body), status: options.status || 200, headers: new Headers(options.headers) }) } },
    '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async token => ({ data: { user: token === 'owner' ? user : token === 'other' ? other : null }, error: null }) } }) },
  };
  const load = sourceLoader(mocks), protocol = sparseCalculations(load('src/lib/captureProtocol.ts')), config = load('src/lib/captureConfiguration.ts');
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
  ] as const;
  const cards: { card: import('@prisma/client').Card; bank: NoticeSample['event']; wallet: NoticeSample['event']; action: Record<string, unknown>; bankKey: string | null; walletKey: string | null }[] = [];
  const input = (sample: NoticeSample['event'], amount: string) => ({ ...sample, contractVersion: 1 as const, eventId: randomUUID(), notificationKeyHash: protocol.captureHash(randomUUID()),
    fields: Object.fromEntries(Object.entries(sample.fields).map(([key, value]) => [key, value.replaceAll('123.45', amount)])) });
  const read = (id: string) => db.captureMovement.findUnique({ where: { id } });
  const post = (event: unknown) => route.POST(new Request('http://localhost/api/captures/events', { method: 'POST', headers: { authorization: `Capture ${device.id}.${secret}`, 'Content-Type': 'application/json' }, body: JSON.stringify(event) }));
  const send = async (event: CaptureInput) => { const response = await post(event); assert.equal(response.status, 200, JSON.stringify(response.body)); return present((await db.captureEvent.findUnique({ where: { deviceId_eventId: { deviceId: device.id, eventId: event.eventId } }, include: { movement: true } }))).movement; };
  const configure = (body: unknown, token = 'owner') => configRoute.PATCH(new Request('http://localhost/api/captures/configuration', { method: 'PATCH', headers: { authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
  const resolve = (body: unknown) => processing.resolveCaptureMovement(db, user.id, body);
  const count = () => db.dailyExpense.count({ where: { userId: user.id } });
  const due = async (movement: import('@prisma/client').CaptureMovement | null | import('@prisma/client').CaptureMovement | null | undefined) => worker.runBankFallbacks(db, { now: new Date(present(present(movement).fallbackDueAt)) });
  let n = 200;
  const amount = () => `${++n}.01`;
  try {
    await t.test('activación por tarjeta exige Wallet, alias inequívoco y muestra bancaria cotejada propia', async () => {
      for (const [name, bankName, walletName, alias] of cases) {
        const card = await db.card.create({ data: { userId: user.id, name, usualCutDay: 25, usualDueDay: 15 } });
        const bank = fixture(bankName), wallet = fixture(walletName);
        await config.configureCapture(db, user.id, { action: 'alias', cardId: card.id, sourcePackage: present(bank).sourcePackage, kind: 'PHYSICAL', value: alias, verified: true, evidence: 'Muestra ficticia local' });
        const wm = await send(input(wallet, '123.45'));
        await resolve({ id: present(wm).id, action: 'correct', expectedCorrection: 'null', correction: { cardId: card.id, amount: '123.45', date: objectValue(present(present(wm).proposal)).date, currency: 'MXN', merchant: objectValue(present(present(wm).proposal)).merchant, categoryId: category.id } });
        const registered = await resolve({ id: present(wm).id, action: 'register' });
        await db.dailyExpense.update({ where: { id: present(present(registered).expenseId) }, data: { reconciledAt: new Date(), reconciliationStatus: 'CONFIRMED' } });
        const bm = await send(input(bank, '123.45'));
        const action = { action: 'bankFallback', cardId: card.id, bankSourcePackage: present(bank).sourcePackage, bankDatePolicy: present(name).startsWith('Nu') ? 'NOTIFICATION_POSTED_AT' : 'BANK_OPERATION', mode: 'AUTOMATIC', currency: 'MXN', purchasesOnly: true, waitMinutes: 15, evidenceMovementId: present(bm).id };
        assert.equal((await configure(action)).status, 409);
        await resolve({ id: present(bm).id, action: 'link', expenseId: present(registered).expenseId });
        assert.equal((await configure(action)).status, 409);
        await config.configureCapture(db, user.id, { action: 'automation', cardId: card.id, parserKey: present(wm).parserKey, mode: 'AUTOMATIC', datePolicy: 'NOTIFICATION_POSTED_AT' });
        assert.equal((await configure(action, 'other')).status, 404);
        assert.equal((await configure(action, 'invalid')).status, 401);
        assert.equal((await configure({ ...action, purchasesOnly: false })).status, 400);
        assert.equal((await configure({ ...action, waitMinutes: 0 })).status, 400);
        const result = await configure(action); assert.equal(result.status, 200, JSON.stringify(result.body));
        const policy = await db.captureBankFallback.findUnique({ where: { userId_cardId: { userId: user.id, cardId: card.id } } });
        await configure(action); assert.deepEqual(await db.captureBankFallback.findUnique({ where: { id: present(policy).id } }), policy);
        cards.push({ card, bank, wallet, action, bankKey: present(bm).parserKey, walletKey: present(wm).parserKey });
      }
      assert.equal(await count(), 4);
    });
    for (const c of cards) {
      await t.test(`${c.card.name}: antes de 15 minutos no registra; al vencer crea un solo gasto pendiente`, async () => {
        const before = await count(), event = input(c.bank, amount());
        const responses = await Promise.all(Array.from({ length: 8 }, () => post(event)));
        for (const response of responses) assert.equal(response.status, 200);
        const m = await send(event); assert.equal(present(m).reason, 'BANK_FALLBACK_WAIT'); assert.equal(present(m).expenseId, null);
        const raw = await db.captureEvent.findFirst({ where: { movementId: present(m).id } });
        assert.equal(present(present(m).fallbackDueAt).getTime() - present(raw).createdAt.getTime(), 900000);
        await worker.runBankFallbacks(db, { now: new Date(present(present(m).fallbackDueAt).getTime() - 1) }); assert.equal(await count(), before);
        const results = await Promise.all(Array.from({ length: 8 }, () => due(m)));
        assert.equal(results.reduce((sum, result) => sum + result.registered, 0), 1);
        const after = await read(present(m).id), expense = await db.dailyExpense.findUnique({ where: { id: present(present(after).expenseId) } });
        assert.equal(present(after).reason, 'BANK_FALLBACK_REGISTERED'); assert.equal(present(after).fallbackDueAt, null);
        assert.equal(present(expense).reconciliationStatus, 'PENDING'); assert.equal(present(expense).cardId, c.card.id);
        assert.equal(present(expense).date.toISOString().slice(0, 10), objectValue(present(present(m).proposal)).date); assert.equal(await count(), before + 1);
        assert.deepEqual(await db.captureEvent.findFirst({ where: { movementId: present(m).id } }), raw);
        await send(event); await due(m); assert.equal(await count(), before + 1);
      });
      await t.test(`${c.card.name}: banco antes, después y simultáneo con Wallet conserva prioridad y un gasto`, async () => {
        for (const order of ['bank', 'wallet', 'concurrent'] as const) {
          const a = amount(), before = await count(); let b: import('@prisma/client').CaptureMovement | null | undefined, w: import('@prisma/client').CaptureMovement | null | undefined;
          if (order === 'bank') { b = await send(input(c.bank, a)); w = await send(input(c.wallet, a)); }
          if (order === 'wallet') { w = await send(input(c.wallet, a)); b = await send(input(c.bank, a)); }
          if (order === 'concurrent') [b, w] = await Promise.all([send(input(c.bank, a)), send(input(c.wallet, a))]);
          assert.equal(present(w).status, 'REGISTERED'); assert.equal(present(b).expenseId, null);
          if (present(b).fallbackDueAt) await due(b);
          assert.equal(present((await read(present(b).id))).reason, 'POSSIBLE_DUPLICATE'); assert.equal(await count(), before + 1);
        }
      });
    }
    const c = cards[0], nu = cards[2], santander = cards[3];
    await t.test('Wallet tardío conserva fecha, concepto, notas y monto editados; vinculación explícita no suma gasto', async () => {
      const a = amount(), before = await count(), b = await send(input(present(c).bank, a)); await due(b);
      const registered = await read(present(b).id), expense = await db.dailyExpense.update({ where: { id: present(present(registered).expenseId) }, data: { concept: 'Mi concepto corregido', notes: 'Mi nota personal', date: new Date('2026-10-19T12:00:00Z') } });
      const event = input(present(c).wallet, a); event.postedAt = '2026-10-21T07:00:00Z'; event.receivedAt = '2026-10-21T07:00:01Z';
      const w = await send(event); assert.equal(present(w).reason, 'POSSIBLE_DUPLICATE');
      await resolve({ id: present(w).id, action: 'link', expenseId: expense.id });
      assert.deepEqual(await db.dailyExpense.findUnique({ where: { id: expense.id } }), expense); assert.equal(await count(), before + 1);
      const b2 = await send(input(present(c).bank, amount())); await due(b2); const r2 = await read(present(b2).id);
      await db.dailyExpense.update({ where: { id: present(present(r2).expenseId) }, data: { amount: '999.99' } });
      assert.equal(present((await send(input(present(c).wallet, stringValue(objectValue(present(present(b2).proposal)).amount))))).reason, 'POSSIBLE_DUPLICATE');
    });
    await t.test('Nu usa día de publicación en México; el retraso de entrega no desplaza el día', async () => {
      const event = input(present(nu).bank, amount()); event.postedAt = '2026-10-21T05:59:00Z'; event.receivedAt = '2026-10-22T08:00:00Z';
      const b = await send(event); assert.equal(objectValue(present(present(b).proposal)).date, '2026-10-20'); await due(b);
      assert.equal(present((await read(present(b).id))).status, 'REGISTERED');
    });
    await t.test('Santander no permite saltarse el respaldo activando de nuevo el banco inmediato', async () => {
      await assert.rejects(config.configureCapture(db, user.id, { action: 'automation', cardId: present(santander).card.id, parserKey: present(santander).bankKey, mode: 'AUTOMATIC' }), e => objectValue(e).status === 409);
    });
    await t.test('pausar cancela pendientes; reactivar no procesa avisos antiguos ni reinicia su espera', async () => {
      const b = await send(input(present(c).bank, amount()));
      assert.equal((await configure({ ...present(c).action, mode: 'OBSERVATION' })).status, 200);
      assert.equal(present((await read(present(b).id))).fallbackDueAt, null);
      const paused = await send(input(present(c).bank, amount())); assert.equal(present(paused).reason, 'BANK_FALLBACK_PAUSED');
      await configure(present(c).action); await due(b); assert.equal(present((await read(present(b).id))).expenseId, null); assert.equal(present((await read(present(paused).id))).expenseId, null);
      const raw = await db.captureEvent.findFirst({ where: { movementId: present(paused).id } });
      await resolve({ id: present(paused).id, action: 'reinterpret' }); assert.equal(present((await read(present(paused).id))).fallbackDueAt, null);
      assert.deepEqual(await db.captureEvent.findUnique({ where: { id: present(raw).id } }), raw);
    });
    await t.test('pausa del teléfono, fuente, Wallet o revocación impide el respaldo pendiente', async () => {
      for (const change of [{ pausedAt: new Date() }, { revokedAt: new Date() }, { pausedPackages: [present(c).bank.sourcePackage] }, { reportedState: { deliveryPaused: true } }] as const) {
        const b = await send(input(present(c).bank, amount())); await db.captureDevice.update({ where: { id: device.id }, data: change });
        await due(b); assert.equal(present((await read(present(b).id))).expenseId, null); assert.equal(present((await read(present(b).id))).fallbackDueAt, null);
        await db.captureDevice.update({ where: { id: device.id }, data: { pausedAt: null, revokedAt: null, pausedPackages: [], reportedState: {} } });
      }
      const b = await send(input(present(c).bank, amount())); await config.configureCapture(db, user.id, { action: 'automation', cardId: present(c).card.id, parserKey: present(c).walletKey, mode: 'OBSERVATION' });
      await due(b); assert.equal(present((await read(present(b).id))).expenseId, null);
      await config.configureCapture(db, user.id, { action: 'automation', cardId: present(c).card.id, parserKey: present(c).walletKey, mode: 'AUTOMATIC', datePolicy: 'NOTIFICATION_POSTED_AT' });
    });
    await t.test('corregir o descartar durante la espera detiene el registro automático', async () => {
      const b = await send(input(present(c).bank, amount()));
      await resolve({ id: present(b).id, action: 'correct', expectedCorrection: 'null', correction: { cardId: present(c).card.id, amount: objectValue(present(present(b).proposal)).amount, date: objectValue(present(present(b).proposal)).date, currency: 'MXN', merchant: 'Revisión personal', categoryId: category.id } });
      await due(b); assert.equal(present((await read(present(b).id))).expenseId, null); assert.equal(present((await read(present(b).id))).fallbackDueAt, null);
      const d = await send(input(present(c).bank, amount())); await resolve({ id: present(d).id, action: 'discard' }); await due(d); assert.equal(present((await read(present(d).id))).status, 'DISCARDED');
    });
    await t.test('alias nuevo ambiguo, moneda contradictoria, retiro explícito y formato distinto requieren revisión', async () => {
      const before = await count(), b = await send(input(present(c).bank, amount()));
      const alias = await db.captureCardAlias.create({ data: { userId: user.id, cardId: present(cards[1]).card.id, sourcePackage: present(c).bank.sourcePackage, kind: 'DIGITAL', value: '9123', verifiedAt: new Date() } });
      await due(b); assert.equal(present((await read(present(b).id))).expenseId, null);
      assert.equal(present((await send(input(present(c).bank, amount())))).reason, 'AMBIGUOUS_CARD'); await db.captureCardAlias.delete({ where: { id: alias.id } });
      for (const extra of ['USD', 'CHF', 'BRL', '₹', 'Retiro de efectivo en cajero', 'Retiro en efectivo', 'devolución'] as const) {
        const event = input(present(c).bank, amount()); event.fields['android.subText'] = extra;
        const m = await send(event); assert.equal(present(m).fallbackDueAt, null); assert.equal(present(m).expenseId, null);
      }
      const unknown = input(present(nu).bank, amount()); unknown.fields = { 'android.title': 'Un formato desconocido', 'android.text': 'Compra $20' };
      assert.equal(present((await send(unknown))).fallbackDueAt, null); assert.equal(await count(), before);
    });
    await t.test('dos compras bancarias iguales quedan en revisión sin elegir una por importe', async () => {
      const before = await count(), a = amount(), b1 = await send(input(present(c).bank, a)), b2 = await send(input(present(c).bank, a));
      assert.equal(present(b2).reason, 'POSSIBLE_DUPLICATE'); await due(b1); assert.equal(present((await read(present(b1).id))).reason, 'POSSIBLE_DUPLICATE'); assert.equal(await count(), before);
    });
    await t.test('revisión del mismo aviso durante la espera detiene el original aunque cambie el importe', async () => {
      const event = input(present(c).bank, amount()), original = await send(event);
      const revision = input(present(c).bank, amount()); revision.notificationKeyHash = event.notificationKeyHash;
      assert.equal(present((await send(revision))).reason, 'NOTIFICATION_REVISION');
      await due(original); assert.equal(present((await read(present(original).id))).reason, 'NOTIFICATION_REVISION'); assert.equal(present((await read(present(original).id))).expenseId, null);
    });
    await t.test('Wallet sigue registrando con respaldo pausado aunque el banco llegue primero', async () => {
      const a = amount(); await configure({ ...present(c).action, mode: 'OBSERVATION' });
      const b = await send(input(present(c).bank, a)); assert.equal(present(b).reason, 'BANK_FALLBACK_PAUSED');
      assert.equal(present((await send(input(present(c).wallet, a)))).status, 'REGISTERED'); await configure(present(c).action);
    });
    await t.test('Wallet y el trabajador concurrentes conservan exactamente un gasto', async () => {
      const a = amount(), before = await count(), b = await send(input(present(nu).bank, a));
      await Promise.all([send(input(present(nu).wallet, a)), due(b), due(b)]);
      assert.equal(await count(), before + 1);
    });
    await t.test('fallo transitorio conserva vencimiento y el siguiente proceso recupera sin duplicar', async () => {
      const b = await send(input(present(nu).bank, amount())), raw = await read(present(b).id);
      const broken = { captureMovement: db.captureMovement, $transaction: async () => { throw new Error('Corte simulado'); } };
      const failed = await withFixtureDb(worker.runBankFallbacks, broken, { now: new Date(present(present(b).fallbackDueAt)) }); assert.ok(failed.failed >= 1);
      assert.deepEqual(await read(present(b).id), raw); await due(b); assert.equal(present((await read(present(b).id))).status, 'REGISTERED');
    });
    await t.test('fallo después de crear el gasto revierte toda la transacción y permite reintento', async () => {
      const before = await count(), b = await send(input(present(nu).bank, amount()));
      const broken = faultingTransactions(db, { before(model, method, args) { if (model === 'captureMovement' && method === 'update' && objectValue(objectValue(args).data).status === 'REGISTERED') throw new Error('Fallo simulado al asociar gasto'); } }, false);
      assert.equal((await withFixtureDb(worker.runBankFallbacks, broken, { now: new Date(present(present(b).fallbackDueAt)) })).failed, 1);
      assert.equal(await count(), before); assert.equal(present((await read(present(b).id))).reason, 'BANK_FALLBACK_WAIT');
      assert.deepEqual(present((await read(present(b).id))).fallbackDueAt, present(b).fallbackDueAt);
      await due(b); assert.equal(await count(), before + 1);
    });
    await t.test('gasto borrado no resucita al llegar Wallet; otras cuentas y reglas se conservan', async () => {
      const b = await send(input(present(nu).bank, amount())); await due(b); const r = await read(present(b).id);
      await processing.archiveCapturedExpense(db, present(await db.dailyExpense.findUnique({ where: { id: present(present(r).expenseId) } }))); await db.dailyExpense.delete({ where: { id: present(present(r).expenseId) } });
      const before = await count(); assert.equal(present((await send(input(present(nu).wallet, stringValue(objectValue(present(present(b).proposal)).amount))))).reason, 'POSSIBLE_DUPLICATE'); assert.equal(await count(), before);
      assert.equal(await db.dailyExpense.count({ where: { userId: other.id } }), 0);
      assert.equal(await db.installmentPurchase.count({ where: { userId: user.id } }), 0);
      assert.equal(await db.capturePaymentPolicy.count({ where: { userId: user.id } }), 0);
    });
    await t.test('endpoint del programador exige secreto, no filtra usuarios y devuelve fallo recuperable', async () => {
      const env = { CRON_SECRET: 's'.repeat(40) }, r = sourceLoader(mocks, { process: { env } })('src/app/api/cron/capture-bank-fallback/route.ts');
      const request = (token?: string) => new Request('http://localhost/api/cron/capture-bank-fallback', { method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {} });
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
