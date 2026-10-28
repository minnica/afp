const assert = require("node:assert/strict");
const { test } = require("node:test");
const { sourceLoader } = require("./helpers/load-source.ts");
const helpers = sourceLoader()("src/lib/analysisPresentation.ts");
const plain = (value) => JSON.parse(JSON.stringify(value));

test("Análisis conserva cero e importes a centavos al mostrarlos", () => {
  assert.equal(helpers.formatMoney(0), "$0.00");
  assert.equal(helpers.formatMoney(125.43), "$125.43");
});

test("enero compara diciembre anterior y conserva categorías sin gasto actual", () => {
  const byMonth = { "-1": [{ id: "antigua", name: "Antigua", total: 30 }], 0: [{ id: "nueva", name: "Nueva", total: 40 }], 11: [{ id: "incorrecta", name: "Diciembre futuro", total: 999 }] };
  assert.deepEqual(plain(helpers.buildCategoryComparison(byMonth, 0)), [{ id: "nueva", name: "Nueva", previous: 0, current: 40 }, { id: "antigua", name: "Antigua", previous: 30, current: 0 }]);
});

test("categorías se unen por ID aunque cambien nombre, sin mutar importes", () => {
  const byMonth = { 8: [{ id: "a", name: "Nombre anterior", total: 12.5 }], 9: [{ id: "a", name: "Nombre actual", total: 25.25 }, { id: "b", name: "Mayor gasto", total: 80 }] };
  const before = JSON.stringify(byMonth);
  const result = helpers.buildCategoryComparison(byMonth, 9);
  assert.deepEqual(plain(result.map((row) => row.id)), ["b", "a"]);
  assert.deepEqual(plain(result[1]), { id: "a", name: "Nombre actual", previous: 12.5, current: 25.25 });
  assert.equal(JSON.stringify(byMonth), before);
});
