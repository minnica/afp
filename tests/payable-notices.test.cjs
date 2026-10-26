const assert = require("node:assert/strict");
const { test } = require("node:test");
const { spawnSync } = require("node:child_process");
const { sourceLoader } = require("./helpers/load-source.cjs");

const { buildPayableNotices, buildImportantNotices } = sourceLoader()("src/lib/importantNotices.js");
const now = new Date("2026-10-26T12:00:00Z");
const account = (overrides = {}) => ({
  id: "purchase", concept: "Compra pendiente", accountType: "SIMPLE", status: "ACTIVE",
  originalAmount: "1000.30", expectedDate: "2026-10-26T12:00:00Z",
  dailyExpenses: [{ amount: "100.10" }, { amount: "200.20" }], person: { name: "Proveedor" },
  ...overrides,
});

test("avisos por pagar: desde dos días antes, hoy y vencidos de meses anteriores", () => {
  for (const [date, group, timing] of [
    ["2026-10-28", "upcoming", "Vence: en 2 días"],
    ["2026-10-27", "upcoming", "Vence: mañana"],
    ["2026-10-26", "today", "Vence: hoy"],
    ["2026-10-25", "overdue", "Vencido: desde hace 1 día"],
    ["2026-09-30", "overdue", "Vencido: desde hace 26 días"],
  ]) {
    const [notice] = buildPayableNotices([account({ expectedDate: date })], now);
    assert.equal(notice.group, group, date);
    assert.equal(notice.description.split("\n")[0], timing);
    assert.equal(notice.amount, 700);
    assert.match(notice.description, /Saldo pendiente: \$700\.00\nAcreedor: Proveedor/);
    assert.match(notice.title, group === "overdue" ? /^Pago vencido:/ : /^Cuenta por pagar:/);
  }
  for (const date of [null, "", "inválida", "2026-10-29", "2027-01-01"]) {
    assert.equal(buildPayableNotices([account({ expectedDate: date })], now).length, 0, String(date));
  }
});

test("avisos por pagar: el saldo a centavos decide la liquidación y conserva cancelaciones", () => {
  for (const row of [
    account({ status: "CANCELLED" }),
    account({ dailyExpenses: [{ amount: "1000.30" }] }),
    account({ dailyExpenses: [{ amount: "1000.31" }] }),
    account({ originalAmount: "0.30", dailyExpenses: [{ amount: "0.10" }, { amount: "0.20" }] }),
  ]) assert.equal(buildPayableNotices([row], now).length, 0);
  const [partial] = buildPayableNotices([account({ status: "PAID_OFF" })], now);
  assert.equal(partial.amount, 700, "un estado histórico incoherente no oculta el saldo actual");
  const [cent] = buildPayableNotices([account({ originalAmount: "0.31", dailyExpenses: [{ amount: "0.10" }, { amount: "0.20" }] })], now);
  assert.equal(cent.amount, 0.01);
});

test("avisos por pagar: préstamos usan saldo bancario o capital abonado y fecha contractual", () => {
  const loan = account({ accountType: "LOAN", currentBalance: "400.10", expectedMonthlyPayment: 100,
    paymentDays: [15, 31], dailyExpenses: [{ amount: 150, loanPrincipalAmount: 100 }] });
  assert.equal(buildPayableNotices([loan], now)[0].amount, 400.10);
  assert.equal(buildPayableNotices([{ ...loan, currentBalance: 0 }], now).length, 0);
  assert.equal(buildPayableNotices([{ ...loan, currentBalance: null }], now)[0].amount, 900.30);
  assert.equal(buildPayableNotices([{ ...loan, expectedDate: "2027-10-26" }], now).length, 0);
});

test("avisos por pagar: prioridad por vencimiento y fecha junto a otros avisos", () => {
  const notices = buildImportantNotices({
    payments: [], subscriptions: [], activeReceivables: [], cyclesWithAmounts: [], cards: [], now,
    payables: [account({ id: "next", expectedDate: "2026-10-28" }), account(),
      account({ id: "overdue", expectedDate: "2026-09-30" })],
  });
  assert.deepEqual(Array.from(notices, notice => notice.id), ["payable-overdue", "payable-purchase", "payable-next"]);
});

test("avisos por pagar: conserva el día bancario UTC y todo el día local de vencimiento", () => {
  const script = `
    const assert = require('node:assert/strict');
    const { sourceLoader } = require('./tests/helpers/load-source.cjs');
    const { buildPayableNotices } = sourceLoader()('src/lib/importantNotices.js');
    const account = { id: 'date', concept: 'Fecha', originalAmount: 10, status: 'ACTIVE', dailyExpenses: [] };
    for (const time of ['00:00:00Z', '23:59:59Z']) {
      account.expectedDate = '2026-11-01T' + time;
      assert.equal(buildPayableNotices([account], new Date(2026, 9, 30, 23, 59))[0].group, 'upcoming');
      assert.equal(buildPayableNotices([account], new Date(2026, 10, 1, 23, 59))[0].group, 'today');
      assert.equal(buildPayableNotices([account], new Date(2026, 10, 2, 0, 1))[0].group, 'overdue');
    }
  `;
  for (const TZ of ["UTC", "America/Mexico_City", "Asia/Tokyo"]) {
    const result = spawnSync(process.execPath, ["-e", script], { cwd: require("node:path").resolve(__dirname, ".."),
      env: { ...process.env, TZ }, encoding: "utf8" });
    assert.equal(result.status, 0, `${TZ}: ${result.stderr}`);
  }
});
