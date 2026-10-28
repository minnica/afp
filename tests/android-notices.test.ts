import { fixedDate,plain,present,stringValue,uncheckedFixture } from './helpers/financial-fixtures';

import type { NoticeDelegates,NoticeRows } from './helpers/notice-fixture';
import { noticeDelegates } from './helpers/notice-fixture';

import { integrationLoader as sourceLoader,withFixtureDb } from './helpers/integration-fixtures';

import { array,record as objectValue } from './helpers/dynamic-values';

import assert from "node:assert/strict";
import { createHash,randomBytes,randomUUID } from 'node:crypto';
import { test } from 'node:test';

const today = new Date("2026-10-26T12:00:00Z");
class Clock extends fixedDate(today) { static now() { return today.getTime(); } }

function fixture() {
  const calls: { model: string; where: unknown }[] = [];
  const card = { id: "hsbc-1", userId: "a", name: "HSBC 1", usualCutDay: 10 };
  const cycle: NoticeRows['cardCycle'][number] = { id: "october", userId: "a", cardId: card.id, card, month: 10, year: 2026,
    startDate: "2026-09-11T12:00:00Z", cutDate: "2026-10-10T12:00:00Z", dueDate: "2026-10-26T12:00:00Z",
    statementAmount: 1000, paidAmount: 100, credits: [] };
  const rows: NoticeRows = { card: [card], cardCycle: [cycle], dailyExpense: [], subscription: [], installmentPurchase: [],
    receivableAccount: [], payableAccount: [], noticeDismissal: [], income: [], category: [] };
  const delegates = noticeDelegates(rows, (model, where) => { calls.push({ model, where: plain(where) }); assert.equal(where.userId, 'a', `${model} debe limitarse al propietario autenticado`); });
  const secret = randomBytes(32).toString("base64url");
  const device: Pick<import('@prisma/client').CaptureDevice, 'id' | 'userId' | 'secretHash' | 'revokedAt' | 'pausedAt'> = { id: randomUUID(), userId: "a", secretHash: createHash("sha256").update(secret).digest("hex"),
    revokedAt: null, pausedAt: null };
  type Db = NoticeDelegates & { captureDevice: { findUnique(): Promise<typeof device> }; $transaction<T>(run: (tx: Db) => Promise<T>): Promise<T>; $queryRaw(sql: TemplateStringsArray): Promise<({ count: number; expiresAt: Date } | { id: string })[]> };
  const db: Db = { ...delegates, captureDevice: { findUnique: async () => device },
    $transaction: async run => run(db),
    $queryRaw: async sql => sql.join('').includes('INSERT INTO capture_rate_limits') ? [{ count: 1, expiresAt: new Date(today.getTime() + 300_000) }] : [{ id: device.id }],
  };
  const load = sourceLoader({
    "@/lib/prisma": { prisma: db },
    "@/lib/captureProcessing": { processCaptureEvent() { throw new Error("No debe escribir movimientos"); } },
    "@/lib/calendar/schedule": { scheduleCalendarSync() {} },
    "next/server": { NextResponse: { json: (body: unknown, options = {}) => ({ body: plain(body), status: options.status || 200, headers: new Headers(options.headers) }) } },
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
  const native = await load("src/app/api/captures/notices/route.ts").GET(request());
  const dashboard = await load("src/app/api/dashboard/route.ts").GET({
    url: "http://localhost/api/dashboard?clientDate=2026-10-26", headers: new Headers({ authorization: "Bearer test" }),
  });
  assert.equal(native.status, 200);
  assert.equal(dashboard.status, 200);
  assert.equal(array(native.body.notices).length, 1);
  assert.equal(objectValue(array(native.body.notices)[0]).title, "Pago de tarjeta: HSBC 1");
  assert.equal(objectValue(array(native.body.notices)[0]).title, objectValue(array(dashboard.body.importantNotices)[0]).title);
  assert.equal(objectValue(array(native.body.notices)[0]).body, objectValue(array(dashboard.body.importantNotices)[0]).description);
  assert.match(stringValue(objectValue(array(native.body.notices)[0]).body), /900\.00/);
  assert.equal(objectValue(array(native.body.notices)[0]).path, "/tarjetas");
  assert.deepEqual(Object.keys(native.body).sort(), ["deviceId", "notices", "ownerId", "version"]);
  assert.equal(present(native.headers).get("cache-control"), "private, no-store");
  assert.equal(present(native.headers).get("vary"), "Authorization");
});

test("avisos Android: oculta por mes, retira liquidaciones y vuelve a avisar si cambia el saldo", async () => {
  const { load, db, rows, cycle } = fixture();
  const { loadAndroidNotices } = load("src/lib/androidNotices.ts");
  const initial = await withFixtureDb(loadAndroidNotices, db, "a", today);
  const noticeKey = load("src/lib/noticeDismissals.ts").getNoticeKey({ type: "CARD_PAYMENT", id: "card-october", date: cycle.dueDate, amount: 900 });
  rows.noticeDismissal.push({ userId: "a", month: "2026-10", noticeKey });
  assert.equal((await withFixtureDb(loadAndroidNotices, db, "a", today)).length, 0);
  cycle.paidAmount = 300;
  const changed = await withFixtureDb(loadAndroidNotices, db, "a", today);
  assert.equal(changed.length, 1);
  assert.notEqual(present(changed[0]).key, present(initial[0]).key);
  cycle.paidAmount = 1000;
  assert.equal((await withFixtureDb(loadAndroidNotices, db, "a", today)).length, 0);
});

test("avisos Android: identidad estable entre consultas, cambia al vencer y al mes siguiente", async () => {
  const { load, db, cycle } = fixture();
  const { loadAndroidNotices } = load("src/lib/androidNotices.ts");
  cycle.dueDate = "2026-10-28T12:00:00Z";
  const key = async (date: string) => present((await withFixtureDb(loadAndroidNotices, db, "a", new Date(`${date}T12:00:00Z`)))[0]).key;
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
  db.cardCycle.findMany = async ({ include = {} }) => [{ ...cycle, credits: [{ ...credit,
    ...(include.credits?.select?.income ? { income } : {}),
  }] }];
  const notices = await withFixtureDb(load("src/lib/androidNotices.ts").loadAndroidNotices, db, "a", today);
  assert.match(stringValue(present(notices.find(notice => notice.title.startsWith("Pago de tarjeta"))).body), /800\.00/);
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
  const service = load("src/lib/androidNotices.ts");
  const notices = await withFixtureDb(service.loadAndroidNotices, db, "a", today);
  assert.deepEqual(Array.from(notices.map(notice => notice.path)).sort(), ["/gastos", "/ingresos", "/tarjetas"]);
  present(present(rows.subscription[0]).charges).push({ month: "2026-10", status: "SKIPPED" });
  assert.equal((await withFixtureDb(service.loadAndroidNotices, db, "a", today)).some(notice => notice.path === "/gastos"), false);
});

test("avisos Android: fecha local de México, cambio de mes y zonas inválidas", () => {
  const { load } = fixture();
  const { noticeLocalDate } = load("src/lib/androidNotices.ts");
  assert.equal(noticeLocalDate("America/Mexico_City", new Date("2026-11-01T05:59:00Z")).getMonth(), 9);
  assert.equal(noticeLocalDate("America/Mexico_City", new Date("2026-11-01T06:00:00Z")).getMonth(), 10);
  assert.throws(() => noticeLocalDate("not-a-zone"), error => objectValue(error).status === 400);
});

test("cuentas por pagar: Dashboard y Android comparten saldo, fecha, aislamiento y liquidación", async () => {
  const { load, request, rows, cycle, db } = fixture();
  cycle.paidAmount = 1000;
  const payable: NoticeRows['payableAccount'][number] = { id: "payable", userId: "a", concept: "Compra pendiente", originalAmount: "1000.30",
    accountType: "SIMPLE", expectedDate: "2026-10-28T12:00:00Z", status: "ACTIVE",
    person: { name: "Proveedor" }, dailyExpenses: [{ amount: "100.10" }, { amount: "200.20" }] };
  rows.payableAccount.push(payable, { ...payable, id: "other", userId: "b", concept: "Cuenta ajena" });
  const dashboard = () => load("src/app/api/dashboard/route.ts").GET({
    url: "http://localhost/api/dashboard?clientDate=2026-10-26&userId=b", headers: new Headers({ authorization: "Bearer test" }),
  });
  const web = await dashboard();
  const native = await load("src/app/api/captures/notices/route.ts").GET(request());
  assert.equal(web.status, 200);
  assert.equal(native.status, 200);
  assert.equal(array(web.body.importantNotices).length, 1);
  assert.equal(array(native.body.notices).length, 1);
  const notice = array(web.body.importantNotices)[0];
  assert.equal(objectValue(notice).type, "PAYABLE");
  assert.equal(objectValue(notice).amount, 700);
  assert.equal(objectValue(notice).group, "upcoming");
  assert.equal(objectValue(notice).date, payable.expectedDate);
  assert.equal(objectValue(array(native.body.notices)[0]).title, objectValue(notice).title);
  assert.equal(objectValue(array(native.body.notices)[0]).body, objectValue(notice).description);
  assert.equal(objectValue(array(native.body.notices)[0]).path, "/gastos");
  assert.equal(web.body.payables, undefined);
  assert.deepEqual(Object.keys(objectValue(array(native.body.notices)[0])).sort(), ["body", "key", "path", "title"]);

  const { getNoticeKey } = load("src/lib/noticeDismissals.ts");
  rows.noticeDismissal.push({ userId: "a", month: "2026-10", noticeKey: uncheckedFixture(getNoticeKey, notice) });
  assert.equal((await withFixtureDb(load("src/lib/androidNotices.ts").loadAndroidNotices, db, "a", today)).length, 0);
  assert.equal(array((await dashboard()).body.importantNotices).length, 1, "Dashboard conserva los avisos para particionar en el cliente");
  rows.noticeDismissal.length = 0;
  present(payable.dailyExpenses).push({ amount: 700 });
  assert.equal(array((await dashboard()).body.importantNotices).length, 0);
  assert.equal((await withFixtureDb(load("src/lib/androidNotices.ts").loadAndroidNotices, db, "a", today)).length, 0);
  present(payable.dailyExpenses).pop();
  payable.status = "CANCELLED";
  assert.equal(array((await dashboard()).body.importantNotices).length, 0);
  assert.equal((await withFixtureDb(load("src/lib/androidNotices.ts").loadAndroidNotices, db, "a", today)).length, 0);
});

test("avisos Android: credencial, pausa y revocación se comprueban antes de leer finanzas", async () => {
  for (const state of ["invalid", "paused", "revoked", "pending"] as const) {
    const { load, calls, request, device } = fixture();
    if (state === "invalid") device.secretHash = "0".repeat(64);
    if (state === "paused") device.pausedAt = today;
    if (state === "revoked") device.revokedAt = today;
    if (state === "pending") device.userId = null;
    const response = await load("src/app/api/captures/notices/route.ts").GET(request());
    assert.equal(response.status, ["invalid", "revoked"].includes(state) ? 401 : 403);
    assert.equal(calls.length, 0);
  }
});

test("avisos Android: un fallo de lectura nunca se presenta como una lista vacía válida", async () => {
  const { load, request, db } = fixture();
  db.noticeDismissal.findMany = async () => { throw new Error("storage unavailable"); };
  const response = await load("src/app/api/captures/notices/route.ts").GET(request());
  assert.equal(response.status, 500);
  assert.equal(response.body.notices, undefined);
});

test("avisos Android: zona inválida y límite de consultas no consultan registros financieros", async () => {
  const invalidZone = fixture();
  const request = invalidZone.request();
  const url = new URL(request.url);
  url.searchParams.set("timeZone", "invalid-zone");
  request.url = url.href;
  assert.equal((await invalidZone.load("src/app/api/captures/notices/route.ts").GET(request)).status, 400);
  assert.equal(invalidZone.calls.length, 0);
  const limited = fixture();
  limited.db.$queryRaw = async (sql: TemplateStringsArray) => sql.join("").includes("INSERT INTO capture_rate_limits")
    ? [{ count: 31, expiresAt: new Date(today.getTime() + 60_000) }] : [{ id: limited.device.id }];
  const response = await limited.load("src/app/api/captures/notices/route.ts").GET(limited.request());
  assert.equal(response.status, 429);
  assert.equal(present(response.headers).get("retry-after"), "60");
  assert.equal(limited.calls.length, 0);
});
