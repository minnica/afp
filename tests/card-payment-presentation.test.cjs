const assert = require("node:assert/strict");
const { test } = require("node:test");
const { sourceLoader } = require("./helpers/load-source.cjs");
const helpers = sourceLoader()("src/lib/cardPaymentPresentation.ts");
const cycle = { cutDate: "2026-10-14T12:00:00Z", statementAmount: "725.43", calculatedAmount: "800.12" };

test("antes del corte usa el calculado incluso con estado capturado anticipadamente", () => {
  const payment = helpers.getDashboardPayment(cycle, new Date(2026, 9, 13, 23, 59));
  assert.equal(payment.amount, 800.12);
  assert.equal(payment.isStatement, false);
});

test("desde el día de corte usa el estado registrado, incluido cero", () => {
  for (const cutDate of ["2026-10-14T00:00:00Z", "2026-10-14T12:00:00Z"]) {
    const payment = helpers.getDashboardPayment({ ...cycle, cutDate }, new Date(2026, 9, 14, 0, 1));
    assert.equal(payment.amount, 725.43);
    assert.equal(payment.isStatement, true);
  }
  const zero = helpers.getDashboardPayment({ ...cycle, statementAmount: 0 }, new Date(2026, 9, 15));
  assert.equal(zero.amount, 0);
  assert.equal(zero.isStatement, true);
});

test("corte sin estado conserva el estimado; pagos no modifican el importe del período", () => {
  for (const statementAmount of [null, undefined]) {
    const payment = helpers.getDashboardPayment({ ...cycle, statementAmount }, new Date(2026, 9, 25));
    assert.equal(payment.amount, 800.12);
    assert.equal(payment.isStatement, false);
  }
  const paid = helpers.getDashboardPayment({ ...cycle, displayStatus: "PAID", paidAmount: 725.43 }, new Date(2026, 9, 25));
  assert.equal(paid.amount, 725.43);
});

test("respeta cambios de mes/año, no muta ciclos y maneja importes a centavos", () => {
  const input = { ...cycle, cutDate: "2027-01-01T00:00:00Z", calculatedAmount: "100.10" };
  const before = JSON.stringify(input);
  assert.equal(helpers.getDashboardPayment(input, new Date(2026, 11, 31, 23, 59)).isStatement, false);
  assert.equal(helpers.getDashboardPayment(input, new Date(2027, 0, 1)).isStatement, true);
  assert.equal(JSON.stringify(input), before);
  const amounts = ["0.10", "0.20"].map(calculatedAmount => helpers.getDashboardPayment({ ...input, calculatedAmount }, new Date(2026, 11, 31)).amount);
  assert.equal(amounts.reduce((sum, amount) => sum + Math.round(amount * 100), 0) / 100, 0.30);
});

test("las leyendas conservan el día bancario y la opción de fecha larga", () => {
  const today = new Date(2026, 9, 15, 23, 59);
  const options = { includePreposition: true };
  assert.equal(helpers.formatPaymentDeadline("2026-10-15T00:00:00Z", today, options), "Es hoy [15 de octubre]");
  assert.equal(helpers.formatPaymentDeadline("2026-10-16T00:00:00Z", today, options), "Es mañana [16 de octubre]");
  assert.equal(helpers.formatPaymentDeadline("2026-10-17T00:00:00Z", today, options), "Es en 2 días [17 de octubre]");
  assert.equal(helpers.formatPaymentDeadline("2026-10-14T00:00:00Z", today, options), "Fue ayer [14 de octubre]");
  assert.equal(helpers.formatPaymentDeadline("2026-10-13T00:00:00Z", today, options), "Fue hace 2 días [13 de octubre]");
  assert.equal(helpers.formatPaymentDeadline("2026-10-15T00:00:00Z", today), "Es hoy [15 octubre]");
  assert.equal(helpers.formatPaymentDeadline("2027-01-01T00:00:00Z", new Date(2026, 11, 31, 23, 59), options), "Es mañana [1 de enero]");
  assert.equal(helpers.formatPaymentDeadline(null, today, options), "-");
  assert.equal(helpers.formatPaymentDeadline("invalid", today, options), "-");
});

test("el corte compacto omite la fecha sin alterar las leyendas ni sus otros consumidores", () => {
  const today = new Date(2026, 9, 15, 23, 59);
  const options = { includeDate: false };
  for (const [date, expected] of [
    ["2026-10-15", "Es hoy"],
    ["2026-10-16", "Es mañana"],
    ["2026-10-17", "Es en 2 días"],
    ["2026-10-14", "Fue ayer"],
    ["2026-10-13", "Fue hace 2 días"],
  ]) {
    assert.equal(helpers.formatPaymentDeadline(`${date}T00:00:00Z`, today, options), expected);
  }
  assert.equal(helpers.formatPaymentDeadline("2027-01-01T00:00:00Z", new Date(2026, 11, 31, 23, 59), options), "Es mañana");
  assert.equal(helpers.formatPaymentDeadline("2026-10-17T00:00:00Z", today), "Es en 2 días [17 octubre]");
  assert.equal(helpers.formatPaymentDeadline(null, today, options), "-");
  assert.equal(helpers.formatPaymentDeadline("invalid", today, options), "-");
});
