import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DateValue, MoneyValue } from '../src/lib/calculations/types';
import { array, record } from './helpers/dynamic-values';
import { fixedDate, plain, present, financialLoader as sourceLoader, sparseCalculations, stringValue, testHandler, testReply } from './helpers/financial-fixtures';
const { getCyclePaymentState, getCyclePaymentAmounts, parseCycleMoney } = sparseCalculations(sourceLoader()("src/lib/calculations/cardCyclePayments.ts"));
const { getDashboardPayment } = sourceLoader()("src/lib/cardPaymentPresentation.ts");
const now = new Date("2026-10-25T18:00:00Z");
const base = {
  id: "cycle", userId: "owner", cardId: "card", month: 10, year: 2026,
  startDate: "2026-09-11T12:00:00Z", cutDate: "2026-10-10T12:00:00Z", dueDate: "2026-10-25T12:00:00Z",
  statementAmount: 1000, paidAmount: null, paidAt: null, status: "PAYMENT_PENDING" as const, credits: [],
  card: { id: "card", name: "Tarjeta de prueba", usualCutDay: 10 },
};

test("el detalle de captura calcula el saldo con importes sin necesitar fechas del corte", () => {
  assert.deepEqual(plain(getCyclePaymentAmounts({ statementAmount: "1000.50", paidAmount: "250.25", postCutCreditAmount: "50.25" })), {
    paymentStatus: "PARTIALLY_PAID", paymentDueAmount: 950.25, pendingAmount: 700,
    excessAmount: 0, isSettled: false,
  });
  assert.equal(getCyclePaymentAmounts({ statementAmount: null, paidAmount: "1000" }).pendingAmount, null);
});

type Cycle = Omit<typeof base, 'statementAmount' | 'paidAmount' | 'paidAt' | 'status'> & { statementAmount: MoneyValue; paidAmount: MoneyValue; paidAt: DateValue | null; status: string; datesConfirmedAt?: DateValue; postCutCreditAmount?: MoneyValue; postCutCreditDate?: DateValue | null; postCutCreditNotes?: string | null };
function fixture(initial: Partial<Cycle> = {}, instant = now) {
  let cycle: Cycle = { ...base, ...initial }, writes = 0, fail = false;
  const reads: boolean[] = [], locks: { id: string; userId: string }[] = [];
  let inTransaction = false;
  const prisma = {
    cardCyclePayment: { findMany: async () => [] },
    cardCycle: {
      findMany: async () => [plain(cycle)],
      findUnique: async ({ where }: { where: { id: string; userId: string } }) => {
        reads.push(inTransaction);
        return where.id === cycle.id && where.userId === cycle.userId ? plain(cycle) : null;
      },
      update: async ({ where, data }: { where: { id: string; userId: string }; data: Partial<Cycle> }) => {
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
    payableAccount: { findMany: async () => [] },
    $queryRaw: async (sql: TemplateStringsArray, id: string, userId: string) => {
      assert.equal(inTransaction, true);
      assert.match(sql.join("?"), /card_cycles.*FOR UPDATE/);
      locks.push({ id, userId });
      return [];
    },
    $transaction: transact,
  };
  async function transact<T>(run: (tx: Omit<typeof prisma, '$transaction'>) => Promise<T>): Promise<T> {
      const before = plain(cycle);
      inTransaction = true;
      try { return await run(prisma); }
      catch (error) { cycle = before; throw error; }
      finally { inTransaction = false; }
  }
  const load = sourceLoader({
    "@/lib/prisma": { prisma },
    "next/server": { NextResponse: { json: testReply } },
    "@supabase/supabase-js": { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: "owner" } } }) } }) },
  }, { Date: fixedDate(instant), console: { error() {} } });
  const request = (body?: Record<string, unknown>) => ({ url: "http://localhost/api/test", headers: new Headers({ authorization: "Bearer test" }), json: async () => body });
  return {
    patch: (body: Record<string, unknown>) => load("src/app/api/card-cycles/route.ts").PATCH(request({ id: "cycle", ...body })),
    get: (route: string, params: Record<string, string> = {}) => testHandler(record(load(`src/app/api/${route}/route`)).GET)({
      ...request(), url: `http://localhost/api/${route}?${new URLSearchParams(params)}`,
    }),
    state: () => plain(cycle), writes: () => writes, reads, locks, fail: () => { fail = true; },
  };
}

test("las fechas reales se confirman al guardar, incluso sin cambiarlas; importe y pago no las confirman", async () => {
  const f = fixture({ statementAmount: null });
  await f.patch({ action: "UPDATE_STATEMENT", statementAmount: 1000, datesConfirmedAt: now });
  assert.equal(f.state().datesConfirmedAt, undefined, 'no acepta confirmación enviada en otra acción');
  await f.patch({ action: "MARK_AS_PAID", paidAmount: 1, paidAt: "2026-10-21" });
  assert.equal(f.state().datesConfirmedAt, undefined);
  const response = await f.patch({ action: "UPDATE_DATES", startDate: "2026-09-11", cutDate: "2026-10-10", dueDate: "2026-10-25" });
  assert.equal(response.status, 200);
  assert.equal(record(response.body.cycle).datesConfirmedAt, now.toISOString());
  assert.equal(f.state().dueDate.slice(0, 10), "2026-10-25");
  assert.equal(f.state().statementAmount, 1000); assert.equal(f.state().paidAmount, 1);
  await f.patch({ action: "UPDATE_STATEMENT", statementAmount: 2000 });
  assert.equal(f.state().datesConfirmedAt, now.toISOString(), 'corregir el importe conserva la revisión de fechas');
});

test("fechas inválidas o un guardado fallido no registran confirmación", async () => {
  const f = fixture();
  assert.equal((await f.patch({ action: "UPDATE_DATES", startDate: "2026-09-11", cutDate: "2026-10-10", dueDate: "2026-10-09" })).status, 400);
  assert.equal(f.writes(), 0); assert.equal(f.state().datesConfirmedAt, undefined);
  f.fail();
  assert.equal((await f.patch({ action: "UPDATE_DATES", startDate: "2026-09-11", cutDate: "2026-10-10", dueDate: "2026-10-25" })).status, 500);
  assert.equal(f.state().datesConfirmedAt, undefined);
});

test("un peso de mil conserva 999 pendientes, aun con PAID/paidAt históricos", () => {
  const partial = { ...base, paidAmount: 1, paidAt: "2026-10-20", status: "PAID" as const };
  const result = getCyclePaymentState(partial, now);
  assert.equal(result.pendingAmount, 999);
  assert.equal(result.paymentStatus, "PARTIALLY_PAID");
  assert.equal(result.displayStatus, "PARTIALLY_PAID");
  assert.equal(getCyclePaymentState(partial, new Date(Date.UTC(2026, 9, 26) + 6 * 3600000)).displayStatus, "OVERDUE");
  assert.equal(result.isSettled, false);
  assert.equal(getCyclePaymentState(partial, new Date("2026-10-20")).displayStatus, "PARTIALLY_PAID");
  assert.equal(getCyclePaymentState({ ...base, paidAt: "2026-10-20", status: "PAID" as const }, now).pendingAmount, 1000);
});

test("el pago sigue vigente todo el día bancario de vencimiento", () => {
  for (const dueDate of ["2026-10-21T00:00:00Z", "2026-10-21T12:00:00Z"]) {
    for (const hour of [0, 6, 12, 23]) {
      const today = new Date(Date.UTC(2026, 9, 21, hour, 59, 59, 999) + 6 * 3600000);
      for (const [overrides, expected] of [
        [{}, "PAYMENT_PENDING"],
        [{ paidAmount: 1 }, "PARTIALLY_PAID"],
        [{ statementAmount: null }, "CUT"],
      ] as const) {
        const cycle = { ...base, dueDate, status: "OVERDUE" as const, ...overrides };
        assert.equal(getCyclePaymentState(cycle, today).displayStatus, expected);
      }
    }
  }
});

test("solo vence al empezar el día de México siguiente, incluidos cambios de mes y año", () => {
  for (const [year, month, day] of [[2026, 9, 21], [2026, 9, 31], [2026, 11, 31]] as const) {
    const dueDate = new Date(Date.UTC(year, month, day));
    const cycle = { ...base, dueDate };
    assert.equal(getCyclePaymentState(cycle, new Date(Date.UTC(year, month, present(day) - 1, 23, 59) + 6 * 3600000)).displayStatus, "PAYMENT_PENDING");
    assert.equal(getCyclePaymentState(cycle, new Date(Date.UTC(year, month, day, 23, 59, 59, 999) + 6 * 3600000)).displayStatus, "PAYMENT_PENDING");
    const nextDay = new Date(Date.UTC(year, month, present(day) + 1) + 6 * 3600000);
    assert.equal(getCyclePaymentState(cycle, nextDay).displayStatus, "OVERDUE");
    assert.equal(getCyclePaymentState({ ...cycle, paidAmount: 1 }, nextDay).displayStatus, "OVERDUE");
    assert.equal(getCyclePaymentState({ ...cycle, paidAmount: 1000 }, nextDay).displayStatus, "PAID");
    assert.equal(getCyclePaymentState({ ...cycle, statementAmount: 0 }, nextDay).displayStatus, "NO_PAYMENT_DUE");
  }
});

test("el corte se presenta desde el inicio de su día bancario", () => {
  assert.equal(getCyclePaymentState(base, new Date(Date.UTC(2026, 9, 9, 23, 59) + 6 * 3600000)).displayStatus, "OPEN");
  assert.equal(getCyclePaymentState(base, new Date(Date.UTC(2026, 9, 10) + 6 * 3600000)).displayStatus, "PAYMENT_PENDING");
  assert.equal(getCyclePaymentState({ ...base, statementAmount: null }, new Date(Date.UTC(2026, 9, 10) + 6 * 3600000)).displayStatus, "CUT");
});

test("Dashboard usa la fecha del cliente para el estado y el aviso de vencimiento", async () => {
  const f = fixture({ dueDate: "2026-10-21T12:00:00Z", status: "OVERDUE" as const });
  for (const [clientDate, status, group] of [
    ["2026-10-20", "PAYMENT_PENDING", "upcoming"],
    ["2026-10-21", "PAYMENT_PENDING", "today"],
    ["2026-10-22", "OVERDUE", "overdue"],
  ] as const) {
    const response = await f.get("dashboard", { clientDate });
    assert.equal(response.status, 200);
    assert.equal(record(array(response.body.cycles)[0]).displayStatus, status);
    const notice = array(response.body.importantNotices).find(n => record(n).type === "CARD_PAYMENT");
    assert.equal(record(notice).group, group);
    assert.equal(record(notice).amount, 1000);
  }
  assert.equal(f.writes(), 0);
});

test('A04: listado, Dashboard sin clientDate y PATCH conservan el mismo día de México', async () => {
  for (const [dueDate, instant, expected, group] of [
    ['2026-10-15', '2026-10-16T00:01:00Z', 'PAYMENT_PENDING', 'today'],
    ['2026-10-15', '2026-10-16T05:59:59.999Z', 'PAYMENT_PENDING', 'today'],
    ['2026-10-15', '2026-10-16T06:00:00Z', 'OVERDUE', 'overdue'],
    ['2026-10-31', '2026-11-01T05:59:59.999Z', 'PAYMENT_PENDING', 'today'],
    ['2026-10-31', '2026-11-01T06:00:00Z', 'OVERDUE', 'overdue'],
    ['2026-12-31', '2027-01-01T05:59:59.999Z', 'PAYMENT_PENDING', 'today'],
    ['2026-12-31', '2027-01-01T06:00:00Z', 'OVERDUE', 'overdue'],
  ] as const) {
    const f = fixture({ dueDate, status: 'OVERDUE' }, new Date(instant));
    const listed = await f.get('card-cycles');
    const dashboard = await f.get('dashboard');
    assert.equal(listed.status, 200);
    assert.equal(dashboard.status, 200);
    assert.equal(record(array(listed.body.cycles)[0]).displayStatus, expected);
    assert.equal(record(array(dashboard.body.cycles)[0]).displayStatus, expected);
    const notice = array(dashboard.body.importantNotices).find(n => record(n).type === 'CARD_PAYMENT');
    assert.equal(record(notice).group, group);
    assert.equal(f.writes(), 0);
    const saved = await f.patch({ action: 'UPDATE_STATEMENT', statementAmount: 1000 });
    assert.equal(saved.status, 200);
    assert.equal(record(saved.body.cycle).displayStatus, expected);
    assert.equal(f.state().status, expected);
  }
});

test('Dashboard rechaza clientDate vacío, imposible o con hora antes de consultar datos', async () => {
  const f = fixture();
  for (const clientDate of ['', '2026-02-30', '2026-13-01', '2026-10-15T12:00:00Z', 'invalid']) {
    assert.equal((await f.get('dashboard', { clientDate })).status, 400);
  }
  assert.equal(f.writes(), 0);
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
  const unknown = getCyclePaymentState({ ...base, statementAmount: null, paidAmount: 1000, status: "PAID" as const }, now);
  assert.equal(unknown.isSettled, false);
  assert.equal(unknown.pendingAmount, null);
});

test("PATCH, listado, Dashboard y avisos comparten saldo sin reducir el total mensual", async () => {
  const f = fixture();
  const saved = await f.patch({ action: "MARK_AS_PAID", paidAmount: 1, paidAt: "2026-10-20" });
  assert.equal(saved.status, 200);
  assert.equal(record(saved.body.cycle).pendingAmount, 999);
  assert.notEqual(f.state().status, "PAID");
  for (const route of ["card-cycles", "dashboard"]) {
    const response = await f.get(route);
    assert.equal(response.status, 200);
    assert.equal(record(array(response.body.cycles)[0]).pendingAmount, 999);
    assert.equal(record(array(response.body.cycles)[0]).paymentStatus, "PARTIALLY_PAID");
    assert.equal(getDashboardPayment(record(array(response.body.cycles)[0]), now).amount, 1000);
    if (route === "dashboard") {
      const notice = array(response.body.importantNotices).find(n => record(n).type === "CARD_PAYMENT");
      assert.equal(record(notice).amount, 999);
      assert.match(stringValue(record(notice).description), /Saldo pendiente: \$999\.00/);
    }
  }
  assert.equal(f.reads.every(Boolean), true);
  assert.deepEqual(f.locks, [{ id: "cycle", userId: "owner" }]);
});

test("lecturas corrigen PAID antiguo sin escribir ni ocultar avisos parciales", async () => {
  const f = fixture({ status: "PAID" as const, paidAmount: 1, paidAt: "2026-10-20" });
  const result = await f.get("dashboard");
  assert.equal(result.status, 200);
  assert.equal(array(result.body.importantNotices).some(n => record(n).type === "CARD_PAYMENT" && record(n).amount === 999), true);
  assert.equal(f.writes(), 0);
});

test("cero numérico y texto cierran sin pago ficticio y sin avisos de vencimiento", async () => {
  for (const zero of [0, "0"]) {
    const f = fixture();
    const statement = await f.patch({ action: "UPDATE_STATEMENT", statementAmount: zero });
    assert.equal(statement.status, 200);
    assert.equal(record(statement.body.cycle).paymentStatus, "NO_PAYMENT_DUE");
    const closed = await f.patch({ action: "MARK_AS_PAID", paidAmount: zero });
    assert.equal(closed.status, 200);
    assert.equal(record(closed.body.cycle).paidAt, null);
    assert.equal(record(closed.body.cycle).paidAmount, null);
    const dashboard = await f.get("dashboard");
    assert.equal(dashboard.status, 200);
    assert.equal(array(dashboard.body.importantNotices).some(n => record(n).type === "CARD_PAYMENT"), false);
    assert.equal(record((await f.patch({ action: "UNMARK_AS_PAID" })).body.cycle).paymentStatus, "NO_PAYMENT_DUE");
  }
});

test("editar el estado recalcula pago completo, parcial, excedente y cero; deshacer reabre", async () => {
  const f = fixture({ paidAmount: 1000, paidAt: "2026-10-20", status: "PAID" as const });
  for (const [amount, status, pending] of [[2000, "PARTIALLY_PAID", 1000], [1000, "PAID", 0], [999, "PAID", 0], [0, "NO_PAYMENT_DUE", 0]]) {
    const response = await f.patch({ action: "UPDATE_STATEMENT", statementAmount: amount });
    assert.equal(response.status, 200);
    assert.equal(record(response.body.cycle).paymentStatus, status);
    assert.equal(record(response.body.cycle).pendingAmount, pending);
    assert.equal(record(response.body.cycle).paidAmount, 1000);
  }
  await f.patch({ action: "UPDATE_STATEMENT", statementAmount: 1000 });
  const undone = await f.patch({ action: "UNMARK_AS_PAID" });
  assert.equal(record(undone.body.cycle).pendingAmount, 1000);
  assert.equal(record(undone.body.cycle).paymentStatus, "PENDING");
  const moved = await f.patch({ action: "UPDATE_DATES", startDate: "2026-09-11", cutDate: "2026-10-10", dueDate: "2026-10-30" });
  assert.equal(record(moved.body.cycle).displayStatus, "PAYMENT_PENDING");
  assert.equal(f.state().status, "PAYMENT_PENDING");
});

test("guardar total reemplaza el anterior; repetir no acumula y disminuir reabre", async () => {
  const f = fixture();
  for (const amount of [1, 1000, 1000, 500]) {
    const result = await f.patch({ action: "MARK_AS_PAID", paidAmount: amount, paidAt: "2026-10-20" });
    assert.equal(result.status, 200);
    assert.equal(record(result.body.cycle).pendingAmount, 1000 - amount);
  }
  assert.equal(f.state().paidAmount, 500);
  const cleared = await f.patch({ action: "MARK_AS_PAID", paidAmount: 0 });
  assert.equal(record(cleared.body.cycle).pendingAmount, 1000);
  assert.equal(record(cleared.body.cycle).paidAt, null);
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

const bbva = {
  month: 9, startDate: "2026-08-22T12:00:00Z", cutDate: "2026-09-21T12:00:00Z", dueDate: "2026-10-12T12:00:00Z",
  statementAmount: "8355.209999999999", paidAmount: 6855.71, paidAt: "2026-10-12T12:00:00Z",
};
const refund = { action: "UPDATE_POST_CUT_CREDIT", postCutCreditAmount: "1499.50", postCutCreditDate: "2026-10-05", postCutCreditNotes: "Merpago*mercadolibre · devolución confirmada" };

test("BBVA: devolución posterior liquida septiembre sin modificar estado, pago ni cálculo de cargos", async () => {
  const f = fixture(bbva);
  const before = await f.get("card-cycles");
  for (let retry = 0; retry < 2; retry++) {
    const response = await f.patch(refund);
    assert.equal(response.status, 200);
    assert.equal(record(response.body.cycle).pendingAmount, 0);
    assert.equal(record(response.body.cycle).paymentDueAmount, 6855.71);
    assert.equal(record(response.body.cycle).isSettled, true);
    assert.equal(record(response.body.cycle).excessAmount, 0);
  }
  assert.equal(f.state().statementAmount, bbva.statementAmount);
  assert.equal(f.state().paidAmount, bbva.paidAmount);
  assert.equal(f.state().paidAt, bbva.paidAt);
  for (const route of ["card-cycles", "dashboard"]) {
    const response = await f.get(route);
    assert.equal(response.status, 200);
    const cycle = array(response.body.cycles)[0];
    assert.equal(record(cycle).paymentStatus, "PAID");
    assert.equal(record(cycle).calculatedAmount, record(array(before.body.cycles)[0]).calculatedAmount);
    assert.equal(getDashboardPayment(record(cycle), now).amount, 6855.71);
    if (route === "dashboard") assert.equal(array(response.body.importantNotices).some(n => record(n).type === "CARD_PAYMENT"), false);
  }
});

test("reducir o retirar devolución reabre el saldo y los avisos; deshacer pago conserva la devolución", async () => {
  const f = fixture(bbva);
  await f.patch(refund);
  assert.equal(record((await f.patch({ ...refund, postCutCreditAmount: "1499.49" })).body.cycle).pendingAmount, 0.01);
  const dashboard = await f.get("dashboard");
  assert.equal(record(array(dashboard.body.importantNotices).find(n => record(n).type === "CARD_PAYMENT")).amount, 0.01);
  await f.patch(refund);
  const undone = await f.patch({ action: "UNMARK_AS_PAID" });
  assert.equal(record(undone.body.cycle).pendingAmount, 6855.71);
  assert.equal(record(undone.body.cycle).postCutCreditAmount, 1499.5);
  const cleared = await f.patch({ action: "UPDATE_POST_CUT_CREDIT", postCutCreditAmount: 0 });
  assert.equal(record(cleared.body.cycle).pendingAmount, 8355.21);
  assert.equal(record(cleared.body.cycle).postCutCreditDate, null);
  assert.equal(record(cleared.body.cycle).postCutCreditNotes, null);
});

test("devolución total cubre sin pago ficticio; parcial sin pago conserva avisos; excedente se informa", async () => {
  const f = fixture({ ...bbva, paidAmount: null, paidAt: null });
  const partial = await f.patch(refund);
  assert.equal(record(partial.body.cycle).pendingAmount, 6855.71);
  assert.equal(record(partial.body.cycle).isSettled, false);
  const full = await f.patch({ ...refund, postCutCreditAmount: "8355.21" });
  assert.equal(record(full.body.cycle).paymentStatus, "NO_PAYMENT_DUE");
  assert.equal(record(full.body.cycle).paidAmount, null);
  assert.equal(record(full.body.cycle).paidAt, null);
  const excess = fixture({ ...bbva, paidAmount: 6885.71 });
  assert.equal(record((await excess.patch(refund)).body.cycle).excessAmount, 30);
});

test("bonificaciones de cargos y otro corte no descuentan de nuevo una devolución del pago", () => {
  const cycle = { ...base, ...bbva, credits: [{ amount: 1499.5 }] };
  assert.equal(getCyclePaymentState(cycle, now).pendingAmount, 1499.5);
  const adjusted = { ...cycle, postCutCreditAmount: 1499.5 };
  assert.equal(getCyclePaymentState(adjusted, now).pendingAmount, 0);
  assert.equal(getCyclePaymentState({ ...base, month: 10, statementAmount: 500 }, now).pendingAmount, 500);
  assert.equal(getCyclePaymentState({ ...adjusted, statementAmount: null }, now).paymentStatus, "UNCONFIRMED");
  assert.equal(getDashboardPayment({ ...adjusted, calculatedAmount: 700 }, new Date("2026-09-20T12:00:00Z")).amount, 700);
});

test("devoluciones: validación de importe, evidencia, fecha, corte y propietario sin escrituras", async () => {
  const f = fixture(bbva);
  const invalids = [
    { postCutCreditAmount: -1 }, { postCutCreditAmount: "" }, { postCutCreditAmount: 0.001 },
    { postCutCreditAmount: "8355.22" }, { postCutCreditDate: "2026-09-21" }, { postCutCreditDate: "2026-09-20" },
    { postCutCreditDate: "2026-02-30" }, { postCutCreditDate: "2026-10-26" }, { postCutCreditDate: null },
    { postCutCreditNotes: " " }, { postCutCreditNotes: {} }, { postCutCreditNotes: "a".repeat(2001) },
  ];
  for (const fields of invalids) assert.ok([400, 409].includes((await f.patch({ ...refund, ...fields })).status), JSON.stringify(fields));
  assert.equal((await f.patch({ ...refund, id: "another-owner-cycle" })).status, 404);
  assert.equal((await fixture({ ...bbva, statementAmount: null }).patch(refund)).status, 409);
  assert.equal(f.writes(), 0);
});

test("editar estado o fechas conserva coherencia de la devolución y rollback conserva evidencia", async () => {
  const f = fixture(bbva);
  await f.patch(refund);
  const before = f.state();
  assert.equal((await f.patch({ action: "UPDATE_STATEMENT", statementAmount: 1000 })).status, 409);
  assert.equal((await f.patch({ action: "UPDATE_DATES", startDate: "2026-09-01", cutDate: "2026-10-05", dueDate: "2026-10-15" })).status, 409);
  assert.deepEqual(f.state(), before);
  const reopened = await f.patch({ action: "UPDATE_STATEMENT", statementAmount: "8356.21" });
  assert.equal(record(reopened.body.cycle).pendingAmount, 1);
  const beforeFailure = f.state();
  f.fail();
  assert.equal((await f.patch({ ...refund, postCutCreditAmount: 0 })).status, 500);
  assert.deepEqual(f.state(), beforeFailure);
});
