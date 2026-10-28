import { array,record as objectValue } from './helpers/dynamic-values';
import { plain,present,sparseCalculations,stringValue } from './helpers/financial-fixtures';

import { routeHandlers,integrationLoader as sourceLoader,withFixtureDb } from './helpers/integration-fixtures';

import { faultingTransactions } from './helpers/financial-persistence';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import assert from "node:assert/strict";
import { randomBytes,randomUUID } from 'node:crypto';
import { test } from 'node:test';

const connectionString = process.env.AFP_TEST_DATABASE_URL;

test("Captura PostgreSQL: vinculación, recepción y autorización completa", { skip: !connectionString }, async t => {
  const url = new URL(present(connectionString));
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && /^\/afp_test[a-zA-Z0-9_]*$/.test(url.pathname) && !url.search);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const users = await Promise.all(["a", "b"].map(name => db.user.create({ data: { email: `capture-${name}-${randomUUID()}@example.test` } })));
  const sessions = new Map([["a", users[0]], ["b", users[1]]]);
  const ids: string[] = [];
  const load = sourceLoader({
    "@/lib/prisma": { prisma: db },
    "next/server": { NextResponse: { json: (body: unknown, options = {}) => ({ body: plain(body), status: options.status || 200, headers: new Headers(options.headers) }) } },
    "@supabase/supabase-js": { createClient: () => ({ auth: { getUser: async token => ({ data: { user: sessions.get(token) }, error: sessions.has(token) ? null : new Error("expired") }) } }) },
  });
  const routes = Object.fromEntries(["pairings", "devices", "device", "events"].map(name => [name, routeHandlers(load(`src/app/api/captures/${name}/route`))]));
  const call = (route: string, method: string, auth: string | null, body?: unknown) => present(present(routes[route])[method])(new Request(`http://localhost/api/captures/${route}?userId=${present(users[1]).id}`, {
    method, headers: { ...(auth ? { authorization: auth } : {}), "Content-Type": "application/json", "x-forwarded-for": "capture-integration" },
    ...(body !== undefined && !["GET", "HEAD"].includes(method) ? { body: JSON.stringify(body) } : {}),
  }));
  async function start() {
    const secret = randomBytes(32).toString("base64url");
    const response = await call("pairings", "POST", null, { secret, name: "Teléfono sintético" });
    assert.equal(response.status, 200);
    ids.push(stringValue(response.body.deviceId));
    return { deviceId: stringValue(response.body.deviceId), code: stringValue(response.body.code), expiresAt: stringValue(response.body.expiresAt), secret, credential: `Capture ${response.body.deviceId}.${secret}` };
  }
  const event = () => ({ contractVersion: 1 as const, eventId: randomUUID(), sourcePackage: "com.bancomer.mbanking",
    notificationKeyHash: "b".repeat(64), postedAt: "2026-10-21T01:00:00Z", receivedAt: "2026-10-21T01:00:01Z",
    fields: { "android.title": "Prueba", "android.text": "Aviso ficticio $12.34" } });
  try {
    let phone: Awaited<ReturnType<typeof start>> | undefined;
    await t.test("todos los métodos administrativos y nativos rechazan credenciales ausentes o de otro ámbito", async () => {
      for (const [route, method] of [["pairings", "PATCH"], ["devices", "GET"], ["devices", "PATCH"],
        ["device", "GET"], ["device", "POST"], ["device", "DELETE"], ["events", "POST"]] as const) {
        for (const auth of [null, "Bearer expired", "Capture invalid"] as const) assert.equal((await call(route, method, auth, {})).status, 401);
      }
    });
    await t.test("inicio público idempotente guarda solo hashes y mantiene el vencimiento original", async () => {
      phone = await start();
      const again = await call("pairings", "POST", null, { secret: phone.secret, name: "Otro nombre" });
      assert.deepEqual(again.body, { deviceId: phone.deviceId, code: phone.code, expiresAt: phone.expiresAt });
      const stored = await db.captureDevice.findUnique({ where: { id: phone.deviceId }, include: { pairing: true } });
      assert.equal(present(stored).userId, null);
      assert.ok(!JSON.stringify(stored).includes(phone.secret) && !JSON.stringify(stored).includes(phone.code));
      assert.ok(new Date(phone.expiresAt).getTime() - present(stored).createdAt.getTime() <= 300000);
      const simultaneous = await Promise.all(Array.from({ length: 4 }, () => call("pairings", "POST", null, { secret: present(phone).secret, name: "Prueba" })));
      for (const response of simultaneous) { assert.equal(response.status, 200); assert.equal(response.body.deviceId, phone.deviceId); }
      assert.equal((await call("device", "GET", phone.credential)).body.state, "PENDING");
      assert.equal((await call("events", "POST", phone.credential, event())).status, 403);
    });
    await t.test("autorizar consume el código una sola vez e ignora identidad suministrada por el cliente", async () => {
      const response = await call("pairings", "PATCH", "Bearer a", { code: present(phone).code, userId: present(users[1]).id, deviceId: randomUUID() });
      assert.equal(response.status, 200);
      assert.equal(present((await db.captureDevice.findUnique({ where: { id: present(phone).deviceId } }))).userId, present(users[0]).id);
      assert.equal((await call("pairings", "PATCH", "Bearer b", { code: present(phone).code })).status, 400);
      assert.equal(array((await call("devices", "GET", "Bearer b")).body.devices).length, 0);
      const list = await call("devices", "GET", "Bearer a");
      assert.equal(array(list.body.devices).length, 1);
      assert.ok(!JSON.stringify(list.body).includes("secretHash"));
      assert.equal(present(list.headers).get("cache-control"), "private, no-store");
      assert.equal(present(list.headers).get("vary"), "Authorization");
      assert.equal((await call("devices", "GET", present(phone).credential)).status, 401);
    });
    await t.test("dos autorizaciones concurrentes de cuentas diferentes dejan un único propietario", async () => {
      const other = await start();
      const results = await Promise.all(["a", "b"].map(token => call("pairings", "PATCH", `Bearer ${token}`, { code: other.code })));
      assert.deepEqual(results.map(row => row.status).sort(), [200, 400]);
      const owner = present((await db.captureDevice.findUnique({ where: { id: other.deviceId } }))).userId;
      assert.equal(owner, present(users[present(results[0]).status === 200 ? 0 : 1]).id);
      await assert.rejects(db.captureDevice.update({ where: { id: other.deviceId }, data: { userId: present(users.find(user => user.id !== owner)).id } }));
    });
    await t.test("código vencido no autoriza y reintentarlo no extiende su vigencia", async () => {
      const old = await start();
      await db.capturePairing.update({ where: { deviceId: old.deviceId }, data: { expiresAt: new Date(Date.now() - 1) } });
      assert.equal((await call("pairings", "PATCH", "Bearer a", { code: old.code })).status, 400);
      assert.equal((await call("pairings", "POST", null, { secret: old.secret, name: "Prueba" })).status, 410);
      assert.equal((await call("device", "GET", old.credential)).body.state, "EXPIRED");
      assert.equal((await call("events", "POST", old.credential, event())).status, 403);
      const canceled = await start();
      assert.equal((await call("device", "DELETE", canceled.credential)).status, 200);
      assert.equal((await call("pairings", "PATCH", "Bearer a", { code: canceled.code })).status, 400);
      assert.equal(present((await db.captureDevice.findUnique({ where: { id: canceled.deviceId } }))).userId, null);
    });
    await t.test("ocho envíos concurrentes y una respuesta perdida conservan un solo evento y recibo", async () => {
      const input = event();
      const responses = await Promise.all(Array.from({ length: 8 }, () => call("events", "POST", present(phone).credential, input)));
      assert.ok(responses.every(row => row.status === 200));
      for (const response of responses) assert.deepEqual(response.body, present(responses[0]).body);
      const replay = await call("events", "POST", present(phone).credential, { ...input, fields: { "android.text": input.fields["android.text"], "android.title": input.fields["android.title"] } });
      assert.deepEqual(replay.body, present(responses[0]).body);
      assert.equal(await db.captureEvent.count({ where: { deviceId: present(phone).deviceId } }), 1);
      assert.equal(present((await db.captureEvent.findFirst({ where: { deviceId: present(phone).deviceId } }))).userId, present(users[0]).id);
      assert.equal((await call("events", "POST", present(phone).credential, { ...input, fields: {} })).status, 409);
      assert.equal(await db.dailyExpense.count({ where: { userId: present(users[0]).id } }), 0);
    });
    await t.test("sesión web cerrada o vencida no invalida la credencial del teléfono", async () => {
      sessions.delete("a");
      assert.equal((await call("devices", "GET", "Bearer a")).status, 401);
      const status = await call("device", "GET", present(phone).credential);
      assert.equal(status.body.ownerId, present(users[0]).id);
      assert.equal(objectValue(status.body.configuration).automaticExpenses, false);
      assert.equal((await call("events", "POST", present(phone).credential, event())).status, 200);
      sessions.set("a", users[0]);
    });
    await t.test("otra cuenta no pausa ni revoca y la credencial no accede a datos financieros", async () => {
      for (const action of ["pause", "resume", "revoke"] as const) assert.equal((await call("devices", "PATCH", "Bearer b", { deviceId: present(phone).deviceId, action })).status, 404);
      const expenses = load("src/app/api/expenses/route.ts");
      const response = await expenses.GET(new Request("http://localhost/api/expenses", { headers: { authorization: present(phone).credential } }));
      assert.equal(response.status, 401);
      assert.equal((await call("events", "POST", `Capture ${present(phone).deviceId}.${randomBytes(32).toString("base64url")}`, event())).status, 401);
      assert.equal((await call("events", "POST", present(phone).credential, { ...event(), userId: present(users[1]).id })).status, 400);
    });
    await t.test("pausa y reanudación explícitas desde web y teléfono", async () => {
      assert.equal((await call("devices", "PATCH", "Bearer a", { deviceId: present(phone).deviceId, action: "pause" })).status, 200);
      assert.equal((await call("events", "POST", present(phone).credential, event())).status, 403);
      assert.equal((await call("device", "GET", present(phone).credential)).body.state, "PAUSED");
      assert.equal((await call("device", "POST", present(phone).credential, { action: "resume" })).body.state, "ACTIVE");
      assert.equal((await call("device", "POST", present(phone).credential, { action: "pause" })).body.state, "PAUSED");
      assert.equal((await call("devices", "PATCH", "Bearer a", { deviceId: present(phone).deviceId, action: "resume" })).status, 200);
    });
    await t.test("viajes y pedidos: once fuentes, recepción idempotente, pausa por fuente y evidencia sin gastos", async () => {
      const { capturePackages } = sparseCalculations(load("src/lib/captureProtocol.ts"));
      const { reviewOnlyCapturePackages } = load("src/lib/captureSourcePolicy.ts");
      const state = { action: "report", version: 1, active: true, listenerConnected: true, notificationAccess: true,
        batteryExempt: true, deliveryPaused: false, selectedPackages: [...capturePackages], pausedPackages: [] };
      for (const selectedPackages of [[], capturePackages.slice(0, 8), capturePackages] as const) {
        assert.equal((await call("device", "POST", present(phone).credential, { ...state, selectedPackages })).status, 200);
        assert.deepEqual(objectValue(present(present((await db.captureDevice.findUnique({ where: { id: present(phone).deviceId } }))).reportedState)).selectedPackages, Array.from(selectedPackages));
      }
      assert.equal((await call("device", "POST", present(phone).credential, { ...state, pausedPackages: capturePackages })).status, 200);
      assert.equal((await call("device", "POST", present(phone).credential, { ...state, selectedPackages: [...capturePackages, "com.ubercab.driver"] })).status, 400);
      assert.equal((await call("device", "POST", present(phone).credential, state)).status, 200);
      for (const sourcePackage of reviewOnlyCapturePackages) {
        const input = { ...event(), sourcePackage };
        assert.equal((await call("devices", "PATCH", "Bearer b", { deviceId: present(phone).deviceId, action: "source", sourcePackage, paused: true })).status, 404);
        assert.equal((await call("devices", "PATCH", "Bearer a", { deviceId: present(phone).deviceId, action: "source", sourcePackage, paused: true })).status, 200);
        assert.ok(array(objectValue((await call("device", "GET", present(phone).credential)).body.configuration).pausedPackages).includes(sourcePackage));
        assert.equal((await call("devices", "PATCH", "Bearer a", { deviceId: present(phone).deviceId, action: "source", sourcePackage, paused: false })).status, 200);
        const first = await call("events", "POST", present(phone).credential, input);
        assert.equal(first.status, 200);
        assert.deepEqual((await call("events", "POST", present(phone).credential, input)).body, first.body);
        assert.equal((await call("events", "POST", present(phone).credential, { ...input, fields: {} })).status, 409);
        const stored = await db.captureEvent.findUnique({ where: { deviceId_eventId: { deviceId: present(phone).deviceId, eventId: input.eventId } }, include: { movement: true } });
        assert.equal(present(stored).userId, present(users[0]).id);
        assert.deepEqual(present(stored).fields, input.fields);
        assert.equal(present(present(stored).movement).reason, "SERVICE_NOTICE_REVIEW");
        assert.equal(present(present(stored).movement).status, "REVIEW");
        assert.equal(present(present(stored).movement).cardId, null);
        assert.equal(present(present(stored).movement).amount, null);
        assert.equal(present(present(stored).movement).expenseId, null);
      }
      assert.equal(await db.dailyExpense.count({ where: { userId: present(users[0]).id } }), 0);
    });
    await t.test("fallo después de persistir revierte la transacción y no devuelve recibo", async () => {
      const service = load("src/lib/captureService.ts"), protocol = sparseCalculations(load("src/lib/captureProtocol.ts"));
      const input = protocol.validateCaptureEvent(event());
      const failing = faultingTransactions(db, { after(model, method) { if (model === 'captureEvent' && method === 'create') throw new Error('fallo tras escribir'); } }, false);
      await assert.rejects(withFixtureDb(service.receiveCaptureEvent, failing, { id: present(phone).deviceId, secretHash: protocol.captureHash(present(phone).secret) }, input), /fallo tras escribir/);
      assert.equal(await db.captureEvent.count({ where: { deviceId: present(phone).deviceId, eventId: input.eventId } }), 0);
    });
    await t.test("revocación concurrente serializa recepción, bloquea reintentos y conserva propietario", async () => {
      const input = event();
      const [received, revoked] = await Promise.all([
        call("events", "POST", present(phone).credential, input),
        call("devices", "PATCH", "Bearer a", { deviceId: present(phone).deviceId, action: "revoke" }),
      ]);
      assert.ok([200, 401].includes(received.status)); assert.equal(revoked.status, 200);
      const count = await db.captureEvent.count({ where: { deviceId: present(phone).deviceId } });
      assert.equal((await call("events", "POST", present(phone).credential, input)).status, 401);
      assert.equal((await call("device", "GET", present(phone).credential)).body.state, "REVOKED");
      assert.equal((await call("devices", "PATCH", "Bearer a", { deviceId: present(phone).deviceId, action: "resume" })).status, 409);
      assert.equal((await call("pairings", "PATCH", "Bearer b", { code: present(phone).code })).status, 400);
      assert.equal((await call("device", "DELETE", present(phone).credential)).status, 200);
      assert.equal(await db.captureEvent.count({ where: { deviceId: present(phone).deviceId, userId: present(users[0]).id } }), count);
    });
    await t.test("límites persistentes contabilizan intentos fallidos y devuelven Retry-After", async () => {
      let response;
      for (let i = 0; i < 11; i++) response = await call("pairings", "PATCH", "Bearer b", { code: "0000-0000-0000" });
      assert.equal(present(response).status, 429); assert.ok(Number(present(present(response).headers).get("Retry-After")) > 0);
      const service = load("src/lib/captureService.ts"), protocol = sparseCalculations(load("src/lib/captureProtocol.ts"));
      const identity = randomUUID(), time = new Date("2026-01-01T00:00:00Z");
      try {
        const results = await Promise.allSettled(Array.from({ length: 8 }, () => service.limitCaptureAttempts(db, "test", identity, 3, time)));
        assert.equal(results.filter(row => row.status === "fulfilled").length, 3);
        await service.limitCaptureAttempts(db, "test", identity, 3, new Date(time.getTime() + 300000));
      } finally { await db.captureRateLimit.deleteMany({ where: { key: protocol.captureHash(`test:${identity}`) } }); }
    });
  } finally {
    await db.captureDevice.deleteMany({ where: { id: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: users.map(row => row.id) } } });
    const { captureHash } = sparseCalculations(load("src/lib/captureProtocol.ts"));
    await db.captureRateLimit.deleteMany({ where: { key: { in: [captureHash("start-global:all"), captureHash("start-address:capture-integration"),
      ...users.map(user => captureHash(`approve-user:${user.id}`)), ...ids.map(id => captureHash(`device:${id}`))] } } });
    await db.$disconnect();
  }
});
