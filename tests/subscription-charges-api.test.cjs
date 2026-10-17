const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function api() {
  const calls = [];
  const source = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8")
    .replace(/^import .*;\n/gm, "").replace(/^export /gm, "");
  class SubscriptionChargeError extends Error {}
  const route = vm.createContext({ Headers, Date, URL, process: { env: {} }, console, SubscriptionChargeError,
    createClient: () => ({ auth: { getUser: async token => ({ data: { user: token === "valid" ? { id: "owner" } : null } }) } }),
    NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200, headers: options.headers }) },
    prisma: { $transaction: async run => run("transaction") },
    loadSubscriptionCharges: async (...args) => { calls.push(args); return []; },
    applySubscriptionCharge: async (...args) => { calls.push(args); return { expenseId: "expense" }; },
  });
  vm.runInContext(source("src/lib/apiAuth.js") + "\n" + source("src/lib/subscriptionCharges.js") + "\n" + source("src/app/api/subscription-charges/route.js"), route);
  const request = (token, body) => ({ url: "http://localhost/api/subscription-charges?month=2026-10&userId=other",
    headers: new Map(token ? [["authorization", `Bearer ${token}`]] : []), json: async () => body });
  return { route, calls, request };
}

test("cobros API: exige sesión y obtiene el usuario del token", async () => {
  const { route, calls, request } = api();
  assert.equal((await route.GET(request())).status, 401);
  assert.equal((await route.POST(request("expired", {}))).status, 401);
  assert.equal(calls.length, 0);
  const result = await route.GET(request("valid"));
  assert.equal(result.status, 200);
  assert.equal(calls[0][1], "owner");
  assert.equal(result.headers["Cache-Control"], "private, no-store");
  await route.POST(request("valid", { month: "2026-10", userId: "other", expenseData: { userId: "other" } }));
  assert.equal(calls[1][0], "transaction");
  assert.equal(calls[1][1], "owner");
  assert.equal(calls[1][2].expenseData, undefined);
});

test("cobros API: rechaza meses, días y cuerpos inválidos antes de escribir", async () => {
  const { route, calls, request } = api();
  for (const body of [null, { month: "2026-13" }, { month: "2026-10", today: "2099-01-01" }, { month: "2026-10", today: "2026-02-30" }]) {
    assert.equal((await route.POST(request("valid", body))).status, 400);
  }
  assert.equal(calls.length, 0);
});
