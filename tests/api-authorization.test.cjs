const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { sourceLoader } = require("./helpers/load-source.cjs");

const plain = value => JSON.parse(JSON.stringify(value));
const routes = fs.readdirSync(path.join(__dirname, "../src/app/api"), { recursive: true })
  // Captura usa un protocolo propio: inicio público y credencial Capture limitada al teléfono.
  // Todos sus métodos se verifican por separado en capture-api-integration.test.cjs.
  // OAuth valida estado+cookie de un solo uso y cron su secreto; tienen pruebas propias.
  .filter(file => /route\.[jt]s$/.test(file) && !file.startsWith("captures/") && !["calendar/google/callback/route.js", "cron/calendar-sync/route.js"].includes(file))
  .map(file => file.replace(/\/route\.[jt]s$/, ""));
const models = ["moneyAccount", "card", "cardCycle", "dailyExpense", "category", "person", "incomeType", "income",
  "subscription", "subscriptionCharge", "installmentPurchase", "receivableAccount", "payableAccount", "cardCycleCredit", "noticeDismissal", "user", "expenseTombstone"];
function fixture({ empty = false } = {}) {
  const calls = [], writes = [];
  const rows = Object.fromEntries(models.map(model => [model, empty ? [] : ["a", "b"].map(userId => ({
    id: `${model}-${userId}`, userId, name: userId, concept: userId, amount: 10, totalAmount: 100, months: 10,
    initialPaymentsMade: 0, originalAmount: 100, date: new Date("2026-10-01"), purchaseDate: new Date("2026-10-01"),
    status: "ACTIVE", incomes: [], dailyExpenses: [], charges: [], cardCycleCredits: [],
    _count: { cardCycleCredits: 0 }, subscriptionId: null, payableAccountId: null, receivableAccountId: null,
  }))]));
  const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => {
    if (value === undefined) return true;
    if (value && typeof value === "object") return true; // Los filtros de negocio se prueban en sus suites.
    return row[key] === value;
  });
  const prisma = Object.fromEntries(models.map(model => [model, Object.fromEntries(
    ["findMany", "findFirst", "findUnique", "create", "createMany", "update", "delete", "deleteMany", "aggregate", "upsert"].map(method => [method, async (args = {}) => {
      calls.push({ model, method, args: plain(args) });
      const found = rows[model].filter(row => matches(row, args.where));
      if (method === "findMany") return found;
      if (method === "findFirst" || method === "findUnique") return found[0] || null;
      if (method === "aggregate") return { _sum: { amount: 0 } };
      if (["update", "delete"].includes(method) && !found.length) throw Object.assign(new Error("missing"), { code: "P2025" });
      writes.push({ model, method, args: plain(args) });
      if (method === "delete") { rows[model] = rows[model].filter(row => row !== found[0]); return found[0]; }
      if (method === "update") { Object.assign(found[0], args.data); return found[0]; }
      const result = { id: `${model}-new`, incomes: [], dailyExpenses: [], ...args.data, ...args.create };
      if (method === "create") rows[model].push(result);
      return result;
    }]))]));
  prisma.$transaction = async run => typeof run === "function" ? run(prisma) : Promise.all(run);
  prisma.$queryRaw = async (_sql, id, userId) => rows.subscription.filter(row => row.id === id && row.userId === userId);
  const load = sourceLoader({
    "@/lib/prisma": { prisma },
    "next/server": { NextResponse: { json: (body, options = {}) => ({ body: plain(body), status: options.status || 200, headers: new Headers(options.headers) }) } },
    "@supabase/supabase-js": { createClient: () => ({ auth: { getUser: async token => ({
      data: { user: ["a", "b"].includes(token) ? { id: token, email: `${token}@example.test` } : null },
      error: ["a", "b"].includes(token) ? null : new Error("invalid token"),
    }) } }) },
  });
  return { load, calls, writes, rows, route: name => load(`src/app/api/${name}/route`) };
}
function request(token, body = {}, query = "") {
  return { url: `http://localhost/api/test?userId=b&${query}`, headers: new Headers(token ? { authorization: `Bearer ${token}` } : {}), json: async () => body };
}
const validBody = {
  userId: "b", email: "b@example.test", name: "Nuevo", concept: "Prueba", amount: 10, date: "2026-01-15",
  paymentMethod: "CASH", categoryId: "category-a", personId: "person-a", incomeTypeId: "incomeType-a",
  cardId: "card-a", purchaseDate: "2026-01-15", totalAmount: 100, months: 10,
  originalAmount: 100, originDate: "2026-01-15", source: "Prueba", chargeDay: 15,
  startMonth: 1, startYear: 2026, usualCutDay: 10, usualDueDay: 20, type: "category",
};

for (const name of routes) {
  test(`${name}: cada método rechaza ausencia de sesión y tokens inválidos sin tocar BD`, async () => {
    const { route, calls } = fixture();
    const handlers = route(name);
    for (const method of ["GET", "POST", "PATCH", "DELETE"].filter(method => handlers[method])) {
      for (const token of [undefined, "expired", "forged.jwt.signature"]) {
        const response = await handlers[method](request(token, validBody, "id=card-b"));
        assert.equal(response.status, 401, `${method} ${token}`);
        assert.equal(response.headers.get("cache-control"), "private, no-store");
      }
    }
    assert.equal(calls.length, 0);
  });
}
const resources = {
  cards: ["card", "cards"], expenses: ["dailyExpense", "expenses"], incomes: ["income", "incomes"],
  subscriptions: ["subscription", "subscriptions"], "installment-purchases": ["installmentPurchase", "purchases"],
  receivables: ["receivableAccount", "receivables"], payables: ["payableAccount", "payables"],
};
for (const [name, [model, key]] of Object.entries(resources)) {
  test(`${name}: ignora userId falsificado; A y B solo leen, crean, editan y borran lo propio`, async () => {
    const { route, writes, rows } = fixture();
    const api = route(name);
    for (const owner of ["a", "b"]) {
      const response = await api.GET(request(owner));
      assert.equal(response.status, 200);
      assert.deepEqual(response.body[key].map(row => row.id), [`${model}-${owner}`]);
    }
    for (const id of [`${model}-b`, "missing"]) {
      assert.equal((await api.PATCH(request("a", { ...validBody, id }))).status, 404);
      assert.equal((await api.DELETE(request("a", {}, `id=${id}`))).status, 404);
    }
    assert.equal(writes.length, 0);
    assert.equal((await api.PATCH(request("a", { ...validBody, id: `${model}-a` }))).status, 200);
    const created = await api.POST(request("a", validBody));
    assert.equal(created.status, 200);
    assert.equal(rows[model].at(-1).userId, "a");
    assert.equal((await api.DELETE(request("a", {}, `id=${model}-a`))).status, 200);
    assert.equal(rows[model].find(row => row.id === `${model}-b`).concept, "b");
  });
}
const references = {
  expenses: ["cardId", "categoryId", "personId", "receivableAccountId", "payableAccountId", "subscriptionId"],
  "installment-purchases": ["cardId", "categoryId", "personId"], subscriptions: ["cardId", "categoryId"],
  incomes: ["incomeTypeId", "receivableAccountId"], receivables: ["personId"], payables: ["personId"],
};
for (const [name, fields] of Object.entries(references)) {
  test(`${name}: rechaza vínculos de otro propietario antes de cualquier escritura`, async () => {
    const { route, writes } = fixture();
    for (const method of ["POST", "PATCH"]) for (const field of fields) {
      const model = field.slice(0, -2);
      const response = await route(name)[method](request("a", { ...validBody, id: `${resources[name][0]}-a`, [field]: `${model}-b`, createReceivable: true }));
      assert.equal(response.status, 404, `${method} ${field}`);
    }
    assert.equal(writes.length, 0);
  });
}

test("settings: aísla los tres catálogos y sus eliminaciones", async () => {
  const { route, writes } = fixture();
  const api = route("settings");
  const result = await api.GET(request("a"));
  for (const key of ["categories", "people", "incomeTypes"]) assert.equal(result.body[key][0].userId, "a");
  for (const type of ["category", "person", "incomeType"]) {
    assert.equal((await api.DELETE(request("a", {}, `type=${type}&id=${type}-b`))).status, 404);
    assert.equal((await api.POST(request("a", { ...validBody, type }))).status, 200);
    assert.equal(writes.at(-1).args.data.userId, "a");
    assert.equal((await api.DELETE(request("a", {}, `type=${type}&id=${type}-a`))).status, 200);
  }
});

test("ciclos: todas las acciones exigen el propietario; activar/desactivar suscripciones también", async () => {
  const { route, writes } = fixture();
  for (const action of ["UPDATE_DATES", "UPDATE_STATEMENT", "MARK_AS_PAID", "UNMARK_AS_PAID"]) {
    const body = { id: "cardCycle-b", action, statementAmount: 100, paidAmount: 100, paidAt: "2026-10-15",
      startDate: "2026-09-01", cutDate: "2026-10-01", dueDate: "2026-10-20" };
    assert.equal((await route("card-cycles").PATCH(request("a", body))).status, 404);
    assert.equal(writes.length, 0);
  }
  for (const isActive of [true, false]) {
    assert.equal((await route("subscriptions").PATCH(request("a", { id: "subscription-b", toggleActive: true, isActive }))).status, 404);
  }
  assert.equal(writes.length, 0);
});

test("setup-user: ID y correo solo salen del usuario validado", async () => {
  const { route, writes } = fixture();
  assert.equal((await route("setup-user").POST(request("a", validBody))).status, 200);
  assert.deepEqual(writes[0].args.where, { id: "a" });
  assert.equal(writes[0].args.update.email, "a@example.test");
  assert.equal(writes[0].args.create.id, "a");
  for (const write of writes.slice(1)) assert.ok(write.args.data.every(row => row.userId === "a"));
});

test("dashboard, bootstrap y ciclos: todas las consultas usan la identidad validada", async () => {
  for (const name of ["dashboard", "gastos/bootstrap", "card-cycles"]) {
    const { route, calls } = fixture({ empty: true });
    assert.equal((await route(name).GET(request("a"))).status, 200);
    assert.ok(calls.length > 0);
    assert.ok(calls.every(call => call.args.where.userId === "a"));
  }
});

test("no permite inyectar filtros Prisma en IDs del cuerpo", async () => {
  for (const [name, [model]] of Object.entries(resources)) {
    const { route, writes } = fixture();
    assert.equal((await route(name).PATCH(request("a", { ...validBody, id: { not: `${model}-a` } }))).status, 400);
    assert.equal(writes.length, 0);
  }
});
