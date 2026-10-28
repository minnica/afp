import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { record } from './helpers/dynamic-values';
import { present, financialLoader as sourceLoader, stringValue, testReply } from './helpers/financial-fixtures';
const connectionString = process.env.AFP_TEST_DATABASE_URL;

test("PostgreSQL: unicidad concurrente, rollback y recibo durable de capturas", { skip: !connectionString }, async () => {
  assert.ok(connectionString);
  const url = new URL(connectionString);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname.startsWith("/afp_test"), "Solo permite una base local de prueba.");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const user = await db.user.create({ data: { email: `operations-${randomUUID()}@example.test` } });
  try {
    const category = await db.category.create({ data: { userId: user.id, name: "Prueba" } });
    const person = await db.person.create({ data: { userId: user.id, name: "Prueba" } });
    const load = sourceLoader({
      "@/lib/prisma": { prisma: db },
      "next/server": { NextResponse: { json: testReply } },
      "@supabase/supabase-js": { createClient: () => ({ auth: { getUser: async () => ({ data: { user } }) } }) },
    });
    const { POST } = load("src/app/api/expenses/route.ts");
    const { runExpenseOperation } = load("src/lib/expenseOperations.ts");
    const body = { operationId: randomUUID(), concept: "Concurrencia", amount: 25, date: "2026-10-17",
      paymentMethod: "CASH" as const, categoryId: category.id, personId: person.id, createReceivable: true };
    const post = (input: Record<string, unknown>) => POST({ headers: new Headers({ authorization: "Bearer test" }), json: async () => input });
    const responses = await Promise.all(Array.from({ length: 8 }, () => post(body)));
    assert.ok(responses.every(response => response.status === 200));
    const id = record(present(responses[0]).body.expense).id;
    assert.ok(responses.every(response => record(response.body.expense).id === id));
    assert.equal(await db.dailyExpense.count({ where: { userId: user.id } }), 1);
    assert.equal(await db.receivableAccount.count({ where: { userId: user.id } }), 1);
    assert.equal(await db.expenseOperation.count({ where: { userId: user.id } }), 1);
    assert.equal((await post({ ...body, amount: 26 })).status, 409);
    const failedId = randomUUID();
    await assert.rejects(runExpenseOperation(db, user.id, { ...body, operationId: failedId }, async tx => {
      await tx.receivableAccount.create({ data: { userId: user.id, personId: person.id, concept: "Rollback", originalAmount: 10, originDate: new Date(), originType: "MANUAL" } });
      throw new Error("Fallo después de crear relación");
    }), /Fallo/);
    assert.equal(await db.expenseOperation.count({ where: { userId: user.id, operationId: failedId } }), 0);
    assert.equal(await db.receivableAccount.count({ where: { userId: user.id } }), 1);
    await db.dailyExpense.delete({ where: { id: stringValue(id) } });
    assert.equal(record((await post(body)).body.expense).id, id);
    assert.equal(await db.dailyExpense.count({ where: { userId: user.id } }), 0);
  } finally {
    await db.user.delete({ where: { id: user.id } });
    await db.$disconnect();
  }
});
