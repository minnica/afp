const assert = require("node:assert/strict");
const { test } = require("node:test");
const { sourceLoader } = require("./helpers/load-source.cjs");
const { buildCurrentCardUsageWaivers, buildCardUsageWaivers, buildCardUsageWaiverHistory } = sourceLoader()("src/lib/calculations/cardUsageWaivers.js");
const card = { id: "nu", name: "Mi Nu", usagePolicy: { productKey: "NU" } };
const expense = (patch = {}) => ({ id: "expense", cardId: card.id, paymentMethod: "CARD", concept: "Compra", amount: 0.01, date: "2026-10-21T12:00:00Z", ...patch });
const cycle = {
  id: "cycle", cardId: card.id, year: 2026, month: 10, startDate: "2026-09-22", cutDate: "2026-10-21",
  usageReconciliation: { version: 1, source: "nu.pdf", sourceSha256: "a".repeat(64), startDate: "2026-09-22", cutDate: "2026-10-21" },
};
const args = (patch = {}) => ({ cards: [card], cyclesWithAmounts: [], expenses: [], subscriptions: [], purchases: [], now: new Date("2026-10-21T12:00:00Z"), ...patch });
const run = (patch = {}) => buildCurrentCardUsageWaivers(args(patch))[0];

test("Nu aparece por producto verificado aunque no haya ciclo y no inventa una meta monetaria", () => {
  const item = run();
  assert.equal(item.card.name, "Mi Nu");
  assert.equal(item.requirementType, "PURCHASE_FREQUENCY");
  assert.equal(item.minimumAmount, null);
  assert.equal(item.status, "NOT_MET");
  assert.equal(item.purchaseCount, 0);
  assert.equal(item.renewBy, null);
  assert.equal(buildCurrentCardUsageWaivers(args({ cards: [{ id: "unknown", name: "NU" }] })).length, 0);
});

test("cualquier importe positivo renueva 30 días, sin depender del mes ni del corte", () => {
  const inputs = args({ expenses: [expense()] });
  const before = JSON.stringify(inputs);
  const [item] = buildCurrentCardUsageWaivers(inputs);
  assert.equal(item.status, "MET");
  assert.equal(item.daysRemaining, 30);
  assert.equal(item.renewBy, "2026-11-20");
  assert.equal(item.lastPurchase.amount, 0.01);
  assert.equal(item.purchaseCount, 1);
  assert.equal(JSON.stringify(inputs), before);
  assert.equal(run({ expenses: [expense({ date: "2026-12-20" })], now: new Date("2026-12-31T12:00:00Z") }).renewBy, "2027-01-19");
  assert.equal(run({ expenses: [expense({ date: "2028-02-01" })], now: new Date("2028-02-29T12:00:00Z") }).renewBy, "2028-03-02");
});

test("el día 30 pide comprar hoy; el plazo conserva todo el día y cambia al siguiente", () => {
  for (const [day, status, remaining] of [["2026-11-19", "MET", 1], ["2026-11-20", "DUE_TODAY", 0], ["2026-11-21", "NOT_MET", -1]]) {
    for (const time of ["00:00:00", "23:59:59"]) {
      const item = run({ expenses: [expense()], now: new Date(`${day}T${time}Z`) });
      assert.equal(item.status, status);
      assert.equal(item.daysRemaining, remaining);
      assert.equal(item.isExempt, status !== "NOT_MET");
    }
  }
  const renewed = run({ expenses: [expense(), expense({ id: "renewal", date: "2026-11-20" })], now: new Date("2026-11-20T12:00:00Z") });
  assert.equal(renewed.status, "MET");
  assert.equal(renewed.renewBy, "2026-12-20");
});

test("futuros, capturas pendientes, efectivo, otra tarjeta e importes inválidos no acreditan compras", () => {
  for (const patch of [
    { date: "2026-10-22" }, { reconciliationStatus: "PENDING" }, { paymentMethod: "CASH" },
    { cardId: "other" }, { amount: 0 }, { amount: -1 }, { amount: "invalid" }, { amount: Infinity },
    { date: null }, { date: "invalid" },
  ]) assert.equal(run({ expenses: [expense(patch)] }).status, "NOT_MET", JSON.stringify(patch));
});

test("comisiones, impuestos bancarios, intereses y disposiciones no son compras", () => {
  for (const concept of ["Comisión por tarjeta", "IVA intereses", "Intereses Nu", "Disposición de efectivo", "Retiro en efectivo", "Anualidad"])
    assert.equal(run({ expenses: [expense({ concept })] }).status, "NOT_MET", concept);
  const verified = { ...cycle, usageReconciliation: { ...cycle.usageReconciliation, excludedExpenseIds: ["expense"] } };
  assert.equal(run({ cyclesWithAmounts: [verified], expenses: [expense({ concept: "Nombre editado" })] }).status, "NOT_MET");
  assert.equal(run({ expenses: [expense({ concept: "Compra", notes: "concepto bancario: COMISION BANCARIA;" })] }).status, "NOT_MET");
});

test("MSI cuenta solo en la fecha original, incluso liquidada; sus mensualidades no renuevan", () => {
  const purchase = { id: "msi", cardId: card.id, concept: "Compra a meses", purchaseDate: "2026-10-21", totalAmount: 300, months: 3, status: "PAID_OFF" };
  assert.equal(run({ purchases: [purchase] }).purchaseCount, 1);
  assert.equal(run({ purchases: [purchase], now: new Date("2026-11-21T12:00:00Z") }).status, "NOT_MET");
  for (const patch of [{ status: "CANCELLED" }, { reconciliationStatus: "PENDING" }, { purchaseDate: "2026-10-22" }])
    assert.equal(run({ purchases: [{ ...purchase, ...patch }] }).status, "NOT_MET");
});

test("suscripciones cuentan por gasto o evidencia verificada una vez, nunca por previsión", () => {
  const subscription = { id: "sub", cardId: card.id, name: "Servicio", amount: 99, paymentMethod: "CARD", chargeDay: 21, isActive: true };
  const receipt = { subscriptionId: subscription.id, name: "Servicio", date: "2026-10-21", amount: 99 };
  const verified = { ...cycle, usageReconciliation: { ...cycle.usageReconciliation, subscriptionCharges: [receipt] } };
  assert.equal(run({ subscriptions: [subscription] }).purchaseCount, 0);
  assert.equal(run({ subscriptions: [subscription], cyclesWithAmounts: [verified, { ...verified, id: "duplicate" }] }).purchaseCount, 1);
  const linked = expense({ subscriptionId: subscription.id, amount: 99 });
  assert.equal(run({ expenses: [linked], subscriptions: [subscription], cyclesWithAmounts: [verified] }).purchaseCount, 1);
  assert.equal(run({ expenses: [{ ...linked, reconciliationStatus: "PENDING" }], subscriptions: [subscription], cyclesWithAmounts: [verified] }).purchaseCount, 0);
  assert.equal(run({ cyclesWithAmounts: [{ ...verified, usageReconciliation: { ...verified.usageReconciliation, sourceSha256: "invalid" } }] }).purchaseCount, 0);
});

test("la última compra determina la renovación; las antiguas quedan fuera del listado reciente", () => {
  const item = run({ expenses: [expense({ id: "old", date: "2026-08-01" }), expense({ id: "latest", date: "2026-10-20" }), expense({ id: "earlier", date: "2026-10-10" })] });
  assert.equal(item.lastPurchase.id, "expense:latest");
  assert.equal(item.renewBy, "2026-11-19");
  assert.equal(item.purchaseCount, 2);
  assert.equal(run({ expenses: [expense({ date: "2026-08-01" })] }).lastPurchase.date, "2026-08-01");
});

test("Turbo no crea cortes históricos ni una posible comisión por falta de compras", () => {
  const input = args({ cyclesWithAmounts: [cycle], year: 2026, month: 10, now: new Date("2026-10-22T12:00:00Z") });
  assert.equal(buildCardUsageWaivers(input).length, 0);
  assert.equal(buildCardUsageWaiverHistory(input).length, 0);
});

test("Dashboard entrega Nu con fecha local del cliente y conserva el aislamiento del usuario", async () => {
  const reads = [];
  const table = (name, rows = []) => ({ findMany: async ({ where }) => { reads.push([name, where.userId]); return rows; } });
  const prisma = {
    card: table("card", [card]), dailyExpense: table("dailyExpense", [expense()]), cardCycle: table("cardCycle"),
    installmentPurchase: table("installmentPurchase"), subscription: table("subscription"), income: table("income"),
    category: table("category"), receivableAccount: table("receivableAccount"), payableAccount: table("payableAccount"),
  };
  const load = sourceLoader({
    "@/lib/prisma": { prisma },
    "next/server": { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } },
    "@supabase/supabase-js": { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: "owner" } } }) } }) },
  });
  for (const [clientDate, status] of [["2026-11-20", "DUE_TODAY"], ["2026-11-21", "NOT_MET"]]) {
    const response = await load("src/app/api/dashboard/route.js").GET({ url: `http://localhost/api/dashboard?clientDate=${clientDate}`, headers: new Headers({ authorization: "Bearer test" }) });
    assert.equal(response.status, 200);
    assert.equal(response.body.cardUsageWaiversCurrent[0].status, status);
    assert.equal(response.body.cardUsageWaiverHistory.length, 0);
  }
  assert.equal(reads.length > 0 && reads.every(([, userId]) => userId === "owner"), true);
});
