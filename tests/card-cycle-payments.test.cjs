const assert = require("node:assert/strict");
const { test } = require("node:test");
const { sourceLoader } = require("./helpers/load-source.cjs");
const { getCyclePaymentState, parseCycleMoney } = sourceLoader()("src/lib/calculations/cardCyclePayments.js");
const { getDashboardPayment } = sourceLoader()("src/lib/cardPaymentPresentation.js");
const now = new Date("2026-10-25T18:00:00Z");
const base = {
  id: "cycle", userId: "owner", cardId: "card", month: 10, year: 2026,
  startDate: "2026-09-11T12:00:00Z", cutDate: "2026-10-10T12:00:00Z", dueDate: "2026-10-25T12:00:00Z",
  statementAmount: 1000, paidAmount: null, paidAt: null, status: "PAYMENT_PENDING", credits: [],
  card: { id: "card", name: "Tarjeta de prueba", usualCutDay: 10 },
};
const plain = value => JSON.parse(JSON.stringify(value));
function fixture(initial = {}) {
  let cycle = { ...base, ...initial }, writes = 0, fail = false;
  const reads = [], locks = [];
  let inTransaction = false;
  const prisma = {
    cardCycle: {
      findMany: async () => [plain(cycle)],
      findUnique: async ({ where }) => {
        reads.push(inTransaction);
        return where.id === cycle.id && where.userId === cycle.userId ? plain(cycle) : null;
      },
      update: async ({ where, data }) => {
        assert.equal(inTransaction, true);
        assert.equal(where.userId, "owner");
        cycle = { ...cycle, ...data }; writes++;
        if (fail) throw new Error("fallo simulado");
        return plain(cycle);
      },
    },
    card: { findMany: async () => [base.card] },
    dailyExpense: { findMany: async () => [] }, subscription: { findMany: async () => [] },
    installmentPurchase: { findMany: async () => [] }, income: { findMany: async () => [] },
    category: { findMany: async () => [] },
    receivableAccount: { findMany: async () => [] },
    $queryRaw: async (sql, id, userId) => {
      assert.equal(inTransaction, true);
      assert.match(sql.join("?"), /card_cycles.*FOR UPDATE/);
      locks.push({ id, userId });
      return [];
    },
    $transaction: async (run) => {
      const before = plain(cycle);
      inTransaction = true;
      try { return await run(prisma); }
      catch (error) { cycle = before; throw error; }
      finally { inTransaction = false; }
    },
  };
  const load = sourceLoader({
    "@/lib/prisma": { prisma },
    "next/server": { NextResponse: { json: (body, options = {}) => ({ body: plain(body), status: options.status || 200 }) } },
    "@supabase/supabase-js": { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: "owner" } } }) } }) },
  }, { Date: class extends Date { constructor(...args) { super(...(args.length ? args : [now])); } }, console: { error() {} } });
  const request = body => ({ url: "http://localhost/api/test", headers: new Headers({ authorization: "Bearer test" }), json: async () => body });
  return {
    patch: (body) => load("src/app/api/card-cycles/route.js").PATCH(request({ id: "cycle", ...body })),
    get: (route) => load(`src/app/api/${route}/route.js`).GET(request()),
    state: () => plain(cycle), writes: () => writes, reads, locks, fail: () => { fail = true; },
  };
}

test("un peso de mil conserva 999 pendientes, aun con PAID/paidAt históricos", () => {
  const partial = { ...base, paidAmount: 1, paidAt: "2026-10-20", status: "PAID" };
  const result = getCyclePaymentState(partial, now);
  assert.equal(result.pendingAmount, 999);
  assert.equal(result.paymentStatus, "PARTIALLY_PAID");
  assert.equal(result.displayStatus, "OVERDUE");
  assert.equal(result.isSettled, false);
  assert.equal(getCyclePaymentState(partial, new Date("2026-10-20")).displayStatus, "PARTIALLY_PAID");
  assert.equal(getCyclePaymentState({ ...base, paidAt: "2026-10-20", status: "PAID" }, now).pendingAmount, 1000);
});

test("centavos, excedente, cero y falta de estado tienen situaciones distintas", () => {
  for (const zero of [0, "0", "0.00"]) {
    const state = getCyclePaymentState({ ...base, statementAmount: zero }, now);
    assert.equal(state.paymentStatus, "NO_PAYMENT_DUE");
    assert.equal(state.pendingAmount, 0);
    assert.equal(state.isSettled, true);
  }
  assert.equal(getCyclePaymentState({ ...base, statementAmount: "0.30", paidAmount: 0.1 + 0.2 }, now).paymentStatus, "PAID");
  assert.equal(getCyclePaymentState({ ...base, paidAmount: "999.99" }, now).pendingAmount, 0.01);
  const excess = getCyclePaymentState({ ...base, paidAmount: 1001 }, now);
  assert.equal(excess.pendingAmount, 0);
  assert.equal(excess.excessAmount, 1);
  assert.equal(excess.paymentStatus, "PAID");
  const unknown = getCyclePaymentState({ ...base, statementAmount: null, paidAmount: 1000, status: "PAID" }, now);
  assert.equal(unknown.isSettled, false);
  assert.equal(unknown.pendingAmount, null);
});

test("PATCH, listado, Dashboard y avisos comparten saldo sin reducir el total mensual", async () => {
  const f = fixture();
  const saved = await f.patch({ action: "MARK_AS_PAID", paidAmount: 1, paidAt: "2026-10-20" });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.cycle.pendingAmount, 999);
  assert.notEqual(f.state().status, "PAID");
  for (const route of ["card-cycles", "dashboard"]) {
    const response = await f.get(route);
    assert.equal(response.status, 200);
    assert.equal(response.body.cycles[0].pendingAmount, 999);
    assert.equal(response.body.cycles[0].paymentStatus, "PARTIALLY_PAID");
    assert.equal(getDashboardPayment(response.body.cycles[0], now).amount, 1000);
    if (route === "dashboard") {
      const notice = response.body.importantNotices.find(n => n.type === "CARD_PAYMENT");
      assert.equal(notice.amount, 999);
      assert.match(notice.description, /Saldo pendiente: \$999\.00/);
    }
  }
  assert.equal(f.reads.every(Boolean), true);
  assert.deepEqual(f.locks, [{ id: "cycle", userId: "owner" }]);
});

test("lecturas corrigen PAID antiguo sin escribir ni ocultar avisos parciales", async () => {
  const f = fixture({ status: "PAID", paidAmount: 1, paidAt: "2026-10-20" });
  const result = await f.get("dashboard");
  assert.equal(result.status, 200);
  assert.equal(result.body.importantNotices.some(n => n.type === "CARD_PAYMENT" && n.amount === 999), true);
  assert.equal(f.writes(), 0);
});

test("cero numérico y texto cierran sin pago ficticio y sin avisos de vencimiento", async () => {
  for (const zero of [0, "0"]) {
    const f = fixture();
    const statement = await f.patch({ action: "UPDATE_STATEMENT", statementAmount: zero });
    assert.equal(statement.status, 200);
    assert.equal(statement.body.cycle.paymentStatus, "NO_PAYMENT_DUE");
    const closed = await f.patch({ action: "MARK_AS_PAID", paidAmount: zero });
    assert.equal(closed.status, 200);
    assert.equal(closed.body.cycle.paidAt, null);
    assert.equal(closed.body.cycle.paidAmount, null);
    const dashboard = await f.get("dashboard");
    assert.equal(dashboard.status, 200);
    assert.equal(dashboard.body.importantNotices.some(n => n.type === "CARD_PAYMENT"), false);
    assert.equal((await f.patch({ action: "UNMARK_AS_PAID" })).body.cycle.paymentStatus, "NO_PAYMENT_DUE");
  }
});

test("editar el estado recalcula pago completo, parcial, excedente y cero; deshacer reabre", async () => {
  const f = fixture({ paidAmount: 1000, paidAt: "2026-10-20", status: "PAID" });
  for (const [amount, status, pending] of [[2000, "PARTIALLY_PAID", 1000], [1000, "PAID", 0], [999, "PAID", 0], [0, "NO_PAYMENT_DUE", 0]]) {
    const response = await f.patch({ action: "UPDATE_STATEMENT", statementAmount: amount });
    assert.equal(response.status, 200);
    assert.equal(response.body.cycle.paymentStatus, status);
    assert.equal(response.body.cycle.pendingAmount, pending);
    assert.equal(response.body.cycle.paidAmount, 1000);
  }
  await f.patch({ action: "UPDATE_STATEMENT", statementAmount: 1000 });
  const undone = await f.patch({ action: "UNMARK_AS_PAID" });
  assert.equal(undone.body.cycle.pendingAmount, 1000);
  assert.equal(undone.body.cycle.paymentStatus, "PENDING");
  const moved = await f.patch({ action: "UPDATE_DATES", startDate: "2026-09-11", cutDate: "2026-10-10", dueDate: "2026-10-30" });
  assert.equal(moved.body.cycle.displayStatus, "PAYMENT_PENDING");
  assert.equal(f.state().status, "PAYMENT_PENDING");
});

test("guardar total reemplaza el anterior; repetir no acumula y disminuir reabre", async () => {
  const f = fixture();
  for (const amount of [1, 1000, 1000, 500]) {
    const result = await f.patch({ action: "MARK_AS_PAID", paidAmount: amount, paidAt: "2026-10-20" });
    assert.equal(result.status, 200);
    assert.equal(result.body.cycle.pendingAmount, 1000 - amount);
  }
  assert.equal(f.state().paidAmount, 500);
  const cleared = await f.patch({ action: "MARK_AS_PAID", paidAmount: 0 });
  assert.equal(cleared.body.cycle.pendingAmount, 1000);
  assert.equal(cleared.body.cycle.paidAt, null);
});

test("rechaza importes ambiguos, fechas imposibles y pago sin estado capturado", async () => {
  const f = fixture();
  for (const value of [null, undefined, "", " ", -1, "NaN", "Infinity", 0.001, true, [], {}, "1e3", "9007199254740992"]) {
    assert.equal(parseCycleMoney(value), null);
    for (const action of ["UPDATE_STATEMENT", "MARK_AS_PAID"]) {
      assert.equal((await f.patch({ action, statementAmount: value, paidAmount: value, paidAt: "2026-10-20" })).status, 400);
    }
  }
  assert.equal((await f.patch({ action: "MARK_AS_PAID", paidAmount: 1, paidAt: "2026-02-30" })).status, 400);
  assert.equal((await f.patch({ action: "MARK_AS_PAID", paidAmount: 1 })).status, 400);
  assert.equal(f.writes(), 0);
  assert.equal((await fixture({ statementAmount: null }).patch({ action: "MARK_AS_PAID", paidAmount: 1000, paidAt: "2026-10-20" })).status, 409);
});

test("fallo de escritura revierte el cambio y el estado dentro de la transacción", async () => {
  const f = fixture();
  const before = f.state();
  f.fail();
  assert.equal((await f.patch({ action: "MARK_AS_PAID", paidAmount: 1000, paidAt: "2026-10-20" })).status, 500);
  assert.deepEqual(f.state(), before);
});
