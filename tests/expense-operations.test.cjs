const assert = require("node:assert/strict");
const { test } = require("node:test");
const { randomUUID } = require("node:crypto");
const { sourceLoader } = require("./helpers/load-source.cjs");

// Adaptador transaccional explícito; la concurrencia real de SQL tiene suite independiente.
function fixture() {
  let state = { operations: [], expenses: [], receivables: [] }, tail = Promise.resolve();
  let failAt;
  const db = { $transaction: run => {
    const result = tail.then(async () => {
      const draft = structuredClone(state);
      const tx = {
        $queryRaw: async () => [{ locked: 1 }],
        expenseOperation: {
          createMany: async ({ data }) => { if (!draft.operations.some(row => row.userId === data.userId && row.operationId === data.operationId)) draft.operations.push(data); },
          findUnique: async ({ where }) => draft.operations.find(row => row.userId === where.userId_operationId.userId && row.operationId === where.userId_operationId.operationId),
          update: async ({ where, data }) => {
            if (failAt === "receipt") throw new Error("Fallo del recibo");
            Object.assign(await tx.expenseOperation.findUnique({ where }), data);
          },
        },
        category: { findFirst: async ({ where }) => where.id === `category-${where.userId}` ? { id: where.id } : null },
        person: { findFirst: async () => ({ id: "person" }) },
        receivableAccount: { create: async ({ data }) => { const row = { ...data, id: randomUUID() }; draft.receivables.push(row); return row; } },
        dailyExpense: {
          create: async ({ data }) => {
            if (failAt === "expense") throw new Error("Fallo del gasto");
            const row = { ...data, id: randomUUID() }; draft.expenses.push(row); return row;
          },
        },
      };
      const result = await run(tx);
      state = draft;
      return result;
    });
    tail = result.catch(() => {});
    return result;
  } };
  const load = sourceLoader({
    "@/lib/prisma": { prisma: db },
    "next/server": { NextResponse: { json: (body, options = {}) => ({ body: JSON.parse(JSON.stringify(body)), status: options.status || 200 }) } },
    "@supabase/supabase-js": { createClient: () => ({ auth: { getUser: async token => ({ data: { user: { id: token } } }) } }) },
  }, { console: { error() {} } });
  const { POST } = load("src/app/api/expenses/route.js");
  const post = (body, user = "a") => POST({ headers: new Headers({ authorization: `Bearer ${user}` }), json: async () => body });
  return { post, state: () => state, fail: value => { failAt = value; } };
}
const input = () => ({ operationId: randomUUID(), date: "2026-10-17", concept: "Comida", amount: 10,
  paymentMethod: "CASH", categoryId: "category-a", personId: "person", createReceivable: true });

test("POST concurrentes y respuesta perdida devuelven el mismo gasto y cuenta", async () => {
  const f = fixture(), body = input();
  const responses = await Promise.all(Array.from({ length: 5 }, () => f.post(body)));
  assert.ok(responses.every(response => response.status === 200));
  assert.equal(new Set(responses.map(response => response.body.expense.id)).size, 1);
  assert.deepEqual((await f.post(body)).body, responses[0].body);
  assert.equal(f.state().expenses.length, 1);
  assert.equal(f.state().receivables.length, 1);
  assert.equal(f.state().operations.length, 1);
});

test("reutilizar UUID con otro contenido da 409; propietario y orden de claves son independientes", async () => {
  const f = fixture(), body = input();
  const first = await f.post(body);
  const reordered = Object.fromEntries(Object.entries(body).reverse());
  assert.deepEqual((await f.post({ ...reordered, userId: "forged" })).body, first.body);
  assert.equal((await f.post({ ...body, amount: 11 })).status, 409);
  const other = await f.post({ ...body, categoryId: "category-b" }, "b");
  assert.equal(other.status, 200);
  assert.notEqual(other.body.expense.id, first.body.expense.id);
  assert.equal(f.state().operations.length, 2);
});

test("fallo del gasto o del recibo revierte también la cuenta creada y permite reintentar", async () => {
  for (const stage of ["expense", "receipt"]) {
    const f = fixture(), body = input();
    f.fail(stage);
    assert.equal((await f.post(body)).status, 500);
    assert.deepEqual(f.state(), { operations: [], expenses: [], receivables: [] });
    f.fail(null);
    assert.equal((await f.post(body)).status, 200);
    assert.equal(f.state().expenses.length, 1);
    assert.equal(f.state().receivables.length, 1);
  }
});

test("validaciones fallidas no consumen la operación y UUID inválido se rechaza", async () => {
  const f = fixture(), body = input();
  assert.equal((await f.post({ ...body, amount: -1 })).status, 400);
  assert.equal(f.state().operations.length, 0);
  assert.equal((await f.post({ ...body, operationId: "invalid" })).status, 400);
  assert.equal((await f.post({ ...body, categoryId: "category-b" })).status, 404);
  assert.equal((await f.post(body)).status, 200);
});

test("editar o eliminar un gasto confirmado no permite recrearlo mediante un reintento viejo", async () => {
  const f = fixture(), body = input();
  const first = await f.post(body);
  f.state().expenses[0].amount = 25;
  assert.deepEqual((await f.post(body)).body, first.body);
  f.state().expenses.length = 0;
  assert.deepEqual((await f.post(body)).body, first.body);
  assert.equal(f.state().expenses.length, 0);
  assert.equal(f.state().receivables.length, 1);
});

test("aportación recibida: guarda el cargo y el efectivo una vez, sin crear cuentas", async () => {
  const f = fixture();
  const body = { ...input(), amount: 600, cashContributionAmount: 500, createReceivable: false };
  const responses = await Promise.all(Array.from({ length: 5 }, () => f.post(body)));
  assert.ok(responses.every(response => response.status === 200));
  assert.equal(f.state().expenses.length, 1);
  assert.equal(f.state().expenses[0].amount, 600);
  assert.equal(f.state().expenses[0].cashContributionAmount, 500);
  assert.equal(f.state().receivables.length, 0);
  assert.equal((await f.post({ ...body, cashContributionAmount: 100 })).status, 409);
  assert.deepEqual((await f.post(body)).body, responses[0].body);
});

test("aportación inválida o cuenta duplicada no consume recibo ni crea gasto", async () => {
  const f = fixture();
  const body = { ...input(), amount: 600, createReceivable: false };
  for (const value of [601, -1, "500.001", false, null, [], {}]) {
    assert.equal((await f.post({ ...body, cashContributionAmount: value })).status, 400);
  }
  assert.equal((await f.post({ ...body, cashContributionAmount: 500, createReceivable: true })).status, 400);
  assert.deepEqual(f.state(), { operations: [], expenses: [], receivables: [] });
  assert.equal((await f.post({ ...body, cashContributionAmount: 500 })).status, 200);
});
