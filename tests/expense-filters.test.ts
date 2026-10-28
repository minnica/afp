import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sparseCalculations } from './helpers/financial-fixtures';
import { sourceLoader } from './helpers/load-source.ts';
const ctx = sparseCalculations(sourceLoader()("src/lib/expenseFilters.ts"));

const expenses = [
  { id: "coffee", categoryId: "food", paymentMethod: "CASH" as const, concept: "CAFÉ con leche", amount: "45.50" },
  { id: "lunch", categoryId: "food", paymentMethod: "CARD" as const, cardId: "nu", concept: "Comida", amount: 125 },
  { id: "bus", categoryId: "transport", paymentMethod: "CARD" as const, cardId: "hsbc", concept: "Autobús", amount: "45.50" },
  { id: "pending", categoryId: "transport", paymentMethod: "CASH" as const, concept: "Taxi", amount: "45.50", _offlineStatus: "pending" },
];
const filter = (type: import('../src/lib/expenseFilters').ExpenseFilter['type'], value: string) => ({ type, value });
const ids = (filters: Pick<import('../src/lib/expenseFilters').ExpenseFilter, 'type' | 'value'>[]) => expenses.filter((expense) => ctx.matchesExpenseFilters(expense, filters)).map((expense) => expense.id);

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
