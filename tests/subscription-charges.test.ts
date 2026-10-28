import assert from 'node:assert/strict';
import { test } from 'node:test';
import { present, sparseCalculations } from './helpers/financial-fixtures';
import { sourceLoader } from './helpers/load-source.ts';
const ctx = sparseCalculations(sourceLoader()("src/lib/subscriptionCharges.ts"));
const sub = { id: "s", name: "Servicio", amount: 199, chargeDay: 15, startMonth: 1, startYear: 2026,
  frequencyMonths: 1, isActive: true, paymentMethod: "CARD" as const, cardId: "c", charges: [], dailyExpenses: [] };
const list = (subscription: import('../src/lib/calculations/types').FinancialSubscription = sub, extra: Partial<Parameters<typeof ctx.buildSubscriptionCharges>[0]> = {}) => ctx.buildSubscriptionCharges({ subscriptions: [subscription], month: "2026-10", today: "2026-10-15", ...extra });

test("aparece el día del cobro, sin generar gastos ni modificar los datos", () => {
  const before = JSON.stringify(sub);
  assert.equal(list(sub, { today: "2026-10-14" }).length, 0);
  assert.equal(present(list()[0]).status, "PENDING");
  assert.equal(JSON.stringify(sub), before);
  assert.equal(list(sub, { month: "2026-11" }).length, 0);
});

test("frecuencia, inicio, años y último día del mes", () => {
  assert.equal(ctx.subscriptionChargeDate({ ...sub, chargeDay: 31 }, "2026-02"), "2026-02-28");
  assert.equal(ctx.subscriptionChargeDate({ ...sub, chargeDay: 31, startYear: 2024 }, "2024-02"), "2024-02-29");
  assert.equal(ctx.subscriptionChargeDate({ ...sub, startMonth: 11 }, "2026-10"), null);
  assert.equal(ctx.subscriptionChargeDate({ ...sub, frequencyMonths: 3 }, "2026-11"), null);
  assert.equal(ctx.subscriptionChargeDate({ ...sub, frequencyMonths: 12 }, "2027-01"), "2027-01-15");
});

test("desactivar conserva los cobros hasta el día de baja", () => {
  assert.equal(list({ ...sub, isActive: false, deactivatedAt: "2026-10-14" }).length, 0);
  assert.equal(present(list({ ...sub, isActive: false, deactivatedAt: "2026-10-15" })[0]).status, "PENDING");
});

test("un gasto vinculado sustituye automáticamente el previsto", () => {
  const result = list({ ...sub, dailyExpenses: [{ id: "e", date: new Date("2026-10-15"), amount: 219, paymentMethod: "CASH" as const }] });
  assert.equal(present(result[0]).status, "CONFIRMED");
  assert.equal(present(result[0]).confirmedAmount, 219);
  assert.equal(present(result[0]).confirmedPaymentMethod, "CASH");
  assert.equal(present(result[0]).paymentMethod, "CARD");
});

test("el historial identifica la tarjeta real aunque la suscripción se pague habitualmente en efectivo", () => {
  const result = list({ ...sub, paymentMethod: "CASH" as const, cardId: null, dailyExpenses: [{ id: "e", date: new Date("2026-10-15"),
    amount: "135.50", paymentMethod: "CARD" as const, card: { name: "Nu" } }] })[0];
  assert.equal(present(result).confirmedAmount, 135.5);
  assert.equal(present(result).confirmedPaymentMethod, "CARD");
  assert.equal(present(result).confirmedCardName, "Nu");
  assert.equal(present(result).paymentMethod, "CASH");
});

test("la decisión identifica el período aunque el gasto se contabilice en otro mes", () => {
  const charges = [{ month: "2026-10", status: "CONFIRMED" as const, expenseId: "e" }];
  const subscription = { ...sub, charges, dailyExpenses: [{ id: "e", date: new Date("2026-11-01"), amount: 210 }] };
  assert.equal(present(list(subscription)[0]).status, "CONFIRMED");
  assert.equal(ctx.isSubscriptionChargeResolved(subscription, "2026-10"), true);
  assert.equal(ctx.isSubscriptionChargeResolved(subscription, "2026-12"), false);
});

test("omitir afecta solo ese mes y borrar el gasto confirmado devuelve el pendiente", () => {
  const skipped = { ...sub, charges: [{ month: "2026-10", status: "SKIPPED" as const, expenseId: null }] };
  assert.equal(present(list(skipped)[0]).status, "SKIPPED");
  assert.equal(ctx.isSubscriptionChargeResolved(skipped, "2026-10"), true);
  assert.equal(ctx.isSubscriptionChargeResolved(skipped, "2026-11"), false);
  const deleted = { ...sub, charges: [{ month: "2026-10", status: "CONFIRMED" as const, expenseId: null }] };
  assert.equal(present(list(deleted)[0]).status, "PENDING");
  assert.equal(ctx.isSubscriptionChargeResolved(deleted, "2026-10"), false);
});

test("evidencia bancaria válida reconoce el cobro sin crear otro gasto", () => {
  const cycle = { cardId: "c", year: 2026, month: 10, usageReconciliation: { version: 1, source: "estado.pdf", sourceSha256: "a".repeat(64),
    startDate: "2026-09-20", cutDate: "2026-10-19", subscriptionCharges: [{ subscriptionId: "s", date: "2026-10-15", amount: 179 }] } };
  const result = list(sub, { cycles: [cycle] });
  assert.equal(present(result[0]).status, "VERIFIED");
  assert.equal(present(result[0]).confirmedAmount, 179);
  assert.equal(present(list(sub, { cycles: [{ ...cycle, cardId: "another" }] })[0]).status, "PENDING");
  assert.equal(present(list(sub, { cycles: [{ ...cycle, usageReconciliation: { ...cycle.usageReconciliation, sourceSha256: "invalid" } }] })[0]).status, "PENDING");
});

test("rechaza fechas y meses inválidos", () => {
  for (const month of ["2026-00", "2026-13", "2026-1", "invalid"]) assert.equal(list(sub, { month }).length, 0);
  for (const day of ["2026-02-30", "invalid", "2026-13-01"]) assert.equal(ctx.validChargeDay(day), false);
});
