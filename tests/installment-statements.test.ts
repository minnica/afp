import assert from 'node:assert/strict';
import { test } from 'node:test';
import { present } from './helpers/financial-fixtures';

import { routeContext as loadRoute } from './helpers/legacy-route-context.ts';
const original: import('./helpers/financial-fixtures').Sparse<import('../src/lib/calculations/types').FinancialPurchase> & { id: string; purchaseDate: string } = {
  id: "rasuradora", cardId: "bbva", purchaseDate: "2025-11-21T12:00:00Z",
  totalAmount: 851.38, months: 12, status: "ACTIVE" as const, initialPaymentsMade: 5,
};
const verified = {
  ...original,
  statementReconciliations: [{
    year: 2026, month: 8, paymentNumber: 9, amount: "71.00",
    remainingBalance: "212.38", source: "bbva.pdf",
  }],
};
const card = { id: "bbva", usualCutDay: 21 };
const cycle = (year: number, month: number) => ({
  year, month, cardId: "bbva", card,
  cutDate: new Date(Date.UTC(year, month - 1, 21, 12)).toISOString(),
});


test("el corte bancario prevalece en tarjetas y dashboard, sin cambiar fecha de compra", () => {
  for (const file of ["src/app/api/card-cycles/route.ts", "src/app/api/dashboard/route.ts"]) {
    const context = loadRoute(file.includes('/dashboard/') ? 'dashboard' : 'card-cycles');
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
  const context = loadRoute("card-cycles");
  const manta: typeof original = {
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
  const context = loadRoute("installment-purchases");
  const result = context.formatPurchase(verified);
  assert.equal(result.currentMonth, 9);
  assert.equal(result.remainingMonths, 3);
  assert.equal(result.monthlyPaymentUsed, 71);
  assert.equal(result.remainingBalance, 212.38);
  assert.equal(result.verifiedStatementDate, "2026-08");
  assert.equal(context.formatPurchase(original).currentMonth, 6);
});

test("los resúmenes mensuales usan la cuota verificada y terminan en el ciclo 12", () => {
  const context = loadRoute("dashboard");
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
  const context = loadRoute("card-cycles");
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
  assert.equal(present(context.getLatestInstallmentStatement(purchase)).month, 9);
});
