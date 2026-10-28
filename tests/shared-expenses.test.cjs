const assert = require("node:assert/strict");
const { test } = require("node:test");
const { sourceLoader } = require("./helpers/load-source.cjs");
const { debtFixture } = require("./helpers/debt-fixture.cjs");
const { getCashContributionError, getPersonalExpenseAmount, sumPersonalExpenses } = sourceLoader()("src/lib/sharedExpenses.ts");

test("aportaciones: gasto personal, cobertura total, centavos y registros anteriores", () => {
  assert.equal(getPersonalExpenseAmount({ amount: "600", cashContributionAmount: "500" }), 100);
  assert.equal(getPersonalExpenseAmount({ amount: "250.50", cashContributionAmount: "100" }), 150.5);
  assert.equal(getPersonalExpenseAmount({ amount: 600, cashContributionAmount: 600 }), 0);
  assert.equal(getPersonalExpenseAmount({ amount: "600" }), 600);
  assert.equal(sumPersonalExpenses([{ amount: "0.30", cashContributionAmount: "0.20" }, { amount: "0.30", cashContributionAmount: "0.10" }]), 0.3);
});

test("aportaciones: valida límites, centavos y tipos sin coerciones inesperadas", () => {
  for (const value of [0, "0", "0.00", 100, "599.99", 600]) assert.equal(getCashContributionError({ amount: 600, cashContributionAmount: value }), null);
  assert.equal(getCashContributionError({ amount: 600 }), null);
  for (const value of [-1, "-1", 600.01, "0.001", null, false, true, [], {}, "", " ", "NaN", "Infinity", Infinity, "1e2", "9007199254740992"]) {
    assert.ok(getCashContributionError({ amount: 600, cashContributionAmount: value }), String(value));
  }
  for (const amount of [0, -1, "100.001", true, {}, "Infinity"]) assert.ok(getCashContributionError({ amount, cashContributionAmount: 1 }));
  for (const field of ["createReceivable", "receivableAccountId", "payableAccountId"]) {
    assert.ok(getCashContributionError({ amount: 600, cashContributionAmount: 500, [field]: "linked" }));
  }
});

test("editar: agrega, conserva con cliente anterior, corrige y retira la aportación", async () => {
  const f = debtFixture();
  const body = { date: "2026-10-18", concept: "Restaurante", amount: "600", paymentMethod: "CASH", categoryId: "category-a" };
  const created = await f.call("expenses", "POST", body);
  assert.equal(created.status, 200);
  const id = created.body.expense.id;
  assert.equal((await f.call("expenses", "PATCH", { ...body, id, cashContributionAmount: "500" })).body.expense.cashContributionAmount, 500);
  assert.equal((await f.call("expenses", "PATCH", { ...body, id, concept: "Cena" })).body.expense.cashContributionAmount, 500);
  assert.equal((await f.call("expenses", "PATCH", { ...body, id, amount: 400 })).status, 400);
  assert.equal(f.state().dailyExpense[0].amount, 600);
  assert.equal(f.state().dailyExpense[0].cashContributionAmount, 500);
  assert.equal((await f.call("expenses", "PATCH", { ...body, id, cashContributionAmount: 100 })).body.expense.cashContributionAmount, 100);
  assert.equal((await f.call("expenses", "PATCH", { ...body, id, cashContributionAmount: 0 })).body.expense.cashContributionAmount, 0);
  assert.equal((await f.call("expenses", "DELETE", { id })).status, 200);
  assert.equal(f.state().dailyExpense.length, 0);
});
