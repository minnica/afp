const assert = require("node:assert/strict");
const { test } = require("node:test");
const { randomBytes, randomUUID } = require("node:crypto");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { sourceLoader } = require("./helpers/load-source.cjs");
const connectionString = process.env.AFP_TEST_DATABASE_URL;

test("Captura PostgreSQL: vinculación, recepción y autorización completa", { skip: !connectionString }, async t => {
  const url = new URL(connectionString);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && /^\/afp_test[a-zA-Z0-9_]*$/.test(url.pathname) && !url.search);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const users = await Promise.all(["a", "b"].map(name => db.user.create({ data: { email: `capture-${name}-${randomUUID()}@example.test` } })));
  const sessions = new Map([["a", users[0]], ["b", users[1]]]);
  const ids = [];
  const load = sourceLoader({
    "@/lib/prisma": { prisma: db },
    "next/server": { NextResponse: { json: (body, options = {}) => ({ body: JSON.parse(JSON.stringify(body)), status: options.status || 200, headers: new Headers(options.headers) }) } },
    "@supabase/supabase-js": { createClient: () => ({ auth: { getUser: async token => ({ data: { user: sessions.get(token) }, error: sessions.has(token) ? null : new Error("expired") }) } }) },
  });
  const routes = Object.fromEntries(["pairings", "devices", "device", "events"].map(name => [name, load(`src/app/api/captures/${name}/route.js`)]));
  const call = (route, method, auth, body) => routes[route][method](new Request(`http://localhost/api/captures/${route}?userId=${users[1].id}`, {
    method, headers: { ...(auth ? { authorization: auth } : {}), "Content-Type": "application/json", "x-forwarded-for": "capture-integration" },
    ...(body !== undefined && !["GET", "HEAD"].includes(method) ? { body: JSON.stringify(body) } : {}),
  }));
  async function start() {
    const secret = randomBytes(32).toString("base64url");
    const response = await call("pairings", "POST", null, { secret, name: "Teléfono sintético" });
    assert.equal(response.status, 200);
    ids.push(response.body.deviceId);
    return { ...response.body, secret, credential: `Capture ${response.body.deviceId}.${secret}` };
  }
  const event = () => ({ contractVersion: 1, eventId: randomUUID(), sourcePackage: "com.bancomer.mbanking",
    notificationKeyHash: "b".repeat(64), postedAt: "2026-10-21T01:00:00Z", receivedAt: "2026-10-21T01:00:01Z",
    fields: { "android.title": "Prueba", "android.text": "Aviso ficticio $12.34" } });
  try {
    let phone;
    await t.test("todos los métodos administrativos y nativos rechazan credenciales ausentes o de otro ámbito", async () => {
      for (const [route, method] of [["pairings", "PATCH"], ["devices", "GET"], ["devices", "PATCH"],
        ["device", "GET"], ["device", "POST"], ["device", "DELETE"], ["events", "POST"]]) {
        for (const auth of [null, "Bearer expired", "Capture invalid"]) assert.equal((await call(route, method, auth, {})).status, 401);
      }
    });
    await t.test("inicio público idempotente guarda solo hashes y mantiene el vencimiento original", async () => {
      phone = await start();
      const again = await call("pairings", "POST", null, { secret: phone.secret, name: "Otro nombre" });
      assert.deepEqual(again.body, { deviceId: phone.deviceId, code: phone.code, expiresAt: phone.expiresAt });
      const stored = await db.captureDevice.findUnique({ where: { id: phone.deviceId }, include: { pairing: true } });
      assert.equal(stored.userId, null);
      assert.ok(!JSON.stringify(stored).includes(phone.secret) && !JSON.stringify(stored).includes(phone.code));
      assert.ok(new Date(phone.expiresAt) - stored.createdAt <= 300000);
      const simultaneous = await Promise.all(Array.from({ length: 4 }, () => call("pairings", "POST", null, { secret: phone.secret, name: "Prueba" })));
      for (const response of simultaneous) { assert.equal(response.status, 200); assert.equal(response.body.deviceId, phone.deviceId); }
      assert.equal((await call("device", "GET", phone.credential)).body.state, "PENDING");
      assert.equal((await call("events", "POST", phone.credential, event())).status, 403);
    });
    await t.test("autorizar consume el código una sola vez e ignora identidad suministrada por el cliente", async () => {
      const response = await call("pairings", "PATCH", "Bearer a", { code: phone.code, userId: users[1].id, deviceId: randomUUID() });
      assert.equal(response.status, 200);
      assert.equal((await db.captureDevice.findUnique({ where: { id: phone.deviceId } })).userId, users[0].id);
      assert.equal((await call("pairings", "PATCH", "Bearer b", { code: phone.code })).status, 400);
      assert.equal((await call("devices", "GET", "Bearer b")).body.devices.length, 0);
      const list = await call("devices", "GET", "Bearer a");
      assert.equal(list.body.devices.length, 1);
      assert.ok(!JSON.stringify(list.body).includes("secretHash"));
      assert.equal(list.headers.get("cache-control"), "private, no-store");
      assert.equal(list.headers.get("vary"), "Authorization");
      assert.equal((await call("devices", "GET", phone.credential)).status, 401);
    });
    await t.test("dos autorizaciones concurrentes de cuentas diferentes dejan un único propietario", async () => {
      const other = await start();
      const results = await Promise.all(["a", "b"].map(token => call("pairings", "PATCH", `Bearer ${token}`, { code: other.code })));
      assert.deepEqual(results.map(row => row.status).sort(), [200, 400]);
      const owner = (await db.captureDevice.findUnique({ where: { id: other.deviceId } })).userId;
      assert.equal(owner, users[results[0].status === 200 ? 0 : 1].id);
      await assert.rejects(db.captureDevice.update({ where: { id: other.deviceId }, data: { userId: users.find(user => user.id !== owner).id } }));
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
      assert.equal((await db.captureDevice.findUnique({ where: { id: canceled.deviceId } })).userId, null);
    });
    await t.test("ocho envíos concurrentes y una respuesta perdida conservan un solo evento y recibo", async () => {
      const input = event();
      const responses = await Promise.all(Array.from({ length: 8 }, () => call("events", "POST", phone.credential, input)));
      assert.ok(responses.every(row => row.status === 200));
      for (const response of responses) assert.deepEqual(response.body, responses[0].body);
      const replay = await call("events", "POST", phone.credential, { ...input, fields: { "android.text": input.fields["android.text"], "android.title": input.fields["android.title"] } });
      assert.deepEqual(replay.body, responses[0].body);
      assert.equal(await db.captureEvent.count({ where: { deviceId: phone.deviceId } }), 1);
      assert.equal((await db.captureEvent.findFirst({ where: { deviceId: phone.deviceId } })).userId, users[0].id);
      assert.equal((await call("events", "POST", phone.credential, { ...input, fields: {} })).status, 409);
      assert.equal(await db.dailyExpense.count({ where: { userId: users[0].id } }), 0);
    });
    await t.test("sesión web cerrada o vencida no invalida la credencial del teléfono", async () => {
      sessions.delete("a");
      assert.equal((await call("devices", "GET", "Bearer a")).status, 401);
      const status = await call("device", "GET", phone.credential);
      assert.equal(status.body.ownerId, users[0].id);
      assert.equal(status.body.configuration.automaticExpenses, false);
      assert.equal((await call("events", "POST", phone.credential, event())).status, 200);
      sessions.set("a", users[0]);
    });
    await t.test("otra cuenta no pausa ni revoca y la credencial no accede a datos financieros", async () => {
      for (const action of ["pause", "resume", "revoke"]) assert.equal((await call("devices", "PATCH", "Bearer b", { deviceId: phone.deviceId, action })).status, 404);
      const expenses = load("src/app/api/expenses/route.js");
      const response = await expenses.GET(new Request("http://localhost/api/expenses", { headers: { authorization: phone.credential } }));
      assert.equal(response.status, 401);
      assert.equal((await call("events", "POST", `Capture ${phone.deviceId}.${randomBytes(32).toString("base64url")}`, event())).status, 401);
      assert.equal((await call("events", "POST", phone.credential, { ...event(), userId: users[1].id })).status, 400);
    });
    await t.test("pausa y reanudación explícitas desde web y teléfono", async () => {
      assert.equal((await call("devices", "PATCH", "Bearer a", { deviceId: phone.deviceId, action: "pause" })).status, 200);
      assert.equal((await call("events", "POST", phone.credential, event())).status, 403);
      assert.equal((await call("device", "GET", phone.credential)).body.state, "PAUSED");
      assert.equal((await call("device", "POST", phone.credential, { action: "resume" })).body.state, "ACTIVE");
      assert.equal((await call("device", "POST", phone.credential, { action: "pause" })).body.state, "PAUSED");
      assert.equal((await call("devices", "PATCH", "Bearer a", { deviceId: phone.deviceId, action: "resume" })).status, 200);
    });
    await t.test("fallo después de persistir revierte la transacción y no devuelve recibo", async () => {
      const service = load("src/lib/captureService.js"), protocol = load("src/lib/captureProtocol.js");
      const input = protocol.validateCaptureEvent(event());
      const failing = { $transaction: fn => db.$transaction(tx => fn(new Proxy(tx, { get(target, key) {
        if (key === "captureEvent") return new Proxy(target.captureEvent, { get(model, method) {
          if (method === "create") return async args => { await model.create(args); throw new Error("fallo tras escribir"); };
          return model[method];
        } });
        return target[key];
      } }))) };
      await assert.rejects(service.receiveCaptureEvent(failing, { id: phone.deviceId, secretHash: protocol.captureHash(phone.secret) }, input), /fallo tras escribir/);
      assert.equal(await db.captureEvent.count({ where: { deviceId: phone.deviceId, eventId: input.eventId } }), 0);
    });
    await t.test("revocación concurrente serializa recepción, bloquea reintentos y conserva propietario", async () => {
      const input = event();
      const [received, revoked] = await Promise.all([
        call("events", "POST", phone.credential, input),
        call("devices", "PATCH", "Bearer a", { deviceId: phone.deviceId, action: "revoke" }),
      ]);
      assert.ok([200, 401].includes(received.status)); assert.equal(revoked.status, 200);
      const count = await db.captureEvent.count({ where: { deviceId: phone.deviceId } });
      assert.equal((await call("events", "POST", phone.credential, input)).status, 401);
      assert.equal((await call("device", "GET", phone.credential)).body.state, "REVOKED");
      assert.equal((await call("devices", "PATCH", "Bearer a", { deviceId: phone.deviceId, action: "resume" })).status, 409);
      assert.equal((await call("pairings", "PATCH", "Bearer b", { code: phone.code })).status, 400);
      assert.equal((await call("device", "DELETE", phone.credential)).status, 200);
      assert.equal(await db.captureEvent.count({ where: { deviceId: phone.deviceId, userId: users[0].id } }), count);
    });
    await t.test("límites persistentes contabilizan intentos fallidos y devuelven Retry-After", async () => {
      let response;
      for (let i = 0; i < 11; i++) response = await call("pairings", "PATCH", "Bearer b", { code: "0000-0000-0000" });
      assert.equal(response.status, 429); assert.ok(Number(response.headers.get("Retry-After")) > 0);
      const service = load("src/lib/captureService.js"), protocol = load("src/lib/captureProtocol.js");
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
    const { captureHash } = load("src/lib/captureProtocol.js");
    await db.captureRateLimit.deleteMany({ where: { key: { in: [captureHash("start-global:all"), captureHash("start-address:capture-integration"),
      ...users.map(user => captureHash(`approve-user:${user.id}`)), ...ids.map(id => captureHash(`device:${id}`))] } } });
    await db.$disconnect();
  }
});
