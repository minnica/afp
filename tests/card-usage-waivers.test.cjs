const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const { test } = require("node:test");
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/lib/calculations/cardUsageWaivers.js"), "utf8").replace(/^export /gm, ""), ctx);
const card = { id: "card", name: "Nombre editable", usagePolicy: { productKey: "HSBC_ZERO", verifiedAt: "2026-10-11" } };
const cycle = { id: "oct", cardId: card.id, year: 2026, month: 10, startDate: "2026-09-11T12:00:00Z", cutDate: "2026-10-10T12:00:00Z" };
const evidence = { version: 1, source: "statement.pdf", sourceSha256: "a".repeat(64), startDate: "2026-09-09", cutDate: "2026-10-08", subscriptionCharges: [] };
const expense = (id, amount, concept = "Compra", date = "2026-09-20T12:00:00Z") => ({ id, cardId: card.id, amount, concept, date, paymentMethod: "CARD" });
const subscription = { id: "sub", cardId: card.id, name: "Servicio", amount: 399, paymentMethod: "CARD", chargeDay: 3, frequencyMonths: 1, startMonth: 1, startYear: 2026, isActive: true };
const run = (changes = {}) => ctx.buildCardUsageWaivers({ cards: [card], cyclesWithAmounts: [cycle], expenses: [], subscriptions: [], purchases: [], year: 2026, month: 10, now: new Date("2026-10-11T12:00:00Z"), ...changes });

test("HSBC octubre: comisiones e IVA no completan los $300", () => {
  const rows = [expense("a", "293.38"), expense("b", 186, "Administración de tarjeta HSBC1"), expense("c", "29.76", "IVA de comisión HSBC1")];
  const [result] = run({ expenses: rows });
  assert.equal(result.eligibleSpend, 293.38);
  assert.equal(result.remainingAmount, 6.62);
  assert.equal(result.breakdown.excludedAmount, 215.76);
  assert.equal(result.isExempt, false);
  assert.equal(result.status, "NOT_MET");
  assert.equal(rows.length, 3);
});

test("Banamex octubre: la inactividad no convierte $272.95 en meta cumplida", () => {
  const [result] = run({ cards: [{ ...card, usagePolicy: { productKey: "BANAMEX_JOY" } }], expenses: [
    expense("a", 185), expense("b", 39.95), expense("c", 48),
    expense("d", 149, "Comisión por inactividad Banamex1"), expense("e", 23.84, "IVA de comisión por inactividad Banamex1"),
  ] });
  assert.equal(result.eligibleSpend, 272.95);
  assert.equal(result.remainingAmount, 27.05);
  assert.equal(result.isExempt, false);
});

test("la regla depende del producto verificado y sobrevive a renombrar una tarjeta", () => {
  for (const [productKey, minimum] of [["HSBC_ZERO", 300], ["BANAMEX_JOY", 300], ["SANTANDER_LIKEU", 200]]) {
    assert.equal(run({ cards: [{ ...card, name: "Mi tarjeta", usagePolicy: { productKey } }] })[0].minimumAmount, minimum);
  }
  for (const name of ["HSBC 2Now", "Banamex Oro", "Santander Platinum", "HSBC 1"]) {
    assert.equal(run({ cards: [{ id: "card", name }] }).length, 0);
  }
});

test("las fechas bancarias verificadas incluyen compras omitidas por el rango estimado", () => {
  const [result] = run({ cyclesWithAmounts: [{ ...cycle, usageReconciliation: evidence }], expenses: [
    expense("before", 300, "Compra", "2026-09-09T23:59:59Z"),
    expense("after", 400, "Compra", "2026-10-09T12:00:00Z"),
  ] });
  assert.equal(result.eligibleSpend, 300);
  assert.equal(result.selectedCycle.cutDate, "2026-10-08T12:00:00.000Z");
  assert.equal(cycle.cutDate, "2026-10-10T12:00:00Z");
});

test("una nota bancaria o evidencia conserva la exclusión al cambiar el concepto", () => {
  const [result] = run({ cyclesWithAmounts: [{ ...cycle, usageReconciliation: { ...evidence, excludedExpenseIds: ["explicit"] } }], expenses: [
    { ...expense("note", 186, "Nombre corregido"), notes: "Fuente: estado.pdf; concepto bancario original: ADMINISTRACION TARJETA TITULAR; corte 2026-10-08." },
    expense("explicit", 23.84, "Nombre distinto"), expense("purchase", 99, "Curso de intereses y comisiones"),
  ] });
  assert.equal(result.eligibleSpend, 99);
  assert.equal(result.breakdown.excludedExpenses.length, 2);
});

test("una comisión comercial no se confunde con una comisión del banco", () => {
  const [result] = run({ expenses: [expense("artist", 300, "Comisión por ilustración"), expense("uber", 10, "Comisión Uber")] });
  assert.equal(result.eligibleSpend, 310);
  assert.equal(result.breakdown.excludedAmount, 0);
});

test("futuras y vencidas sin evidencia siguen siendo proyecciones", () => {
  for (const now of ["2026-09-01T12:00:00Z", "2026-10-11T12:00:00Z"]) {
    const [result] = run({ now: new Date(now), subscriptions: [subscription] });
    assert.equal(result.eligibleSpend, 0);
    assert.equal(result.projectedAmount, 399);
    assert.equal(result.isExempt, false);
  }
});

test("una suscripción confirmada conserva importe y fecha históricos", () => {
  const confirmed = { ...evidence, subscriptionCharges: [{ subscriptionId: "sub", name: "Servicio", date: "2026-10-03", amount: "379.00" }] };
  const [result] = run({ cyclesWithAmounts: [{ ...cycle, usageReconciliation: confirmed }], subscriptions: [{ ...subscription, amount: 499, isActive: false, deactivatedAt: "2026-10-05" }] });
  assert.equal(result.eligibleSpend, 379);
  assert.equal(result.projectedAmount, 0);
  assert.equal(result.isExempt, true);
});

test("gasto vinculado, recibo y calendario no triplican una suscripción", () => {
  const confirmed = { ...evidence, subscriptionCharges: [{ subscriptionId: "sub", name: "Servicio", date: "2026-10-03", amount: 399 }] };
  const [result] = run({ cyclesWithAmounts: [{ ...cycle, usageReconciliation: confirmed }], subscriptions: [subscription], expenses: [{ ...expense("actual", 399, "Servicio", "2026-10-03T12:00:00Z"), subscriptionId: "sub" }] });
  assert.equal(result.eligibleSpend, 399);
  assert.equal(result.projectedAmount, 0);
  assert.equal(result.breakdown.includedSubscriptions.length, 0);
});

test("frecuencia bimestral usa el mes real del cobro y respeta desactivación", () => {
  const [result] = run({ subscriptions: [{ ...subscription, chargeDay: 28, frequencyMonths: 2 }] });
  assert.equal(result.projectedAmount, 399); // 28 septiembre, no octubre.
  const [cancelled] = run({ subscriptions: [{ ...subscription, chargeDay: 28, isActive: false, deactivatedAt: "2026-09-20" }] });
  assert.equal(cancelled.projectedAmount, 0);
});

test("dos cargos reales iguales conservan su multiplicidad al emparejar un gasto vinculado", () => {
  const receipt = { subscriptionId: "sub", name: "Servicio", date: "2026-10-03", amount: 399 };
  const [result] = run({ cyclesWithAmounts: [{ ...cycle, usageReconciliation: { ...evidence, subscriptionCharges: [receipt, { ...receipt }] } }],
    subscriptions: [subscription], expenses: [{ ...expense("actual", 399, "Servicio", "2026-10-03"), subscriptionId: "sub" }] });
  assert.equal(result.eligibleSpend, 798);
  assert.equal(result.breakdown.includedSubscriptions.length, 1);
  assert.equal(result.projectedAmount, 0);
});

test("un estado revisado no inventa una suscripción ausente", () => {
  const [result] = run({ cyclesWithAmounts: [{ ...cycle, usageReconciliation: evidence }], subscriptions: [subscription] });
  assert.equal(result.projectedAmount, 0);
  assert.equal(result.eligibleSpend, 0);
});

test("MSI nueva cuenta una vez aunque ya esté liquidada; cuotas antiguas y canceladas no", () => {
  const purchase = { id: "new", cardId: card.id, totalAmount: 900, months: 3, purchaseDate: "2026-09-20", status: "PAID_OFF" };
  const [result] = run({ purchases: [purchase, { ...purchase, id: "old", purchaseDate: "2026-07-01", status: "ACTIVE" }, { ...purchase, id: "cancelled", status: "CANCELLED" }] });
  assert.equal(result.eligibleSpend, 900);
  assert.equal(result.breakdown.includedInstallmentPurchases.length, 1);
});

test("MSI y gastos de fecha futura no marcan cumplimiento; centavos exactos", () => {
  const [future] = run({ now: new Date("2026-09-15T12:00:00Z"), expenses: [expense("future", 1000)], purchases: [{ id: "p", cardId: card.id, totalAmount: 900, months: 3, purchaseDate: "2026-09-20", status: "ACTIVE" }] });
  assert.equal(future.eligibleSpend, 0);
  assert.equal(future.projectedAmount, 1900);
  const [exact] = run({ expenses: [expense("a", 299.99), expense("b", 0.01)] });
  assert.equal(exact.eligibleSpend, 300);
  assert.equal(exact.isExempt, true);
});

test("sin ciclo y evidencia inválida nunca producen un cumplimiento inventado", () => {
  assert.equal(run({ cyclesWithAmounts: [] })[0].status, "NO_CYCLE");
  const [invalid] = run({ cyclesWithAmounts: [{ ...cycle, usageReconciliation: { ...evidence, cutDate: "2026-11-08" } }] });
  assert.equal(invalid.periodVerified, false);
});
