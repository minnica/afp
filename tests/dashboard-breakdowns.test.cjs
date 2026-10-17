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
  const ctx = vm.createContext({ URL, console, requireApiUser: async () => ({ id: "u" }), apiAccessErrorResponse: () => null, ...globals });
  const helpers = ["../subscriptionCharges", "installmentStatements", "subscriptionStatements", "cardCredits", "cardCycles", "cardCyclePayments", "cycleDataQuality", "cardUsageWaivers"]
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

test("cero bancario prevalece sobre estimación y no genera aviso de pago", () => {
  const prev = { ...cycle(6), statementAmount: 30, calculatedAmount: 50 };
  const current = { ...cycle(7), statementAmount: 0, calculatedAmount: 100 };
  const result = ctx.buildCardMonthlyComparison({ cyclesWithAmounts: [prev, current], cards: [card], currentYear: 2024, currentMonth: 7 });
  assert.equal(result.data[0].currAmount, 0);
  assert.equal(result.data[0].currIsStatement, true);
  const notices = ctx.buildCardPaymentNotices([{ card, currentPayment: current }], new Date("2024-07-28T12:00:00Z"));
  assert.equal(notices.length, 0);
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

test("API conserva diciembre anterior para enero sin mezclar diciembre futuro", async () => {
  const expense = (id, date, amount) => ({ id, date, amount, categoryId: "cat", paymentMethod: "CASH" });
  const fake = {
    card: { findMany: async () => [] },
    cardCycle: { findMany: async () => [] },
    dailyExpense: { findMany: async () => [expense("anterior", "2025-12-20T12:00:00Z", 125.43), expense("enero", "2026-01-20T12:00:00Z", 50), expense("futuro", "2026-12-20T12:00:00Z", 999)] },
    subscription: { findMany: async () => [] },
    installmentPurchase: { findMany: async () => [] },
    income: { findMany: async () => [] },
    category: { findMany: async () => [{ id: "cat", name: "Gastos" }] },
    receivableAccount: { findMany: async () => [] },
  };
  const route = context("dashboard", { prisma: fake, NextResponse: { json: (body) => body } });
  const response = await route.GET({ url: "http://localhost/api/dashboard?userId=u&clientDate=2026-10-13" });
  assert.equal(response.categoryBreakdownByMonth[-1][0].total, 125.43);
  assert.equal(response.categoryBreakdownByMonth[0][0].total, 50);
  assert.equal(response.categoryBreakdownByMonth[11][0].total, 999);
  assert.equal(response.cardUsageWaiversCurrent.length, 0);
  assert.equal(response.cardUsageWaiverHistory.length, 0);
});

test("API separa consumo vigente e historial sin cambiar los cortes financieros", async () => {
  const usageCard = { ...card, usagePolicy: { productKey: "HSBC_ZERO" } };
  const storedCycles = [
    { ...cycle(10), card: usageCard, year: 2026, startDate: "2026-09-11", cutDate: "2026-10-10", dueDate: "2026-10-28" },
    { ...cycle(11), card: usageCard, year: 2026, startDate: "2026-10-11", cutDate: "2026-11-10", dueDate: "2026-11-28" },
  ];
  const fake = {
    card: { findMany: async () => [usageCard] }, cardCycle: { findMany: async () => storedCycles },
    dailyExpense: { findMany: async () => [{ id: "actual", concept: "Compra", date: "2026-10-12", amount: 100, cardId: card.id, paymentMethod: "CARD" }] },
    subscription: { findMany: async () => [] }, installmentPurchase: { findMany: async () => [] },
    income: { findMany: async () => [] }, category: { findMany: async () => [] }, receivableAccount: { findMany: async () => [] },
  };
  const route = context("dashboard", { prisma: fake, NextResponse: { json: (body) => body } });
  const before = JSON.stringify(storedCycles);
  const response = await route.GET({ url: "http://localhost/api/dashboard?userId=u&clientDate=2026-10-13" });
  assert.equal(response.cardUsageWaiversCurrent[0].selectedCycle.id, "cycle-11");
  assert.equal(response.cardUsageWaiversCurrent[0].remainingAmount, 200);
  assert.equal(response.cardUsageWaiverHistory[0].selectedCycle.id, "cycle-10");
  assert.equal(response.cardUsageWaiversByMonth[9][0].selectedCycle.id, "cycle-10");
  assert.equal(response.cycles.length, 2);
  assert.equal(JSON.stringify(storedCycles), before);
});

test("omitir o confirmar por período retira la previsión y el aviso de efectivo", () => {
  for (const decision of [{ status: "SKIPPED", expenseId: null }, { status: "CONFIRMED", expenseId: "e" }]) {
    const sub = { ...subscription, charges: [{ ...decision, month: "2024-07" }] };
    assert.equal(ctx.getMonthlySubscriptions([sub], [], [], 2024, 7).length, 0);
    assert.equal(ctx.getMonthlySubscriptions([sub], [], [], 2024, 8).length, 1);
    assert.equal(ctx.buildCashSubscriptionNotices([sub], new Date("2024-07-21T12:00:00Z")).length, 0);
  }
});
