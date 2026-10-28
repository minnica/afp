const assert = require("node:assert/strict");
const { test } = require("node:test");
const { randomBytes, randomUUID } = require("node:crypto");
const { sourceLoader } = require("./helpers/load-source.cjs");
const load = sourceLoader({ "next/server": { NextResponse: { json: (body, options) => ({ body, ...options }) } } });
const protocol = load("src/lib/captureProtocol.ts");
const sample = () => ({ contractVersion: 1, eventId: randomUUID(), sourcePackage: "com.bancomer.mbanking",
  notificationKeyHash: "a".repeat(64), postedAt: "2026-10-21T01:02:03Z", receivedAt: "2026-10-21T01:02:04Z",
  fields: { "android.title": "Prueba sintética", "android.text": "Compra ficticia" } });

test("Captura: secreto de 256 bits, código separado y vigencia de cinco minutos", () => {
  const secret = randomBytes(32).toString("base64url");
  assert.equal(protocol.validSecret(secret), true);
  for (const value of [undefined, {}, "a".repeat(42), "a".repeat(44), "-".repeat(43)]) assert.equal(protocol.validSecret(value), false);
  assert.match(protocol.pairingCode(secret), /^[A-F0-9]{12}$/);
  assert.equal(protocol.normalizePairingCode("ab12-cd34 ef56"), "AB12CD34EF56");
  assert.equal(protocol.pairingLifetimeMs, 300000);
});
test("Captura: credencial Capture separada de Bearer y hash en tiempo constante", () => {
  const secret = randomBytes(32).toString("base64url"), id = randomUUID();
  const request = value => ({ headers: new Headers({ authorization: value }) });
  assert.equal(protocol.deviceCredential(request(`Capture ${id}.${secret}`)).secretHash, protocol.captureHash(secret));
  for (const value of [`Bearer ${secret}`, `Capture ${id}.short`, "Capture malformed"]) assert.throws(() => protocol.deviceCredential(request(value)), { status: 401 });
  assert.equal(protocol.sameHash("a".repeat(64), "b".repeat(64)), false);
});
test("Captura: contrato limitado, fechas normalizadas y hash independiente del orden JSON", () => {
  const input = sample();
  assert.deepEqual(JSON.parse(JSON.stringify(protocol.validateCaptureEvent(input))), JSON.parse(JSON.stringify(protocol.validateCaptureEvent({
    ...input, fields: { "android.text": input.fields["android.text"], "android.title": input.fields["android.title"] },
    postedAt: "2026-10-20T19:02:03-06:00",
  }))));
  for (const change of [{ contractVersion: 2 }, { sourcePackage: "other.app" }, { userId: "forged" },
    { eventId: "invalid" }, { receivedAt: "yesterday" }, { fields: { password: "123" } },
    { fields: { "android.text": "a".repeat(4097) } }, { notificationKeyHash: "bad" }]) {
    assert.throws(() => protocol.validateCaptureEvent({ ...input, ...change }), { status: 400 });
  }
});
test("Captura: lectura JSON acotada también sin Content-Length", async () => {
  const request = text => new Request("http://localhost/api/captures/events", { method: "POST", body: text });
  assert.equal((await protocol.readCaptureJson(request('{"x":1}'))).x, 1);
  await assert.rejects(protocol.readCaptureJson(request("{")), { status: 400 });
  await assert.rejects(protocol.readCaptureJson(request("x".repeat(4097))), { status: 413 });
});
test("Captura: propietario y revocación tienen prioridad sobre expiración y pausa", () => {
  const now = new Date();
  const base = { userId: null, pairing: { expiresAt: new Date(now.getTime() + 300000) } };
  assert.equal(protocol.deviceState(base, now), "PENDING");
  assert.equal(protocol.deviceState({ ...base, pairing: { expiresAt: now } }, now), "EXPIRED");
  assert.equal(protocol.deviceState({ ...base, userId: "a" }, now), "ACTIVE");
  assert.equal(protocol.deviceState({ ...base, userId: "a", pausedAt: now }, now), "PAUSED");
  assert.equal(protocol.deviceState({ ...base, userId: "a", revokedAt: now, pausedAt: now }, now), "REVOKED");
});
