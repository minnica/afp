const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createHash, randomUUID, randomBytes } = require("node:crypto");
const { sourceLoader } = require("./helpers/load-source.cjs");

const plain = value => JSON.parse(JSON.stringify(value));
const today = new Date("2026-10-26T12:00:00Z");
class Clock extends Date {
  constructor(...args) { super(...(args.length ? args : [today])); }
  static now() { return today.getTime(); }
}

function fixture() {
  const calls = [];
  const card = { id: "hsbc-1", userId: "a", name: "HSBC 1", usualCutDay: 10 };
  const cycle = { id: "october", userId: "a", cardId: card.id, card, month: 10, year: 2026,
    startDate: "2026-09-11T12:00:00Z", cutDate: "2026-10-10T12:00:00Z", dueDate: "2026-10-26T12:00:00Z",
    statementAmount: 1000, paidAmount: 100, credits: [] };
  const rows = { card: [card], cardCycle: [cycle], dailyExpense: [], subscription: [], installmentPurchase: [],
    receivableAccount: [], noticeDismissal: [], income: [], category: [] };
  const db = Object.fromEntries(Object.keys(rows).map(model => [model, {
    findMany: async ({ where }) => {
      calls.push({ model, where: plain(where) });
      assert.equal(where.userId, "a", `${model} debe limitarse al propietario autenticado`);
      return rows[model].filter(row => row.userId === where.userId && (!where.month || row.month === where.month));
    },
  }]));
  const secret = randomBytes(32).toString("base64url");
  const device = { id: randomUUID(), userId: "a", secretHash: createHash("sha256").update(secret).digest("hex"),
    revokedAt: null, pausedAt: null };
  db.captureDevice = { findUnique: async () => device };
  db.$transaction = async run => run(db);
  db.$queryRaw = async sql => sql.join("").includes("INSERT INTO capture_rate_limits")
    ? [{ count: 1, expiresAt: new Date(today.getTime() + 300_000) }] : [{ id: device.id }];
  const load = sourceLoader({
    "@/lib/prisma": { prisma: db },
    "@/lib/captureProcessing": { processCaptureEvent() { throw new Error("No debe escribir movimientos"); } },
    "@/lib/calendar/schedule": { scheduleCalendarSync() {} },
    "next/server": { NextResponse: { json: (body, options = {}) => ({ body: plain(body), status: options.status || 200, headers: new Headers(options.headers) }) } },
    "@supabase/supabase-js": { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: "a" } } }) } }) },
  }, { Date: Clock });
  const request = (authorization = `Capture ${device.id}.${secret}`, query = "") => ({
    url: `https://example.test/api/captures/notices?userId=b&timeZone=America%2FMexico_City${query}`,
    headers: new Headers({ authorization }),
  });
  return { rows, cycle, card, device, db, load, calls, request };
}

test("avisos Android: mismo pago y saldo del Dashboard, sin exponer registros financieros", async () => {
  const { load, request, rows, card } = fixture();
  rows.card.push({ ...card, id: "other", userId: "b", name: "Tarjeta ajena" });
  const native = await load("src/app/api/captures/notices/route.js").GET(request());
  const dashboard = await load("src/app/api/dashboard/route.js").GET({
    url: "http://localhost/api/dashboard?clientDate=2026-10-26", headers: new Headers({ authorization: "Bearer test" }),
  });
  assert.equal(native.status, 200);
  assert.equal(dashboard.status, 200);
  assert.equal(native.body.notices.length, 1);
  assert.equal(native.body.notices[0].title, "Pago de tarjeta: HSBC 1");
  assert.equal(native.body.notices[0].title, dashboard.body.importantNotices[0].title);
  assert.equal(native.body.notices[0].body, dashboard.body.importantNotices[0].description);
  assert.match(native.body.notices[0].body, /900\.00/);
  assert.equal(native.body.notices[0].path, "/tarjetas");
  assert.deepEqual(Object.keys(native.body).sort(), ["deviceId", "notices", "ownerId", "version"]);
  assert.equal(native.headers.get("cache-control"), "private, no-store");
  assert.equal(native.headers.get("vary"), "Authorization");
});

test("avisos Android: oculta por mes, retira liquidaciones y vuelve a avisar si cambia el saldo", async () => {
  const { load, db, rows, cycle } = fixture();
  const { loadAndroidNotices } = load("src/lib/androidNotices.js");
  const initial = await loadAndroidNotices(db, "a", today);
  const noticeKey = load("src/lib/noticeDismissals.js").getNoticeKey({ type: "CARD_PAYMENT", id: "card-october", date: cycle.dueDate, amount: 900 });
  rows.noticeDismissal.push({ userId: "a", month: "2026-10", noticeKey });
  assert.equal((await loadAndroidNotices(db, "a", today)).length, 0);
  cycle.paidAmount = 300;
  const changed = await loadAndroidNotices(db, "a", today);
  assert.equal(changed.length, 1);
  assert.notEqual(changed[0].key, initial[0].key);
  cycle.paidAmount = 1000;
  assert.equal((await loadAndroidNotices(db, "a", today)).length, 0);
});

test("avisos Android: identidad estable entre consultas, cambia al vencer y al mes siguiente", async () => {
  const { load, db, cycle } = fixture();
  const { loadAndroidNotices } = load("src/lib/androidNotices.js");
  cycle.dueDate = "2026-10-28T12:00:00Z";
  const key = async date => (await loadAndroidNotices(db, "a", new Date(`${date}T12:00:00Z`)))[0].key;
  assert.equal(await key("2026-10-26"), await key("2026-10-26"));
  assert.equal(await key("2026-10-26"), await key("2026-10-27"));
  assert.notEqual(await key("2026-10-27"), await key("2026-10-28"));
  assert.notEqual(await key("2026-10-28"), await key("2026-10-29"));
  assert.notEqual(await key("2026-10-29"), await key("2026-11-01"));
});

test("avisos Android: cálculo sin estado conserva las bonificaciones documentadas del corte", async () => {
  const { load, db, rows, cycle, card } = fixture();
  cycle.statementAmount = null;
  cycle.paidAmount = 0;
  rows.dailyExpense.push({ userId: "a", id: "expense", cardId: card.id, date: "2026-10-01", amount: 1000, paymentMethod: "CARD" });
  const income = { id: "credit-income", userId: "a", concept: "Bonificación", date: "2026-10-01", amount: 200 };
  const credit = { id: "credit", userId: "a", cycleId: cycle.id, incomeId: income.id, amount: 200 };
  // Simular la relación que Prisma devuelve únicamente cuando se solicita.
  db.cardCycle.findMany = async ({ include }) => [{ ...cycle, credits: [{ ...credit,
    ...(include.credits?.select?.income ? { income } : {}),
  }] }];
  const notices = await load("src/lib/androidNotices.js").loadAndroidNotices(db, "a", today);
  assert.match(notices.find(notice => notice.title.startsWith("Pago de tarjeta")).body, /800\.00/);
});

test("avisos Android: suscripciones, cobros y cortes conservan destino y reglas compartidas", async () => {
  const { load, db, rows, cycle, card } = fixture();
  cycle.paidAmount = 1000;
  rows.subscription.push({ userId: "a", id: "cash", name: "Servicio", paymentMethod: "CASH", chargeDay: 26, amount: 200,
    isActive: true, startYear: 2026, startMonth: 1, frequencyMonths: 1, dailyExpenses: [], charges: [] });
  rows.receivableAccount.push({ userId: "a", id: "debt", originalAmount: 500, expectedMonthlyPayment: 100,
    expectedChargeDays: [26], originDate: "2026-10-01", incomes: [], status: "ACTIVE", person: { name: "Persona" } });
  rows.cardCycle.push({ ...cycle, id: "next", month: 11, startDate: "2026-10-11", cutDate: "2026-10-28", dueDate: "2026-11-15",
    statementAmount: null, paidAmount: 0, cardId: card.id });
  const service = load("src/lib/androidNotices.js");
  const notices = await service.loadAndroidNotices(db, "a", today);
  assert.deepEqual(Array.from(notices.map(notice => notice.path)).sort(), ["/gastos", "/ingresos", "/tarjetas"]);
  rows.subscription[0].charges.push({ month: "2026-10", status: "SKIPPED" });
  assert.equal((await service.loadAndroidNotices(db, "a", today)).some(notice => notice.path === "/gastos"), false);
});

test("avisos Android: fecha local de México, cambio de mes y zonas inválidas", () => {
  const { load } = fixture();
  const { noticeLocalDate } = load("src/lib/androidNotices.js");
  assert.equal(noticeLocalDate("America/Mexico_City", new Date("2026-11-01T05:59:00Z")).getMonth(), 9);
  assert.equal(noticeLocalDate("America/Mexico_City", new Date("2026-11-01T06:00:00Z")).getMonth(), 10);
  assert.throws(() => noticeLocalDate("not-a-zone"), error => error.status === 400);
});

test("avisos Android: credencial, pausa y revocación se comprueban antes de leer finanzas", async () => {
  for (const state of ["invalid", "paused", "revoked", "pending"]) {
    const { load, calls, request, device } = fixture();
    if (state === "invalid") device.secretHash = "0".repeat(64);
    if (state === "paused") device.pausedAt = today;
    if (state === "revoked") device.revokedAt = today;
    if (state === "pending") device.userId = null;
    const response = await load("src/app/api/captures/notices/route.js").GET(request());
    assert.equal(response.status, ["invalid", "revoked"].includes(state) ? 401 : 403);
    assert.equal(calls.length, 0);
  }
});

test("avisos Android: un fallo de lectura nunca se presenta como una lista vacía válida", async () => {
  const { load, request, db } = fixture();
  db.noticeDismissal.findMany = async () => { throw new Error("storage unavailable"); };
  const response = await load("src/app/api/captures/notices/route.js").GET(request());
  assert.equal(response.status, 500);
  assert.equal(response.body.notices, undefined);
});

test("avisos Android: zona inválida y límite de consultas no consultan registros financieros", async () => {
  const invalidZone = fixture();
  const request = invalidZone.request();
  const url = new URL(request.url);
  url.searchParams.set("timeZone", "invalid-zone");
  request.url = url.href;
  assert.equal((await invalidZone.load("src/app/api/captures/notices/route.js").GET(request)).status, 400);
  assert.equal(invalidZone.calls.length, 0);
  const limited = fixture();
  limited.db.$queryRaw = async sql => sql.join("").includes("INSERT INTO capture_rate_limits")
    ? [{ count: 31, expiresAt: new Date(today.getTime() + 60_000) }] : [{ id: limited.device.id }];
  const response = await limited.load("src/app/api/captures/notices/route.js").GET(limited.request());
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "60");
  assert.equal(limited.calls.length, 0);
});
