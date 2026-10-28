const assert = require("node:assert/strict");
const { test } = require("node:test");
const { randomUUID } = require("node:crypto");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { sourceLoader } = require("./helpers/load-source.cjs");
const connectionString = process.env.AFP_TEST_DATABASE_URL;

test("PostgreSQL: gastos compartidos en CRUD, análisis, cortes, idempotencia y aislamiento", { skip: !connectionString }, async () => {
  const url = new URL(connectionString);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && /^\/afp_test[\w]*$/.test(url.pathname) && !url.search, "Solo base local de prueba.");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const user = await db.user.create({ data: { email: `shared-${randomUUID()}@example.test` } });
  const other = await db.user.create({ data: { email: `shared-other-${randomUUID()}@example.test` } });
  const load = sourceLoader({
    "@/lib/prisma": { prisma: db },
    "next/server": { NextResponse: { json: (body, options = {}) => ({ body: JSON.parse(JSON.stringify(body)), status: options.status || 200 }) } },
    "@supabase/supabase-js": { createClient: () => ({ auth: { getUser: async token => ({ data: { user: [user, other].find(item => item.id === token) || null } }) } }) },
  }, { console: { error() {} } });
  const call = (route, method = "GET", body, owner = user, query = "") => load(`src/app/api/${route}/route`)[method]({
    headers: new Headers(owner ? { authorization: `Bearer ${owner.id}` } : {}),
    url: `http://localhost/api/${route}?clientDate=2026-10-20&${query}`, json: async () => body,
  });
  try {
    const category = await db.category.create({ data: { userId: user.id, name: "Comida" } });
    const card = await db.card.create({ data: { userId: user.id, name: "Santander de prueba", usualCutDay: 31, usualDueDay: 20, usagePolicy: { productKey: "SANTANDER_LIKEU" } } });
    const cycle = await db.cardCycle.create({ data: { userId: user.id, cardId: card.id, year: 2026, month: 10,
      startDate: new Date("2026-10-01T12:00:00Z"), cutDate: new Date("2026-10-31T12:00:00Z"), dueDate: new Date("2026-11-20T12:00:00Z") } });
    const input = { operationId: randomUUID(), concept: "Restaurante 18", amount: "600", cashContributionAmount: "500",
      date: "2026-10-18", paymentMethod: "CARD", cardId: card.id, categoryId: category.id };
    const responses = await Promise.all(Array.from({ length: 5 }, () => call("expenses", "POST", input)));
    assert.ok(responses.every(response => response.status === 200), JSON.stringify(responses));
    const id = responses[0].body.expense.id;
    assert.ok(responses.every(response => response.body.expense.id === id));
    assert.equal(await db.dailyExpense.count({ where: { userId: user.id } }), 1);
    assert.equal(await db.income.count({ where: { userId: user.id } }), 0);
    assert.equal(await db.receivableAccount.count({ where: { userId: user.id } }), 0);
    assert.equal(await db.expenseOperation.count({ where: { userId: user.id } }), 1);
    assert.equal((await call("expenses", "POST", { ...input, cashContributionAmount: 100 })).status, 409);
    assert.equal((await call("expenses", "POST", { ...input, operationId: randomUUID(), cashContributionAmount: 601 })).status, 400);
    assert.equal((await call("expenses", "POST", { ...input, operationId: randomUUID() }, other)).status, 404);
    assert.equal((await call("expenses", "POST", input, null)).status, 401);

    const second = await call("expenses", "POST", { ...input, operationId: randomUUID(), concept: "Restaurante 19", amount: "250.50", cashContributionAmount: "100", date: "2026-10-19" });
    assert.equal(second.status, 200);
    const list = (await call("expenses")).body;
    assert.equal(list.expenses.length, 2);
    assert.equal(list.total, 850.50);
    assert.equal(list.personalTotal, 250.50);
    assert.equal(Number(list.expenses.find(row => row.id === id).cashContributionAmount), 500);
    assert.equal((await call("expenses", "GET", null, other)).body.expenses.length, 0);
    const bootstrap = (await call("gastos/bootstrap", "GET", null, user, "startDate=2026-10-18&endDate=2026-10-19")).body;
    assert.equal(Number(bootstrap.expenses.find(row => row.id === id).cashContributionAmount), 500);
    const dashboard = (await call("dashboard")).body;
    assert.equal(dashboard.monthlySummary.dailyExpensesTotal, 250.50);
    assert.equal(dashboard.monthlySummary.incomeTotal, 0);
    assert.equal(dashboard.categoryBreakdownByMonth[9][0].total, 250.50);
    assert.equal(dashboard.weeklyComparisonByMonth[9].currMonthTotal, 250.50);
    assert.equal(dashboard.weeklyComparisonByCategoryAndMonth[category.id][9].weeks[2].currTotal, 250.50);
    assert.equal(dashboard.cardMonthlyComparisonByMonth[9].data[0].currAmount, 250.50);
    assert.equal(dashboard.cycles[0].calculatedAmount, 850.50);
    assert.equal(dashboard.cardUsageWaiversCurrent[0].eligibleSpend, 850.50);
    const detail = (await call("card-cycles", "GET", null, user, `cycleId=${cycle.id}`)).body.cycle;
    assert.equal(detail.calculatedAmount, 850.50);
    assert.equal(detail.includedExpenses.find(row => row.id === id).amount, 600);
    await db.cardCycle.update({ where: { id: cycle.id }, data: { statementAmount: "900.50" } });
    const withStatement = (await call("dashboard")).body;
    assert.equal(withStatement.cardMonthlyComparisonByMonth[9].data[0].currAmount, 300.50);
    assert.equal(withStatement.cycles[0].pendingAmount, 900.50);

    const { operationId, ...edit } = input;
    void operationId;
    assert.equal((await call("expenses", "PATCH", { ...edit, id }, other)).status, 404);
    assert.equal((await call("expenses", "DELETE", null, other, `id=${id}`)).status, 404);
    assert.equal((await call("expenses", "PATCH", { ...edit, id, amount: 400 })).status, 400);
    assert.equal(Number((await db.dailyExpense.findUnique({ where: { id } })).amount), 600);
    const { cashContributionAmount, ...legacyEdit } = edit;
    void cashContributionAmount;
    const legacy = await call("expenses", "PATCH", { ...legacyEdit, id, concept: "Cena compartida" });
    assert.equal(legacy.status, 200);
    assert.equal(Number(legacy.body.expense.cashContributionAmount), 500);
    assert.equal((await call("expenses", "PATCH", { ...edit, id, cashContributionAmount: 600 })).status, 200);
    assert.equal((await call("dashboard")).body.categoryBreakdownByMonth[9][0].total, 150.50);
    assert.equal((await call("expenses", "PATCH", { ...edit, id, cashContributionAmount: 0 })).status, 200);
    assert.equal((await call("dashboard")).body.categoryBreakdownByMonth[9][0].total, 750.50);
    for (const value of [-1, 601, "0.001"]) {
      await assert.rejects(db.dailyExpense.update({ where: { id }, data: { cashContributionAmount: value } }));
    }
    assert.equal((await call("expenses", "DELETE", null, user, `id=${id}`)).status, 200);
    assert.equal((await call("expenses", "POST", input)).body.expense.id, id);
    assert.equal(await db.dailyExpense.count({ where: { userId: user.id } }), 1);
    assert.equal((await call("dashboard")).body.categoryBreakdownByMonth[9][0].total, 150.50);

    const sub = await db.subscription.create({ data: { userId: user.id, name: "Comida recurrente", amount: 600, paymentMethod: "CARD", cardId: card.id, categoryId: category.id, chargeDay: 1, startYear: 2026, startMonth: 1 } });
    const subInput = { ...input, operationId: randomUUID(), subscriptionId: sub.id, date: "2026-10-01" };
    const confirmed = await call("expenses", "POST", subInput);
    assert.equal(confirmed.status, 200);
    assert.equal(Number(confirmed.body.expense.cashContributionAmount), 500);
    assert.equal((await call("expenses", "POST", { ...subInput, operationId: randomUUID(), cashContributionAmount: 100 })).status, 409);
    assert.equal((await call("dashboard")).body.monthlySummary.dailyExpensesTotal, 250.50);
    assert.equal((await call("dashboard")).body.monthlySummary.subscriptionsTotal, 0);
  } finally {
    await db.user.delete({ where: { id: user.id } });
    await db.user.delete({ where: { id: other.id } });
    await db.$disconnect();
  }
});
