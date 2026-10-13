const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");
const source = ["installmentStatements", "subscriptionStatements", "cardCredits", "cardCycles"]
  .map((name) => fs.readFileSync(path.join(root, `src/lib/calculations/${name}.js`), "utf8")
    .replace(/^import[\s\S]*?from\s+["'][^"']+["'];\r?\n/gm, "")
    .replace(/^export /gm, ""))
  .join("\n");
const ctx = vm.createContext({});
vm.runInContext(source, ctx);
const cycle = (month, year = 2024) => ({
  id: `cycle-${year}-${month}`, userId: "u", cardId: "card", year, month,
  startDate: new Date(Date.UTC(year, month - 2, 11, 12)),
  cutDate: new Date(Date.UTC(year, month - 1, 10, 12)),
  card: { id: "card", usualCutDay: 10 },
});
const purchase = {
  id: "purchase", cardId: "card", purchaseDate: "2024-07-05T18:00:00Z",
  totalAmount: 100, months: 1, status: "ACTIVE", initialPaymentsMade: 0,
};
const sub = {
  id: "sub", cardId: "card", name: "Servicio", paymentMethod: "CARD",
  amount: 100, chargeDay: 20, frequencyMonths: 1,
  startMonth: 7, startYear: 2024, isActive: true,
};
const expense = (id, date, amount = 100, extra = {}) => ({ id, cardId: "card", date, amount, ...extra });
const calc = (month, extras = {}) => ctx.calculateCycleAmount({ cycle: cycle(month), ...extras });

test("cuotas independientes del listado/detalle y sin mensualidad adicional al liquidar", () => {
  for (const status of ["ACTIVE", "PAID_OFF"]) {
    for (const earliest of [2024 * 12, 2024 * 12 + 7]) {
      assert.equal(calc(7, { purchases: [{ ...purchase, status }], cardEarliestCycleIndexMap: { card: earliest } }).calculatedAmount, 100);
      assert.equal(calc(8, { purchases: [{ ...purchase, status }], cardEarliestCycleIndexMap: { card: earliest } }).calculatedAmount, 0);
    }
  }
  assert.equal(calc(7, { purchases: [{ ...purchase, status: "CANCELLED" }] }).calculatedAmount, 0);
});

test("la fecha de corte incluye todo el día y la cuota siguiente empieza después", () => {
  const late = { ...purchase, purchaseDate: "2024-07-10T23:59:59Z", months: 2, totalAmount: 200 };
  assert.equal(ctx.getPurchaseCycleNumber(late, cycle(7)), 1);
  assert.equal(calc(7, { purchases: [late] }).calculatedAmount, 100);
  assert.equal(calc(7, { purchases: [{ ...late, purchaseDate: "2024-07-11T00:00:00Z" }] }).calculatedAmount, 0);
  assert.equal(calc(8, { purchases: [{ ...late, purchaseDate: "2024-07-11T00:00:00Z" }] }).includedPurchases[0].currentMonth, 1);
});

test("cuotas cruzan año y febrero corto; una compra liquidada no proyecta pagos futuros", () => {
  const december = { ...purchase, purchaseDate: "2024-12-11T18:00:00Z", months: 3 };
  assert.equal(ctx.getPurchaseCycleNumber(december, cycle(1, 2025)), 1);
  const february = { ...cycle(2, 2024), card: { usualCutDay: 31 }, cutDate: "2024-02-29T12:00:00Z" };
  const leapDay = { ...purchase, purchaseDate: "2024-02-29T18:00:00Z" };
  assert.equal(ctx.getPurchaseCycleNumber(leapDay, february), 1);
  assert.equal(ctx.shouldIncludePurchaseInCycle(leapDay, february), true);
  const futureYear = new Date().getUTCFullYear() + 2;
  const future = { ...purchase, status: "PAID_OFF", purchaseDate: `${futureYear}-07-05` };
  assert.equal(ctx.shouldIncludePurchaseInCycle(future, cycle(7, futureYear)), false);
});

test("gastos incluidos por día completo, sin huecos ni duplicación entre cortes", () => {
  const expenses = [
    expense("antes", "2024-06-10T23:59:59Z", 8),
    expense("inicio", "2024-06-11T00:00:00Z", 10),
    expense("corte", "2024-07-10T18:00:00Z", 20),
    expense("siguiente", "2024-07-11T00:00:00Z", 40),
  ];
  assert.equal(calc(7, { expenses }).expensesAmount, 30);
  assert.equal(calc(8, { expenses }).expensesAmount, 40);
});

test("frecuencia anual usa mes del cobro, nunca un mes previo al inicio", () => {
  const subscriptions = [{ ...sub, frequencyMonths: 12 }];
  assert.equal(calc(7, { subscriptions }).subscriptionsAmount, 0);
  assert.equal(calc(8, { subscriptions }).subscriptionsAmount, 100);
  assert.equal(calc(9, { subscriptions }).subscriptionsAmount, 0);
  assert.equal(ctx.calculateCycleAmount({ cycle: cycle(8, 2025), subscriptions }).subscriptionsAmount, 100);
});

test("recorre meses intermedios y ajusta día31 a febrero bisiesto", () => {
  const subscription = { ...sub, startYear: 2024, startMonth: 1, chargeDay: 31 };
  const longCycle = { ...cycle(4), startDate: "2024-01-01", cutDate: "2024-04-30T18:00:00Z" };
  const dates = ctx.getSubscriptionChargeDatesInsideCycle(subscription, longCycle);
  assert.equal(dates.length, 4);
  assert.equal(dates[1].toISOString(), "2024-02-29T12:00:00.000Z");
});

test("baja conserva cargo del mismo día, excluye posteriores", () => {
  const inactive = { ...sub, isActive: false, deactivatedAt: "2024-07-20T00:00:00Z" };
  assert.equal(calc(8, { subscriptions: [inactive] }).subscriptionsAmount, 100);
  assert.equal(calc(9, { subscriptions: [inactive] }).subscriptionsAmount, 0);
  assert.equal(calc(8, { subscriptions: [{ ...inactive, deactivatedAt: null }] }).subscriptionsAmount, 0);
});

test("gasto vinculado sustituye previsión y conserva importe real, incluso en otro ciclo", () => {
  const subscription = { ...sub, chargeDay: 10 };
  const expenses = [expense("real", "2024-07-11T18:00:00Z", 90, { subscriptionId: "sub" })];
  assert.equal(calc(7, { subscriptions: [subscription], expenses }).calculatedAmount, 0);
  const result = calc(8, { subscriptions: [subscription], expenses });
  assert.equal(result.expensesAmount, 90);
  assert.equal(result.subscriptionsAmount, 100); // Previsión de agosto, distinta del pago de julio.
  assert.equal(result.calculatedAmount, 190);
  assert.equal(calc(8, { subscriptions: [sub], expenses }).calculatedAmount, 90);
});

test("arrays sin mapas no mezclan tarjetas y otro plástico no elimina una previsión", () => {
  const expenses = [expense("otra", "2024-07-20", 700, { cardId: "other", subscriptionId: "sub" })];
  const result = calc(8, {
    expenses,
    subscriptions: [sub, { ...sub, id: "other-sub", cardId: "other", amount: 900 }],
    purchases: [{ ...purchase, cardId: "other", months: 12, totalAmount: 12000 }],
  });
  assert.equal(result.expensesAmount, 0);
  assert.equal(result.subscriptionsAmount, 100);
  assert.equal(result.purchasesAmount, 0);
  assert.equal(result.calculatedAmount, 100);
});

test("referencia verificada prevalece en cuota e importe y termina al completar meses", () => {
  const verified = { ...purchase, months: 3, totalAmount: 100, statementReconciliations: [
    { year: 2024, month: 8, paymentNumber: 1, amount: "31.99", remainingBalance: "68.01" },
  ] };
  assert.equal(calc(7, { purchases: [verified] }).purchasesAmount, 0);
  const august = calc(8, { purchases: [verified] });
  assert.equal(august.includedPurchases[0].currentMonth, 1);
  assert.equal(august.purchasesAmount, 31.99);
  assert.equal(calc(10, { purchases: [verified] }).includedPurchases[0].currentMonth, 3);
  assert.equal(calc(11, { purchases: [verified] }).purchasesAmount, 0);
});

test("partidas a centavos suman exactamente los subtotales mostrados y respetan estado cero", () => {
  const purchases = [1, 2, 3].map((id) => ({ ...purchase, id, months: 3, totalAmount: 1 }));
  const result = calc(7, { purchases, cycle: { ...cycle(7), statementAmount: 0 } });
  assert.equal(result.purchasesAmount, 0.99);
  assert.equal(result.calculatedAmount, 0.99);
  assert.equal(result.statementAmount, 0);
  assert.equal(result.difference, -0.99);
  assert.equal(result.includedPurchases.every((item) => item.amount === 0.33), true);
  const compact = calc(7, { purchases, includeBreakdown: false });
  assert.equal(compact.calculatedAmount, 0.99);
  assert.equal("includedPurchases" in compact, false);
});

test("bonificación se descuenta una sola vez y estado cero concilia", () => {
  const cy = cycle(7);
  const credit = { id: "credit", userId: "u", cycleId: cy.id, incomeId: "income", amount: 100,
    income: { id: "income", userId: "u", amount: 100, concept: "Bonificación" } };
  const result = calc(7, { cycle: { ...cy, credits: [credit], statementAmount: 0 }, purchases: [purchase] });
  assert.equal(result.grossCalculatedAmount, 100);
  assert.equal(result.creditsAmount, 100);
  assert.equal(result.calculatedAmount, 0);
  assert.equal(result.difference, 0);
  assert.equal(result.includedCredits.length, 1);
});
