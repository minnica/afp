const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const helpers = ["../subscriptionCharges", "installmentStatements", "cardCredits", "subscriptionStatements", "cardCycles", "cycleDataQuality"]
  .map((name) => read(`src/lib/calculations/${name}.js`).replace(/^import[\s\S]*?from\s+["'][^"']+["'];\r?\n/gm, "").replace(/^export /gm, ""))
  .join("\n");
const routes = ["card-cycles", "dashboard"];
const income = {
  id: "cashback", userId: "owner", amount: "4499.70",
  concept: "Cashback Hot Sale Santander", date: "2026-07-15T12:00:00Z",
};
const august = {
  id: "august", userId: "owner", cardId: "santander", year: 2026, month: 8,
  startDate: "2026-07-13T12:00:00Z", cutDate: "2026-08-12T12:00:00Z",
  dueDate: "2026-09-01T12:00:00Z", statementAmount: "1372.85",
  paidAmount: "1372.85", paidAt: "2026-09-01T12:00:00Z", status: "PAID",
  card: { id: "santander", name: "SANTANDER", usualCutDay: 12, usualDueDay: 2 },
};
const credit = {
  id: "application", userId: "owner", cycleId: "august", incomeId: "cashback",
  amount: "1472.57", income,
  notes: "Registrado directamente en la BD (Supabase). Fuente: santander.pdf, corte 2026-08-12.",
};
const expenses = [{
  id: "expense", cardId: "santander", amount: "666.00", date: "2026-07-29T12:00:00Z",
}];
const purchases = [{
  id: "msi", cardId: "santander", purchaseDate: "2026-05-25T12:00:00Z",
  totalAmount: "13076.52", months: 6, status: "ACTIVE",
  statementReconciliations: [{
    year: 2026, month: 8, paymentNumber: 3, amount: "2179.42", remainingBalance: "6538.26",
  }],
}];

function context(route, globals = {}) {
  const source = read(`src/app/api/${route}/route.js`)
    .replace(/^import[\s\S]*?from\s+["'][^"']+["'];\r?\n/gm, "")
    .replace(/^export /gm, "");
  const ctx = vm.createContext(globals);
  vm.runInContext(helpers + "\n" + source, ctx);
  return ctx;
}

test("Santander agosto descuenta solo la aplicación al corte en ambas rutas", () => {
  const cycle = { ...august, credits: [credit] };
  const before = JSON.stringify({ cycle, expenses, purchases });
  for (const route of routes) {
    const result = context(route).calculateCycleAmount({
      cycle, expenses, subscriptions: [], purchases, includeBreakdown: true,
    });
    assert.equal(result.expensesAmount, 666);
    assert.equal(result.purchasesAmount, 2179.42);
    assert.equal(result.grossCalculatedAmount, 2845.42);
    assert.equal(result.creditsAmount, 1472.57);
    assert.equal(result.calculatedAmount, 1372.85);
    assert.equal(result.difference, 0);
    if (route === "card-cycles") {
      assert.equal(result.includedCredits.length, 1);
      assert.equal(result.includedCredits[0].incomeAmount, 4499.70);
      assert.equal(result.includedCredits[0].notes, credit.notes);
    }
  }
  assert.equal(JSON.stringify({ cycle, expenses, purchases }), before);
});

test("sin aplicación se conserva la diferencia y no se descuentan ingresos generales", () => {
  for (const route of routes) {
    const result = context(route).calculateCycleAmount({
      cycle: august, expenses, subscriptions: [], purchases, incomes: [income],
    });
    assert.equal(result.calculatedAmount, 2845.42);
    assert.equal(result.creditsAmount, 0);
    assert.equal(Math.round(result.difference * 100), -147257);
    // Los importes históricos sin bonificación conservan su precisión.
    assert.equal(context(route).getCycleCreditAmounts(august, 1 / 3).calculatedAmount, 1 / 3);
  }
});

test("un estado de cero con bonificación completa concilia correctamente", () => {
  for (const route of routes) {
    const result = context(route).calculateCycleAmount({
      cycle: { ...august, statementAmount: "0", credits: [{ ...credit, amount: "10.00" }] },
      expenses: [{ ...expenses[0], amount: "10.00" }], subscriptions: [], purchases: [],
    });
    assert.equal(result.statementAmount, 0);
    assert.equal(result.calculatedAmount, 0);
    assert.equal(result.difference, 0);
  }
});

test("se rechazan aplicaciones duplicadas, de otro usuario/ciclo e importes inválidos", () => {
  const ctx = context("card-cycles");
  for (const bad of [
    { ...credit, userId: "other" }, { ...credit, cycleId: "september" },
    { ...credit, income: { ...income, userId: "other" } },
    { ...credit, incomeId: "other-income" },
    ...["0", "-1", "NaN", "4499.71", "0.001"].map((amount) => ({ ...credit, amount })),
  ]) {
    assert.throws(() => ctx.getCycleCreditAmounts({ ...august, credits: [bad] }, 5000), /inválida/);
  }
  assert.throws(() => ctx.getCycleCreditAmounts({ ...august, credits: [credit, credit] }, 5000), /duplicada/);
  assert.throws(() => ctx.getCycleCreditAmounts({ ...august, credits: [credit] }, 100), /exceden/);
});

test("la API incluye notas de bonificación y mantiene septiembre y sus pagos", async () => {
  const september = {
    ...august, id: "september", month: 9, startDate: "2026-08-13T12:00:00Z",
    cutDate: "2026-09-12T12:00:00Z", statementAmount: "3430.55",
    paidAmount: "3380.55", paidAt: "2026-10-01T12:00:00Z", credits: [],
  };
  let selection;
  const ctx = context("card-cycles", {
    URL, console,
    NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) },
    prisma: {
      cardCycle: { findMany: async (args) => {
        selection = args.select;
        return [{ ...august, credits: [credit] }, september];
      } },
      dailyExpense: { findMany: async () => [
        ...expenses, { ...expenses[0], id: "sep-expense", date: "2026-08-20T12:00:00Z", amount: "1379.84" },
      ] },
      subscription: { findMany: async () => [] },
      installmentPurchase: { findMany: async () => [{
        ...purchases[0], statementReconciliations: [
          ...purchases[0].statementReconciliations,
          { year: 2026, month: 9, paymentNumber: 4, amount: "2050.71", remainingBalance: "4101.42" },
        ],
      }] },
    },
  });
  const response = await ctx.GET({ url: "http://localhost/api/card-cycles?userId=owner&includeBreakdown=true" });
  assert.equal(response.status, 200);
  assert.equal(selection.credits.select.income.select.amount, true);
  assert.equal(response.body.cycles[0].difference, 0);
  assert.equal(response.body.cycles[0].includedCredits[0].notes, credit.notes);
  assert.equal(response.body.cycles[1].creditsAmount, 0);
  assert.equal(response.body.cycles[1].calculatedAmount, 3430.55);
  assert.equal(response.body.cycles[1].paidAmount, "3380.55");
  assert.equal(response.body.cycles[1].paidAt, "2026-10-01T12:00:00Z");
});

test("un ingreso aplicado no se borra ni se reduce por debajo de sus aplicaciones", async () => {
  let writes = 0;
  const source = read("src/app/api/incomes/route.js")
    .replace(/^import[\s\S]*?from\s+["'][^"']+["'];\r?\n/gm, "")
    .replace(/^export /gm, "");
  const ctx = vm.createContext({
    URL, console,
    NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) },
    prisma: {
      income: {
        findUnique: async () => ({ ...income, _count: { cardCycleCredits: 1 } }),
        delete: async () => { writes++; }, update: async () => { writes++; },
      },
      cardCycleCredit: { aggregate: async () => ({ _sum: { amount: "1472.57" } }) },
    },
  });
  vm.runInContext(source, ctx);
  assert.equal((await ctx.DELETE({ url: "http://localhost/api/incomes?id=cashback" })).status, 409);
  assert.equal((await ctx.PATCH({ json: async () => ({
    id: "cashback", date: "2026-07-15", incomeTypeId: "extra", source: "Santander",
    concept: income.concept, amount: "1000",
  }) })).status, 409);
  assert.equal(writes, 0);
});
