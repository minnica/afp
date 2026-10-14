const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/lib/expenseFilters.js"), "utf8").replace(/^export /gm, ""), ctx);

const expenses = [
  { id: "coffee", categoryId: "food", paymentMethod: "CASH", concept: "CAFÉ con leche", amount: "45.50" },
  { id: "lunch", categoryId: "food", paymentMethod: "CARD", cardId: "nu", concept: "Comida", amount: 125 },
  { id: "bus", categoryId: "transport", paymentMethod: "CARD", cardId: "hsbc", concept: "Autobús", amount: "45.50" },
  { id: "pending", categoryId: "transport", paymentMethod: "CASH", concept: "Taxi", amount: "45.50", _offlineStatus: "pending" },
];
const filter = (type, value) => ({ type, value });
const ids = (filters) => expenses.filter((expense) => ctx.matchesExpenseFilters(expense, filters)).map((expense) => expense.id);

test("varias categorías y pagos son alternativas, y los campos distintos se intersectan", () => {
  assert.deepEqual(ids([filter("category", "food"), filter("category", "transport")]), ["coffee", "lunch", "bus", "pending"]);
  assert.deepEqual(ids([filter("payment", "CASH"), filter("payment", "nu")]), ["coffee", "lunch", "pending"]);
  assert.deepEqual(ids([filter("category", "food"), filter("payment", "CASH"), filter("amount", "4550")]), ["coffee"]);
  assert.deepEqual(ids([filter("category", "food"), filter("payment", "hsbc")]), []);
});

test("conceptos ignoran mayúsculas y acentos, permitiendo alternativas y búsquedas parciales", () => {
  assert.deepEqual(ids([filter("concept", "cafe"), filter("concept", "autobus")]), ["coffee", "bus"]);
  assert.deepEqual(ids([filter("concept", "COM")]), ["lunch"]);
});

test("montos comparan centavos y aplican igual a guardados y pendientes", () => {
  assert.deepEqual(ids([filter("amount", "4550")]), ["coffee", "bus", "pending"]);
  assert.deepEqual(ids([filter("amount", "4550"), filter("amount", "12500")]), ["coffee", "lunch", "bus", "pending"]);
  assert.equal(ctx.matchesExpenseFilters({ ...expenses[0], amount: 45.5000000001 }, [filter("amount", "4550")]), true);
  assert.deepEqual(ids([]), ["coffee", "lunch", "bus", "pending"]);
});

test("la entrada de montos acepta MXN y rechaza números ambiguos o incompletos", () => {
  for (const text of ["1250.50", "1,250.50", "$1,250.50", " $ 1,250.50 "]) assert.equal(ctx.parseExpenseAmountSearch(text), 125050);
  assert.equal(ctx.parseExpenseAmountSearch("0"), 0);
  assert.equal(ctx.parseExpenseAmountSearch("0.01"), 1);
  for (const text of ["", "45,50", "1,25", "12.", "-10", "Infinity", "1e3", "10.001", "comida", "9007199254740991"]) assert.equal(ctx.parseExpenseAmountSearch(text), null);
});
