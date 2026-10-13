const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");
const helper = fs.readFileSync(
  path.join(root, "src/lib/calculations/installmentStatements.js"),
  "utf8",
).replace(/^export /gm, "");
const creditHelper = fs.readFileSync(
  path.join(root, "src/lib/calculations/cardCredits.js"), "utf8",
).replace(/^export /gm, "");
const cycleHelpers = ["subscriptionStatements", "cardCycles"]
  .map((name) => fs.readFileSync(path.join(root, `src/lib/calculations/${name}.js`), "utf8")
    .replace(/^import[\s\S]*?from\s+["'][^"']+["'];\r?\n/gm, "")
    .replace(/^export /gm, ""))
  .join("\n");
const original = {
  id: "rasuradora", cardId: "bbva", purchaseDate: "2025-11-21T12:00:00Z",
  totalAmount: 851.38, months: 12, status: "ACTIVE", initialPaymentsMade: 5,
};
const verified = {
  ...original,
  statementReconciliations: [{
    year: 2026, month: 8, paymentNumber: 9, amount: "71.00",
    remainingBalance: "212.38", source: "bbva.pdf",
  }],
};
const card = { id: "bbva", usualCutDay: 21 };
const cycle = (year, month) => ({
  year, month, cardId: "bbva", card,
  cutDate: new Date(Date.UTC(year, month - 1, 21, 12)).toISOString(),
});

function routeContext(file) {
  const source = fs.readFileSync(path.join(root, file), "utf8")
    .split("export async function GET")[0]
    .replace(/^import[\s\S]*?from\s+["'][^"']+["'];\r?\n/gm, "");
  const context = vm.createContext({});
  vm.runInContext(helper + "\n" + creditHelper + "\n" + cycleHelpers + "\n" + source, context);
  return context;
}

test("el corte bancario prevalece en tarjetas y dashboard, sin cambiar fecha de compra", () => {
  for (const file of ["src/app/api/card-cycles/route.js", "src/app/api/dashboard/route.js"]) {
    const context = routeContext(file);
    assert.equal(context.getPurchaseCycleNumber(original, cycle(2026, 8), { bbva: 2026 * 12 }), 10);
    assert.equal(context.getPurchaseCycleNumber(verified, cycle(2026, 8), 2026 * 12), 9);
    assert.equal(context.getMonthlyPaymentUsed(verified, cycle(2026, 8)), 71);
    assert.equal(verified.purchaseDate, original.purchaseDate);
    assert.equal(context.getPurchaseCycleNumber(verified, cycle(2026, 9), 2026 * 12), 10);
    assert.equal(context.getPurchaseCycleNumber(verified, cycle(2026, 11), 2026 * 12), 12);
    assert.equal(context.shouldIncludePurchaseInCycle(verified, cycle(2026, 12), 2026 * 12), false);
    // Un corte sin documento conserva un importe estimado, sin reutilizar como real el cargo de agosto.
    assert.equal(context.getMonthlyPaymentUsed(verified, cycle(2026, 7)), 70.95);
  }
});

test("la manta conserva 9/12 aunque falte el primer ciclo en la base", () => {
  const context = routeContext("src/app/api/card-cycles/route.js");
  const manta = {
    ...original, id: "manta", purchaseDate: "2025-11-24T12:00:00Z", totalAmount: 483.53,
  };
  assert.equal(context.getPurchaseCycleNumber(manta, cycle(2026, 8), 2026 * 12), 9);
  manta.statementReconciliations = [{
    year: 2026, month: 8, paymentNumber: 9, amount: "41.00", remainingBalance: "114.53",
  }];
  assert.equal(context.getPurchaseCycleNumber(manta, cycle(2026, 8), 2026 * 12), 9);
  assert.equal(context.getMonthlyPaymentUsed(manta, cycle(2026, 8)), 41);
});

test("la lista de compras muestra saldo y progreso del último documento verificado", () => {
  const context = routeContext("src/app/api/installment-purchases/route.js");
  const result = context.formatPurchase(verified);
  assert.equal(result.currentMonth, 9);
  assert.equal(result.remainingMonths, 3);
  assert.equal(result.monthlyPaymentUsed, 71);
  assert.equal(result.remainingBalance, 212.38);
  assert.equal(result.verifiedStatementDate, "2026-08");
  assert.equal(context.formatPurchase(original).currentMonth, 6);
});

test("los resúmenes mensuales usan la cuota verificada y terminan en el ciclo 12", () => {
  const context = routeContext("src/app/api/dashboard/route.js");
  assert.equal(context.shouldIncludePurchaseInMonth(verified, 2026, 8), true);
  assert.equal(context.shouldIncludePurchaseInMonth(verified, 2026, 11), true);
  assert.equal(context.shouldIncludePurchaseInMonth(verified, 2026, 12), false);
  assert.equal(context.shouldIncludePurchaseInMonth(verified, 2025, 11), false);
  const comparison = context.buildWeeklyComparison({
    expenses: [], purchases: [verified], currentYear: 2026, currentMonth: 8,
  });
  assert.equal(comparison.currMonthTotal, 71);
  assert.equal(comparison.weeks.reduce((sum, week) => sum + week.currTotal, 0), 71);
});

test("referencias inválidas se ignoran; varios cortes siguen la referencia más reciente", () => {
  const context = routeContext("src/app/api/card-cycles/route.js");
  const purchase = { ...verified, statementReconciliations: [
    { year: 2026, month: 13, paymentNumber: 9, amount: "71", remainingBalance: "212" },
    { year: 2026, month: 8, paymentNumber: 13, amount: "71", remainingBalance: "212" },
    { year: 2026, month: 8, paymentNumber: 9, amount: "", remainingBalance: "212" },
    { year: 2026, month: 8, paymentNumber: 9, amount: "71", remainingBalance: null },
  ] };
  assert.equal(context.getLatestInstallmentStatement(purchase), null);
  purchase.statementReconciliations.push(...verified.statementReconciliations,
    { year: 2026, month: 9, paymentNumber: 10, amount: "71", remainingBalance: "141.38" });
  assert.equal(context.getStatementCycleNumber(purchase, cycle(2027, 1)), 14);
  assert.equal(context.getLatestInstallmentStatement(purchase).month, 9);
});
