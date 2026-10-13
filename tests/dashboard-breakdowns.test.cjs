const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8")
  .replace(/^import[\s\S]*?from\s+["'][^"']+["'];\r?\n/gm, "")
  .replace(/^export /gm, "");
function context(route = "dashboard", globals = {}) {
  const ctx = vm.createContext({ URL, console, ...globals });
  const helpers = ["installmentStatements", "subscriptionStatements", "cardCredits", "cardCycles", "cycleDataQuality"]
    .map((name) => read(`src/lib/calculations/${name}.js`)).join("\n");
  vm.runInContext(helpers + "\n" + read(`src/app/api/${route}/route.js`), ctx);
  return ctx;
}
const ctx = context();
const card = { id: "card", name: "Tarjeta", usualCutDay: 10 };
const cycle = (month) => ({ id: `cycle-${month}`, cardId: card.id, card, year: 2024, month,
  startDate: new Date(Date.UTC(2024, month - 2, 11, 12)).toISOString(),
  cutDate: new Date(Date.UTC(2024, month - 1, 10, 12)).toISOString(),
  dueDate: new Date(Date.UTC(2024, month - 1, 28, 12)).toISOString(),
});
const subscription = { id: "sub", categoryId: "cat1", amount: 100, chargeDay: 20,
  isActive: true, startYear: 2024, startMonth: 1, frequencyMonths: 1, paymentMethod: "CASH" };

test("cero bancario prevalece sobre estimación en comparación y aviso", () => {
  const prev = { ...cycle(6), statementAmount: 30, calculatedAmount: 50 };
  const current = { ...cycle(7), statementAmount: 0, calculatedAmount: 100 };
  const result = ctx.buildCardMonthlyComparison({ cyclesWithAmounts: [prev, current], cards: [card], currentYear: 2024, currentMonth: 7 });
  assert.equal(result.data[0].currAmount, 0);
  assert.equal(result.data[0].currIsStatement, true);
  const notices = ctx.buildCardPaymentNotices([{ card, currentPayment: current }], new Date("2024-07-28T12:00:00Z"));
  assert.equal(notices[0].amount, 0);
  assert.match(notices[0].description, /Estado de cuenta: \$0\.00/);
});

test("cuotas mensuales no se acortan con pagos previos ni siguen fuera del plazo", () => {
  const purchase = { id: "p", cardId: card.id, card, purchaseDate: "2024-07-05T18:00:00Z", months: 12,
    initialPaymentsMade: 6, status: "ACTIVE", totalAmount: 1200 };
  assert.equal(ctx.shouldIncludePurchaseInMonth(purchase, 2024, 6), false);
  assert.equal(ctx.shouldIncludePurchaseInMonth(purchase, 2025, 1), true);
  assert.equal(ctx.shouldIncludePurchaseInMonth(purchase, 2025, 6), true);
  assert.equal(ctx.shouldIncludePurchaseInMonth(purchase, 2025, 7), false);
  assert.equal(ctx.shouldIncludePurchaseInMonth({ ...purchase, status: "PAID_OFF" }, 2024, 7), true);
});

test("gasto vinculado sustituye previsión también al cambiar categoría o método", () => {
  const expense = { id: "e", categoryId: "cat2", subscriptionId: "sub", amount: 80, date: "2024-07-20T18:00:00Z", cardId: card.id, paymentMethod: "CARD" };
  const args = { expenses: [expense], subscriptions: [subscription], purchases: [], currentYear: 2024, currentMonth: 7 };
  const weeks = ctx.buildWeeklyComparison(args);
  assert.equal(weeks.currMonthTotal, 80);
  assert.equal(weeks.weeks.reduce((sum, row) => sum + row.currTotal, 0), 80);
  assert.equal(ctx.buildWeeklyComparison({ ...args, categoryId: "cat1" }).currMonthTotal, 0);
  assert.equal(ctx.buildWeeklyComparison({ ...args, categoryId: "cat2" }).currMonthTotal, 80);
  const categories = ctx.buildCategoryBreakdown({ ...args, categories: [{ id: "cat1" }, { id: "cat2" }], year: 2024, month: 7 });
  assert.equal(categories.length, 1);
  assert.equal(categories[0].id, "cat2");
  assert.equal(categories[0].total, 80);
});

test("baja en el mismo día conserva cargo en resúmenes y desglose", () => {
  const sub = { ...subscription, isActive: false, deactivatedAt: "2024-07-20T00:00:00Z" };
  assert.equal(ctx.isSubscriptionChargeableInMonth(sub, 2024, 7), true);
  assert.equal(ctx.isSubscriptionChargeableInMonth(sub, 2024, 8), false);
});

test("descuento conciliado conserva importe en categorías, semanas y ciclo", () => {
  const sub = { ...subscription, cardId: card.id, paymentMethod: "CARD" };
  const august = { ...cycle(8), usageReconciliation: { version: 1, source: "estado.pdf", sourceSha256: "a".repeat(64),
    startDate: "2024-07-11", cutDate: "2024-08-10", subscriptionCharges: [{ subscriptionId: sub.id, date: "2024-07-20", amount: 70, applyToCycleAmount: true }] } };
  const args = { expenses: [], subscriptions: [sub], purchases: [], cycles: [august], currentYear: 2024, currentMonth: 7 };
  assert.equal(ctx.buildWeeklyComparison(args).currMonthTotal, 70);
  assert.equal(ctx.buildCategoryBreakdown({ ...args, categories: [{ id: "cat1" }], year: 2024, month: 7 })[0].total, 70);
  assert.equal(ctx.calculateCycleAmount({ cycle: august, subscriptions: [sub] }).subscriptionsAmount, 70);
});

test("fechas consecutivas, solapadas y con huecos se distinguen sin mutar ciclos", () => {
  const june = cycle(6), july = cycle(7);
  const before = JSON.stringify([june, july]);
  assert.equal(ctx.getCyclePeriodWarnings(july, [june, july]).length, 0);
  assert.match(ctx.getCyclePeriodWarnings({ ...july, startDate: june.cutDate }, [june, july])[0], /superpone/);
  assert.match(ctx.getCyclePeriodWarnings({ ...july, startDate: "2024-06-12" }, [june, july])[0], /1 día\(s\) sin cubrir/);
  assert.equal(JSON.stringify([june, july]), before);
});

test("API listado/detalle devuelve mismos importes y obtiene vínculos de gastos", async () => {
  const cycles = [cycle(1), cycle(7), cycle(8)];
  const purchase = { id: "p", cardId: card.id, purchaseDate: "2024-07-05", totalAmount: 100, months: 1, status: "ACTIVE" };
  const fake = { cardCycle: { findMany: async ({ where }) => cycles.filter(c => !where.id || c.id === where.id) },
    dailyExpense: { findMany: async ({ select }) => { assert.equal(select.subscriptionId, true); assert.equal(select.paymentMethod, true); return []; } },
    subscription: { findMany: async () => [] }, installmentPurchase: { findMany: async () => [purchase] } };
  const route = context("card-cycles", { prisma: fake, NextResponse: { json: (body) => body } });
  const list = await route.GET({ url: "http://localhost/api/card-cycles?userId=u" });
  const detail = await route.GET({ url: "http://localhost/api/card-cycles?userId=u&cycleId=cycle-8" });
  assert.equal(list.cycles.find(c => c.id === "cycle-8").calculatedAmount, 0);
  assert.equal(detail.cycle.calculatedAmount, 0);
  assert.equal(detail.cycle.includedPurchases.length, 0);
});
