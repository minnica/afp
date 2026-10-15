const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const helpers = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/lib/cardPaymentPresentation.js"), "utf8").replace(/^export /gm, ""), helpers);
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
