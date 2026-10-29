import assert from 'node:assert/strict';
import { test } from 'node:test';
import { branch, present, sparseCalculations } from './helpers/financial-fixtures';
import { sourceLoader } from './helpers/load-source.ts';
const ctx = sparseCalculations(sourceLoader()("src/lib/calculations/cardUsageWaivers.ts"));
const card = { id: "card", name: "Nombre editable", usagePolicy: { productKey: "HSBC_ZERO", verifiedAt: "2026-10-11" } };
const cycle = { id: "oct", cardId: card.id, year: 2026, month: 10, startDate: "2026-09-11T12:00:00Z", cutDate: "2026-10-10T12:00:00Z" };
const evidence = { version: 1, source: "statement.pdf", sourceSha256: "a".repeat(64), startDate: "2026-09-09", cutDate: "2026-10-08", subscriptionCharges: [] };
const expense = (id: string, amount: import('../src/lib/calculations/types').MoneyValue, concept = "Compra", date = "2026-09-20T12:00:00Z") => ({ id, cardId: card.id, amount, concept, date, paymentMethod: "CARD" as const });
const subscription = { id: "sub", cardId: card.id, name: "Servicio", amount: 399, paymentMethod: "CARD" as const, chargeDay: 3, frequencyMonths: 1, startMonth: 1, startYear: 2026, isActive: true };
const run = (changes = {}) => ctx.buildCardUsageWaivers({ cards: [card], cyclesWithAmounts: [cycle], expenses: [], subscriptions: [], purchases: [], year: 2026, month: 10, now: new Date("2026-10-11T12:00:00Z"), ...changes });
const current = (changes = {}) => ctx.buildCurrentCardUsageWaivers({ cards: [card], cyclesWithAmounts: [cycle], expenses: [], subscriptions: [], purchases: [], now: new Date("2026-10-13T12:00:00Z"), ...changes });

test("en curso reúne octubre y noviembre según el período de cada tarjeta", () => {
  const secondCard = { ...card, id: "second" };
  const next = { ...cycle, id: "nov", month: 11, startDate: "2026-10-11", cutDate: "2026-11-10", status: "PAID" as const };
  const pending = { ...cycle, id: "second-oct", cardId: secondCard.id, startDate: "2026-09-19", cutDate: "2026-10-18" };
  const cycles = [cycle, next, pending];
  const before = JSON.stringify(cycles);
  const results = current({ cards: [card, secondCard], cyclesWithAmounts: cycles,
    expenses: [expense("old", 500), expense("new", 125, "Compra actual", "2026-10-12")],
  });
  assert.equal(results.length, 2);
  assert.equal(present(branch(present(results[0]), 'selectedCycle').selectedCycle).id, "nov");
  assert.equal(branch(present(results[0]), 'eligibleSpend').eligibleSpend, 125);
  assert.equal(branch(present(results[0]), 'remainingAmount').remainingAmount, 175);
  assert.equal(present(branch(present(results[1]), 'selectedCycle').selectedCycle).id, "second-oct");
  assert.equal(JSON.stringify(cycles), before);
});

test("el día de corte completo sigue vigente y al día siguiente cambia de período", () => {
  const next = { ...cycle, id: "nov", month: 11, startDate: "2026-10-11", cutDate: "2026-11-10" };
  const cyclesWithAmounts = [cycle, next];
  assert.equal(present(branch(present(current({ cyclesWithAmounts, now: new Date("2026-10-11T05:59:59Z") })[0]), 'selectedCycle').selectedCycle).id, "oct");
  assert.equal(present(branch(present(current({ cyclesWithAmounts, now: new Date("2026-10-11T06:00:00Z") })[0]), 'selectedCycle').selectedCycle).id, "nov");
});

test("cortes terminados salen de en curso aunque hayan cumplido o tengan cargos por confirmar", () => {
  for (const patch of [{ expenses: [expense("met", 400)] }, { subscriptions: [subscription] }]) {
    const [item] = current(patch);
    assert.equal(branch(present(item), 'selectedCycle').selectedCycle, null);
    assert.equal(present(item).status, "NO_CYCLE");
    assert.equal(present(item).isExempt, false);
  }
});

test("la selección vigente usa el período bancario verificado", () => {
  const stored = { ...cycle, cutDate: "2026-10-18", usageReconciliation: evidence };
  assert.equal(branch(present(current({ cyclesWithAmounts: [stored] })[0]), 'selectedCycle').selectedCycle, null);
  const [active] = current({ cyclesWithAmounts: [stored], now: new Date("2026-10-08T12:00:00Z") });
  assert.equal(present(branch(present(active), 'selectedCycle').selectedCycle).cutDate, "2026-10-08T12:00:00.000Z");
  assert.equal(branch(present(active), 'periodVerified').periodVerified, true);
});

test("diciembre selecciona enero del siguiente año y no arrastra la meta anterior", () => {
  const december = { ...cycle, id: "dec", month: 12, startDate: "2026-11-11", cutDate: "2026-12-10" };
  const january = { ...cycle, id: "jan", year: 2027, month: 1, startDate: "2026-12-11", cutDate: "2027-01-10" };
  const [item] = current({ cyclesWithAmounts: [december, january], now: new Date("2026-12-31T12:00:00Z"),
    expenses: [expense("dec", 400, "Anterior", "2026-12-05"), expense("jan", 80, "Actual", "2026-12-20")],
  });
  assert.equal(present(branch(present(item), 'selectedCycle').selectedCycle).id, "jan");
  assert.equal(branch(present(item), 'eligibleSpend').eligibleSpend, 80);
  assert.equal(branch(present(item), 'remainingAmount').remainingAmount, 220);
});

test("sin período vigente conserva la tarjeta sin seleccionar ciclos futuros ni inválidos", () => {
  for (const candidate of [
    { ...cycle, startDate: "2026-10-14", cutDate: "2026-11-10" },
    { ...cycle, startDate: "invalida", cutDate: "2026-11-10" },
    { ...cycle, startDate: "2026-11-10", cutDate: "2026-10-11" },
    { ...cycle, startDate: null, cutDate: "2026-11-10" },
  ]) {
    const [item] = current({ cyclesWithAmounts: [candidate] });
    assert.equal(present(item).card.id, card.id);
    assert.equal(branch(present(item), 'selectedCycle').selectedCycle, null);
    assert.equal(present(item).status, "NO_CYCLE");
  }
  assert.equal(current({ cards: [{ id: "no-policy", name: "HSBC" }] }).length, 0);
});

test("períodos superpuestos requieren revisión y no acreditan una meta ambigua", () => {
  const verified = { ...cycle, usageReconciliation: { ...evidence, startDate: "2026-09-11", cutDate: "2026-10-18" } };
  const overlap = { ...cycle, id: "next", month: 11, startDate: "2026-10-11", cutDate: "2026-11-10" };
  const [item] = current({ cyclesWithAmounts: [overlap, verified], expenses: [expense("met", 400)] });
  assert.equal(present(branch(present(item), 'selectedCycle').selectedCycle).id, "oct");
  assert.equal(branch(present(item), 'periodSelectionPending').periodSelectionPending, true);
  assert.equal(present(item).isExempt, false);
  assert.equal(present(item).status, "PERIOD_REVIEW");
});

test("historial incluye cortes terminados de años distintos y excluye vigentes y futuros", () => {
  const january = { ...cycle, id: "jan", year: 2027, month: 1, startDate: "2026-12-11", cutDate: "2027-01-10" };
  const december = { ...cycle, id: "dec", month: 12, startDate: "2026-11-11", cutDate: "2026-12-10" };
  const future = { ...january, id: "feb", month: 2, startDate: "2027-01-11", cutDate: "2027-02-10" };
  const args = { cards: [card], cyclesWithAmounts: [cycle, december, january, future], expenses: [], subscriptions: [subscription], purchases: [] };
  const history = ctx.buildCardUsageWaiverHistory({ ...args, now: new Date("2027-01-10T23:59:59Z") });
  assert.deepEqual(Array.from(history, (item) => present(item.selectedCycle).id), ["oct", "dec"]);
  assert.equal(present(history[0]).status, "UNCONFIRMED");
  assert.equal(ctx.buildCardUsageWaiverHistory({ ...args, now: new Date("2027-01-11T12:00:00Z") }).length, 3);
});

test("HSBC octubre: comisiones e IVA no completan los $300", () => {
  const rows = [expense("a", "293.38"), expense("b", 186, "Administración de tarjeta HSBC1"), expense("c", "29.76", "IVA de comisión HSBC1")];
  const [result] = run({ expenses: rows });
  assert.equal(present(result).eligibleSpend, 293.38);
  assert.equal(present(result).remainingAmount, 6.62);
  assert.equal(present(result).breakdown.excludedAmount, 215.76);
  assert.equal(present(result).isExempt, false);
  assert.equal(present(result).status, "NOT_MET");
  assert.equal(rows.length, 3);
});

test("Banamex octubre: la inactividad no convierte $272.95 en meta cumplida", () => {
  const [result] = run({ cards: [{ ...card, usagePolicy: { productKey: "BANAMEX_JOY" } }], expenses: [
    expense("a", 185), expense("b", 39.95), expense("c", 48),
    expense("d", 149, "Comisión por inactividad Banamex1"), expense("e", 23.84, "IVA de comisión por inactividad Banamex1"),
  ] });
  assert.equal(present(result).eligibleSpend, 272.95);
  assert.equal(present(result).remainingAmount, 27.05);
  assert.equal(present(result).isExempt, false);
});

test("la regla depende del producto verificado y sobrevive a renombrar una tarjeta", () => {
  for (const [productKey, minimum] of [["HSBC_ZERO", 300], ["BANAMEX_JOY", 300], ["SANTANDER_LIKEU", 200]]) {
    assert.equal(present(run({ cards: [{ ...card, name: "Mi tarjeta", usagePolicy: { productKey } }] })[0]).minimumAmount, minimum);
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
  assert.equal(present(result).eligibleSpend, 300);
  assert.equal(present(present(result).selectedCycle).cutDate, "2026-10-08T12:00:00.000Z");
  assert.equal(cycle.cutDate, "2026-10-10T12:00:00Z");
});

test("una nota bancaria o evidencia conserva la exclusión al cambiar el concepto", () => {
  const [result] = run({ cyclesWithAmounts: [{ ...cycle, usageReconciliation: { ...evidence, excludedExpenseIds: ["explicit"] } }], expenses: [
    { ...expense("note", 186, "Nombre corregido"), notes: "Fuente: estado.pdf; concepto bancario original: ADMINISTRACION TARJETA TITULAR; corte 2026-10-08." },
    expense("explicit", 23.84, "Nombre distinto"), expense("purchase", 99, "Curso de intereses y comisiones"),
  ] });
  assert.equal(present(result).eligibleSpend, 99);
  assert.equal(present(result).breakdown.excludedExpenses.length, 2);
});

test("una comisión comercial no se confunde con una comisión del banco", () => {
  const [result] = run({ expenses: [expense("artist", 300, "Comisión por ilustración"), expense("uber", 10, "Comisión Uber")] });
  assert.equal(present(result).eligibleSpend, 310);
  assert.equal(present(result).breakdown.excludedAmount, 0);
});

test("futuras y vencidas sin evidencia siguen siendo proyecciones", () => {
  for (const now of ["2026-09-01T12:00:00Z", "2026-10-11T12:00:00Z"]) {
    const [result] = run({ now: new Date(now), subscriptions: [subscription] });
    assert.equal(present(result).eligibleSpend, 0);
    assert.equal(present(result).projectedAmount, 399);
    assert.equal(present(result).isExempt, false);
  }
});

test("distingue suscripciones por cobrar y por confirmar de otros movimientos previstos", () => {
  const activeCycle = { ...cycle, id: "nov", month: 11, startDate: "2026-10-11", cutDate: "2026-11-10" };
  const upcoming = { ...subscription, id: "upcoming", chargeDay: 3, amount: 120 };
  const unconfirmed = { ...subscription, id: "unconfirmed", chargeDay: 15, amount: 80 };
  const [result] = run({
    cyclesWithAmounts: [activeCycle], month: 11, now: new Date("2026-10-20T12:00:00Z"),
    subscriptions: [upcoming, unconfirmed],
    expenses: [expense("future", 50, "Compra futura", "2026-10-25T12:00:00Z")],
  });
  assert.equal(present(result).projectedAmount, 250);
  assert.equal(present(result).subscriptionForecast.upcomingCount, 1);
  assert.equal(present(result).subscriptionForecast.upcomingAmount, 120);
  assert.equal(present(result).subscriptionForecast.unconfirmedCount, 1);
  assert.equal(present(result).subscriptionForecast.unconfirmedAmount, 80);

  const [withoutCharge] = run({ cyclesWithAmounts: [activeCycle], month: 11,
    now: new Date("2026-10-20T12:00:00Z"), subscriptions: [{ ...upcoming, frequencyMonths: 2, startMonth: 10 }] });
  assert.equal(present(withoutCharge).subscriptionForecast.upcomingCount, 0);
  assert.equal(present(withoutCharge).subscriptionForecast.unconfirmedCount, 0);
});

test("una suscripción confirmada conserva importe y fecha históricos", () => {
  const confirmed = { ...evidence, subscriptionCharges: [{ subscriptionId: "sub", name: "Servicio", date: "2026-10-03", amount: "379.00" }] };
  const [result] = run({ cyclesWithAmounts: [{ ...cycle, usageReconciliation: confirmed }], subscriptions: [{ ...subscription, amount: 499, isActive: false, deactivatedAt: "2026-10-05" }] });
  assert.equal(present(result).eligibleSpend, 379);
  assert.equal(present(result).projectedAmount, 0);
  assert.equal(present(result).subscriptionForecast.upcomingCount, 0);
  assert.equal(present(result).subscriptionForecast.unconfirmedCount, 0);
  assert.equal(present(result).isExempt, true);
});

test("gasto vinculado, recibo y calendario no triplican una suscripción", () => {
  const confirmed = { ...evidence, subscriptionCharges: [{ subscriptionId: "sub", name: "Servicio", date: "2026-10-03", amount: 399 }] };
  const [result] = run({ cyclesWithAmounts: [{ ...cycle, usageReconciliation: confirmed }], subscriptions: [subscription], expenses: [{ ...expense("actual", 399, "Servicio", "2026-10-03T12:00:00Z"), subscriptionId: "sub" }] });
  assert.equal(present(result).eligibleSpend, 399);
  assert.equal(present(result).projectedAmount, 0);
  assert.equal(present(result).breakdown.includedSubscriptions.length, 0);
});

test("frecuencia bimestral usa el mes real del cobro y respeta desactivación", () => {
  const [result] = run({ subscriptions: [{ ...subscription, chargeDay: 28, frequencyMonths: 2 }] });
  assert.equal(present(result).projectedAmount, 399); // 28 septiembre, no octubre.
  const [cancelled] = run({ subscriptions: [{ ...subscription, chargeDay: 28, isActive: false, deactivatedAt: "2026-09-20" }] });
  assert.equal(present(cancelled).projectedAmount, 0);
});

test("dos cargos reales iguales conservan su multiplicidad al emparejar un gasto vinculado", () => {
  const receipt = { subscriptionId: "sub", name: "Servicio", date: "2026-10-03", amount: 399 };
  const [result] = run({ cyclesWithAmounts: [{ ...cycle, usageReconciliation: { ...evidence, subscriptionCharges: [receipt, { ...receipt }] } }],
    subscriptions: [subscription], expenses: [{ ...expense("actual", 399, "Servicio", "2026-10-03"), subscriptionId: "sub" }] });
  assert.equal(present(result).eligibleSpend, 798);
  assert.equal(present(result).breakdown.includedSubscriptions.length, 1);
  assert.equal(present(result).projectedAmount, 0);
});

test("un estado revisado no inventa una suscripción ausente", () => {
  const [result] = run({ cyclesWithAmounts: [{ ...cycle, usageReconciliation: evidence }], subscriptions: [subscription] });
  assert.equal(present(result).projectedAmount, 0);
  assert.equal(present(result).subscriptionForecast.upcomingCount, 0);
  assert.equal(present(result).subscriptionForecast.unconfirmedCount, 0);
  assert.equal(present(result).eligibleSpend, 0);
});

test("MSI nueva cuenta una vez aunque ya esté liquidada; cuotas antiguas y canceladas no", () => {
  const purchase = { id: "new", cardId: card.id, totalAmount: 900, months: 3, purchaseDate: "2026-09-20", status: "PAID_OFF" as const };
  const [result] = run({ purchases: [purchase, { ...purchase, id: "old", purchaseDate: "2026-07-01", status: "ACTIVE" as const }, { ...purchase, id: "cancelled", status: "CANCELLED" as const }] });
  assert.equal(present(result).eligibleSpend, 900);
  assert.equal(present(result).breakdown.includedInstallmentPurchases.length, 1);
});

test("MSI y gastos de fecha futura no marcan cumplimiento; centavos exactos", () => {
  const [future] = run({ now: new Date("2026-09-15T12:00:00Z"), expenses: [expense("future", 1000)], purchases: [{ id: "p", cardId: card.id, totalAmount: 900, months: 3, purchaseDate: "2026-09-20", status: "ACTIVE" as const }] });
  assert.equal(present(future).eligibleSpend, 0);
  assert.equal(present(future).projectedAmount, 1900);
  const [exact] = run({ expenses: [expense("a", 299.99), expense("b", 0.01)] });
  assert.equal(present(exact).eligibleSpend, 300);
  assert.equal(present(exact).isExempt, true);
});

test("sin ciclo y evidencia inválida nunca producen un cumplimiento inventado", () => {
  assert.equal(present(run({ cyclesWithAmounts: [] })[0]).status, "NO_CYCLE");
  const [invalid] = run({ cyclesWithAmounts: [{ ...cycle, usageReconciliation: { ...evidence, cutDate: "2026-11-08" } }] });
  assert.equal(present(invalid).periodVerified, false);
});

test("fechas bancarias malformadas conservan el período previsto y sus movimientos", () => {
  for (const patch of [
    { startDate: "2026-09-09T12:00:00Z" },
    { cutDate: "2026-10-08T12:00:00Z" },
    { startDate: "2026-02-30" },
    { startDate: null },
    { cutDate: "2026-11-08" },
    { cutDate: "2025-10-08" },
    { startDate: "2026-10-09", cutDate: "2026-10-08" },
  ]) {
    const [result] = run({
      cyclesWithAmounts: [{ ...cycle, usageReconciliation: { ...evidence, ...patch } }],
      expenses: [expense("recorded", 350)],
    });
    assert.equal(present(result).periodVerified, false, JSON.stringify(patch));
    assert.equal(present(present(result).selectedCycle).startDate, cycle.startDate);
    assert.equal(present(present(result).selectedCycle).cutDate, cycle.cutDate);
    assert.equal(present(result).eligibleSpend, 350);
  }
});

test("fechas imposibles no se normalizan como fechas bancarias verificadas", () => {
  const [result] = run({
    month: 3,
    cyclesWithAmounts: [{ ...cycle, month: 3, startDate: "2026-02-11", cutDate: "2026-03-10", usageReconciliation: {
      ...evidence, startDate: "2026-02-01", cutDate: "2026-02-30",
    } }],
  });
  assert.equal(present(result).periodVerified, false);
  assert.equal(present(present(result).selectedCycle).cutDate, "2026-03-10");
});

test("recibos nulos o malformados no interrumpen el cálculo ni suman consumo", () => {
  const valid = { subscriptionId: "sub", name: "Servicio", date: "2026-10-03", amount: "199.50" };
  const malformed = [null, false, 399, "recibo", {},
    { ...valid, subscriptionId: {} }, { ...valid, subscriptionId: " " },
    { ...valid, amount: true }, { ...valid, amount: [399] },
    { ...valid, amount: "Infinity" }, { ...valid, amount: -399 },
    { ...valid, amount: "399.001" }, { ...valid, date: "2026-10-03T12:00:00Z" },
    { ...valid, date: "2026-09-31" }, { ...valid, date: "2026-10-09" },
  ];
  const [result] = run({ cyclesWithAmounts: [{ ...cycle, usageReconciliation: {
    ...evidence, subscriptionCharges: [...malformed, valid], excludedExpenseIds: {},
  } }], expenses: [expense("recorded", 50)] });
  assert.equal(present(result).eligibleSpend, 249.5);
  assert.equal(present(result).remainingAmount, 50.5);
  assert.equal(present(result).breakdown.includedSubscriptions.length, 1);
  assert.equal(present(result).breakdown.excludedAmount, 0);
  assert.equal(present(result).isExempt, false);
});

test("un nombre malformado conserva el importe válido sin romper el desglose", () => {
  const [result] = run({ cyclesWithAmounts: [{ ...cycle, usageReconciliation: {
    ...evidence, subscriptionCharges: [{ subscriptionId: "sub", name: {}, date: "2026-10-03", amount: 199 }],
  } }] });
  assert.equal(present(result).eligibleSpend, 199);
  assert.equal(present(present(result).breakdown.includedSubscriptions[0]).name, "Suscripción");
});

test("un gasto distinto al comprobante queda por revisar sin acreditar una meta falsa", () => {
  const recorded = { ...expense("linked", 399, "Servicio", "2026-10-03"), subscriptionId: "sub" };
  const receipt = { subscriptionId: "sub", name: "Servicio", date: "2026-10-03", amount: 199 };
  const [result] = run({ expenses: [recorded], cyclesWithAmounts: [{ ...cycle, usageReconciliation: {
    ...evidence, subscriptionCharges: [receipt],
  } }] });
  assert.equal(present(result).confirmationPending, true);
  assert.equal(present(result).isExempt, false);
  assert.equal(present(result).eligibleSpend, 0);
  assert.equal(present(result).projectedAmount, 399);
  assert.equal(present(result).breakdown.includedSubscriptions.length, 0);
  assert.match(present(present(present(result).breakdown.projectedCharges[0]).reason), /gasto \$399\.00, comprobante \$199\.00; requiere conciliación/);
  assert.equal(recorded.amount, 399);
  assert.equal(receipt.amount, 199);
});

test("grupos ambiguos conservan multiplicidad e importes fuera del consumo confirmado", () => {
  const receipt = (amount: number) => ({ subscriptionId: "sub", name: "Servicio", date: "2026-10-03", amount });
  for (const [expenseAmounts, receiptAmounts, expectedProjection] of [
    [[399], [199, 299], 698],
    [[399, 499], [199], 898],
    [[199, 499], [199, 299], 698],
  ] as const) {
    const [result] = run({
      expenses: Array.from(expenseAmounts).map((amount, index) => ({ ...expense(`linked-${index}`, amount, "Servicio", "2026-10-03"), subscriptionId: "sub" })),
      cyclesWithAmounts: [{ ...cycle, usageReconciliation: { ...evidence, subscriptionCharges: Array.from(receiptAmounts).map(receipt) } }],
    });
    assert.equal(present(result).confirmationPending, true);
    assert.equal(present(result).isExempt, false);
    assert.equal(present(result).eligibleSpend, 0);
    assert.equal(present(result).projectedAmount, expectedProjection);
    assert.ok(present(result).breakdown.projectedCharges.every((item) => present(item.reason).includes("requiere conciliación")));
  }
});

test("emparejamientos exactos con distinta posición no crean discrepancias", () => {
  const [result] = run({
    expenses: [199, 399].map((amount, index) => ({ ...expense(`linked-${index}`, amount, "Servicio", "2026-10-03"), subscriptionId: "sub" })),
    cyclesWithAmounts: [{ ...cycle, usageReconciliation: { ...evidence, subscriptionCharges: [399, 199].map((amount) => ({
      subscriptionId: "sub", name: "Servicio", date: "2026-10-03", amount,
    })) } }],
  });
  assert.equal(present(result).confirmationPending, false);
  assert.equal(present(result).eligibleSpend, 598);
  assert.equal(present(result).projectedAmount, 0);
  assert.equal(present(result).isExempt, true);
});

test("un comprobante adicional no consume la coincidencia exacta de otro cargo", () => {
  const [result] = run({
    expenses: [{ ...expense("linked", 199, "Servicio", "2026-10-03"), subscriptionId: "sub" }],
    cyclesWithAmounts: [{ ...cycle, usageReconciliation: { ...evidence, subscriptionCharges: [399, 199].map((amount) => ({
      subscriptionId: "sub", name: "Servicio", date: "2026-10-03", amount,
    })) } }],
  });
  assert.equal(present(result).confirmationPending, false);
  assert.equal(present(result).eligibleSpend, 598);
  assert.equal(present(present(result).breakdown.includedSubscriptions[0]).amount, 399);
  assert.equal(present(result).projectedAmount, 0);
});

test("omitir no cuenta como consumo y elimina la previsión del período", () => {
  const skipped = { ...subscription, charges: [{ month: "2026-10", status: "SKIPPED" as const, expenseId: null }] };
  const result = run({ subscriptions: [skipped] })[0];
  assert.equal(present(result).projectedAmount, 0);
  assert.equal(present(result).subscriptionForecast.upcomingCount, 0);
  assert.equal(present(result).subscriptionForecast.unconfirmedCount, 0);
  assert.equal(present(result).eligibleSpend, 0);
});
