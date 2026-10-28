const assert = require("node:assert/strict");
const { test } = require("node:test");
const { sourceLoader } = require("./helpers/load-source.ts");
const ctx = sourceLoader()("src/lib/noticeDismissals.ts");
const notice = { id: "receivable-a-2026-10-15", type: "RECEIVABLE", date: "2026-10-15T12:00:00Z", amount: 1500 };
const plain = (value) => JSON.parse(JSON.stringify(value));

test("solo oculta la ocurrencia seleccionada durante el mes de confirmación", () => {
  const next = { ...notice, id: "receivable-a-2026-10-30", date: "2026-10-30T12:00:00Z" };
  const nextMonth = { ...notice, id: "receivable-a-2026-11-15", date: "2026-11-15T12:00:00Z" };
  const entries = [{ month: "2026-10", noticeKey: ctx.getNoticeKey(notice) }];
  assert.deepEqual(plain(ctx.partitionNotices([notice, next, nextMonth], entries, "2026-10")), { visible: [next, nextMonth], hidden: [notice] });
  assert.equal(ctx.partitionNotices([notice, nextMonth], entries, "2026-11").visible.length, 2);
  assert.equal(ctx.partitionNotices([notice], [], "2026-10").visible.length, 1);
  assert.equal(ctx.getNoticeMonth(new Date(2026, 11, 31, 23, 59)), "2026-12");
  assert.equal(ctx.getNoticeMonth(new Date(2027, 0, 1)), "2027-01");
});

test("un corte oculto no oculta el pago y los cambios de importe/fecha lo hacen reaparecer", () => {
  const cut = { ...notice, id: "cut-cycle-a", type: "CUT_CYCLE" };
  const upcoming = { ...cut, id: "cut-cycle-upcoming-a", type: "CUT_CYCLE_UPCOMING" };
  const payment = { ...cut, id: "card-a", type: "CARD_PAYMENT" };
  assert.equal(ctx.getNoticeKey(upcoming), ctx.getNoticeKey(cut));
  const entries = [{ month: "2026-10", noticeKey: ctx.getNoticeKey(cut) }, { month: "2026-10", noticeKey: ctx.getNoticeKey(payment) }];
  const changed = { ...payment, amount: 1500.01 };
  const moved = { ...payment, date: "2026-10-16T12:00:00Z" };
  assert.deepEqual(plain(ctx.partitionNotices([cut, payment, changed, moved], entries, "2026-10").visible), [changed, moved]);
  assert.equal(ctx.partitionNotices([payment], entries.slice(0, 1), "2026-10").visible.length, 1);
});

test("los avisos desconocidos o inválidos no se pueden ocultar", () => {
  for (const value of [null, { ...notice, type: "NEW" }, { ...notice, date: "bad" }, { ...notice, id: 42 }]) assert.equal(ctx.getNoticeKey(value), null);
  assert.equal(ctx.isNoticeKey(ctx.getNoticeKey(notice)), true);
  for (const key of [null, "bad", "[]", '["NEW","a","2026-10-15",null]', '["CARD_PAYMENT","a","2026-10-15",null]']) assert.equal(ctx.isNoticeKey(key), false);
});

test("cuentas por pagar: permite ocultar y restaurar, distingue fechas y vence cada mes", async () => {
  const payable = { ...notice, id: "payable-a", type: "PAYABLE" };
  const noticeKey = ctx.getNoticeKey(payable);
  assert.equal(ctx.isNoticeKey(noticeKey), true);
  const { route, request } = api();
  const body = { month: "2026-10", noticeKey };
  assert.equal((await route.POST(request("valid-a", body))).status, 200);
  const entries = (await route.GET(request("valid-a"))).body.dismissals;
  assert.equal(ctx.partitionNotices([payable], entries, "2026-10").hidden.length, 1);
  assert.equal(ctx.partitionNotices([{ ...payable, date: "2026-10-16" }], entries, "2026-10").visible.length, 1);
  assert.equal(ctx.partitionNotices([payable], entries, "2026-11").visible.length, 1);
  await route.DELETE(request("valid-a", body));
  const restored = (await route.GET(request("valid-a"))).body.dismissals;
  assert.equal(ctx.partitionNotices([payable], restored, "2026-10").visible.length, 1);
});

function api() {
  const entries = [];
  const calls = [];
  const globals = { Headers, URL, Date, Set, JSON, process: { env: {} }, console: { error() {} },
    createClient: () => ({ auth: { getUser: async (token) => ({ data: { user: token === "valid-a" ? { id: "a" } : token === "valid-b" ? { id: "b" } : null }, error: token.startsWith("valid-") ? null : new Error("invalid") }) } }),
    NextResponse: { json: (body, options = {}) => ({ body: plain(body), status: options.status || 200 }) },
    prisma: { noticeDismissal: {
      upsert: async ({ create }) => { calls.push(create); if (!entries.some((entry) => JSON.stringify(entry) === JSON.stringify(create))) entries.push(create); },
      deleteMany: async ({ where }) => { calls.push(where); const index = entries.findIndex((entry) => Object.keys(where).every((key) => entry[key] === where[key])); if (index !== -1) entries.splice(index, 1); },
      findMany: async ({ where }) => { calls.push(where); return entries.filter((entry) => entry.userId === where.userId && entry.month === where.month).map(({ month, noticeKey }) => ({ month, noticeKey })); },
    } },
  };
  const route = sourceLoader({
    "@/lib/prisma": { prisma: globals.prisma },
    "@supabase/supabase-js": { createClient: globals.createClient },
    "next/server": { NextResponse: globals.NextResponse },
    "@/lib/calendar/schedule": { scheduleCalendarSync() {} },
  })("src/app/api/notice-dismissals/route.ts");
  const request = (token, body = {}) => ({ url: "http://localhost/api/notice-dismissals?month=2026-10&userId=b", headers: new Map(token ? [["authorization", `Bearer ${token}`]] : []), json: async () => body });
  return { route, calls, request };
}

test("la API exige sesión validada e ignora userId del cliente", async () => {
  const { route, calls, request } = api();
  assert.equal((await route.GET(request())).status, 401);
  assert.equal((await route.GET(request("invalid"))).status, 401);
  assert.equal(calls.length, 0);
  const body = { month: "2026-10", noticeKey: ctx.getNoticeKey(notice), userId: "b" };
  assert.equal((await route.POST(request("valid-a", body))).status, 200);
  assert.equal(calls[0].userId, "a");
  assert.equal((await route.GET(request("valid-b"))).body.dismissals.length, 0);
  await route.DELETE(request("valid-b", body));
  assert.equal((await route.GET(request("valid-a"))).body.dismissals.length, 1);
});

test("ocultar y recuperar son idempotentes y no aceptan identidades inválidas", async () => {
  const { route, calls, request } = api();
  assert.equal((await route.POST(request("valid-a", { month: "2026-13", noticeKey: ctx.getNoticeKey(notice) }))).status, 400);
  assert.equal((await route.POST(request("valid-a", { month: "2026-10", noticeKey: "bad" }))).status, 400);
  assert.equal(calls.length, 0);
  const body = { month: "2026-10", noticeKey: ctx.getNoticeKey(notice) };
  await route.POST(request("valid-a", body));
  assert.equal((await route.POST(request("valid-a", body))).body.dismissals.length, 1);
  await route.DELETE(request("valid-a", body));
  assert.equal((await route.DELETE(request("valid-a", body))).body.dismissals.length, 0);
});
