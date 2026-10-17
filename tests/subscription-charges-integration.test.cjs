const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const connectionString = process.env.AFP_TEST_DATABASE_URL;

test("cobros: transacción, concurrencia, omisión, restauración, evidencia y aislamiento", { skip: !connectionString }, async () => {
  const url = new URL(connectionString);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname.startsWith("/afp_test"), "Solo permite una base local de prueba.");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const ctx = vm.createContext({ Date });
  const read = file => fs.readFileSync(path.join(__dirname, "../src/lib", file), "utf8")
    .replace(/^import .*;\n/gm, "").replace(/^export /gm, "");
  vm.runInContext(read("subscriptionCharges.js") + "\n" + read("subscriptionChargeService.js"), ctx);
  const user = await db.user.create({ data: { email: `subscription-${Date.now()}@example.test` } });
  const category = await db.category.create({ data: { userId: user.id, name: "Servicios" } });
  const card = await db.card.create({ data: { userId: user.id, name: "Prueba", usualCutDay: 20, usualDueDay: 30 } });
  const subscription = await db.subscription.create({ data: { userId: user.id, name: "Servicio", amount: 199,
    paymentMethod: "CARD", cardId: card.id, categoryId: category.id, chargeDay: 15, startMonth: 1, startYear: 2026 } });
  const input = { subscriptionId: subscription.id, month: "2026-10", action: "confirm", today: "2026-11-20" };
  const apply = overrides => db.$transaction(tx => ctx.applySubscriptionCharge(tx, user.id, { ...input, ...overrides }));
  try {
    await assert.rejects(db.$transaction(tx => ctx.applySubscriptionCharge(tx, "other-user", input)), /No se encontró/);
    await assert.rejects(apply({ month: "2026-13" }), /no son válidos/);
    await assert.rejects(apply({ today: "2026-10-14" }), /todavía no corresponde/);
    await assert.rejects(apply({ amount: 0 }), /importe positivo/);
    await assert.rejects(apply({ amount: "12.345" }), /importe positivo/);
    const concurrent = await Promise.all(Array.from({ length: 4 }, () => apply({ amount: 219, date: "2026-11-01" })));
    assert.equal(new Set(concurrent.map(result => result.expenseId)).size, 1);
    assert.equal(await db.dailyExpense.count({ where: { userId: user.id } }), 1);
    assert.equal(await db.subscriptionCharge.count({ where: { userId: user.id } }), 1);
    assert.equal(concurrent.filter(result => !result.alreadyConfirmed).length, 1);
    const expense = await db.dailyExpense.findUnique({ where: { id: concurrent[0].expenseId } });
    assert.equal(Number(expense.amount), 219);
    assert.equal(Number((await db.subscription.findUnique({ where: { id: subscription.id } })).amount), 199);
    assert.equal((await ctx.loadSubscriptionCharges(db, user.id, "2026-10", "2026-11-20"))[0].status, "CONFIRMED");
    assert.equal((await ctx.loadSubscriptionCharges(db, user.id, "2026-11", "2026-11-20"))[0].status, "PENDING");
    await assert.rejects(apply({ action: "skip" }), /ya está registrado/);
    await apply({ month: "2026-11", action: "skip" });
    assert.equal((await ctx.loadSubscriptionCharges(db, user.id, "2026-11", "2026-11-20"))[0].status, "SKIPPED");
    await assert.rejects(apply({ month: "2026-11" }), /Restaura/);
    await apply({ month: "2026-11", action: "restore" });
    await apply({ month: "2026-11", amount: 189 });
    assert.equal(await db.dailyExpense.count({ where: { userId: user.id } }), 2);
    await db.dailyExpense.delete({ where: { id: expense.id } });
    assert.equal((await ctx.loadSubscriptionCharges(db, user.id, "2026-10", "2026-11-20"))[0].status, "PENDING");
    await db.cardCycle.create({ data: { userId: user.id, cardId: card.id, month: 10, year: 2026,
      startDate: new Date("2026-09-21"), cutDate: new Date("2026-10-20"), dueDate: new Date("2026-10-30"),
      usageReconciliation: { version: 1, source: "fixture.pdf", sourceSha256: "a".repeat(64), startDate: "2026-09-21", cutDate: "2026-10-20",
        subscriptionCharges: [{ subscriptionId: subscription.id, date: "2026-10-15", amount: 199 }] } } });
    assert.equal((await ctx.loadSubscriptionCharges(db, user.id, "2026-10", "2026-11-20"))[0].status, "VERIFIED");
    await assert.rejects(apply({ action: "confirm" }), /estado de cuenta ya confirma/);
    await assert.rejects(apply({ action: "skip" }), /estado de cuenta ya confirma/);
    // La restauración es idempotente y un error revierte ambos registros.
    await apply({ month: "2026-12", action: "restore" });
    await assert.rejects(db.$transaction(async tx => {
      await ctx.applySubscriptionCharge(tx, user.id, { ...input, month: "2026-12", today: "2026-12-20" });
      throw new Error("rollback");
    }), /rollback/);
    assert.equal(await db.subscriptionCharge.count({ where: { userId: user.id, month: "2026-12" } }), 0);
    assert.equal(await db.dailyExpense.count({ where: { userId: user.id } }), 1);
    // La captura manual y la confirmación rápida usan el mismo bloqueo.
    const manual = await db.subscription.create({ data: { userId: user.id, name: "Manual", amount: 99,
      paymentMethod: "CASH", categoryId: category.id, chargeDay: 15, startMonth: 1, startYear: 2026 } });
    const { sourceLoader } = require("./helpers/load-source.cjs");
    const expenses = sourceLoader({
      "@/lib/prisma": { prisma: db },
      "next/server": { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } },
      "@supabase/supabase-js": { createClient: () => ({ auth: { getUser: async () => ({ data: { user } }) } }) },
    })("src/app/api/expenses/route.js");
    const request = body => ({ headers: new Headers({ authorization: "Bearer test" }), json: async () => body });
    const payload = { userId: user.id, subscriptionId: manual.id, date: "2026-01-15", amount: 99,
      paymentMethod: "CASH", categoryId: category.id, concept: "Manual" };
    const [posted, confirmed] = await Promise.all([
      expenses.POST(request(payload)),
      apply({ subscriptionId: manual.id, month: "2026-01", amount: 99 }),
    ]);
    assert.equal(posted.status, 200);
    assert.equal(posted.body.expense.id, confirmed.expenseId);
    assert.equal(await db.dailyExpense.count({ where: { subscriptionId: manual.id } }), 1);
    const edited = await expenses.PATCH(request({ ...payload, id: confirmed.expenseId, date: "2026-02-02", amount: 109 }));
    assert.equal(edited.status, 200);
    assert.equal((await ctx.loadSubscriptionCharges(db, user.id, "2026-01", "2026-11-20")).find(row => row.subscriptionId === manual.id).confirmedAmount, 109);
    assert.equal((await ctx.loadSubscriptionCharges(db, user.id, "2026-02", "2026-11-20")).find(row => row.subscriptionId === manual.id).status, "PENDING");
    assert.equal((await expenses.PATCH(request({ ...payload, id: confirmed.expenseId, subscriptionId: null }))).status, 400);
    const duplicate = await db.dailyExpense.create({ data: { userId: user.id, date: new Date("2026-01-15"),
      paymentMethod: "CASH", amount: 99, concept: "Sin vínculo", categoryId: category.id } });
    assert.equal((await expenses.PATCH(request({ ...payload, id: duplicate.id }))).status, 409);
  } finally {
    await db.user.delete({ where: { id: user.id } });
    await db.$disconnect();
  }
});
