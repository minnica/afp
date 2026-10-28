const assert = require("node:assert/strict");
const { test } = require("node:test");
const { sourceLoader } = require("./helpers/load-source.ts");

function fixture(paymentMethod = "CASH", cardId = null) {
  const subscription = { id: "s", userId: "owner", name: "Luz", amount: "120", paymentMethod, cardId,
    categoryId: "category", chargeDay: 1, startMonth: 1, startYear: 2026, isActive: true, charges: [], dailyExpenses: [] };
  const cards = [{ id: "nu", userId: "owner" }, { id: "bbva", userId: "owner" }, { id: "foreign", userId: "other" }];
  const tx = {
    $queryRaw: async () => [{ id: subscription.id }],
    subscription: { findUnique: async () => subscription },
    cardCycle: { findMany: async () => [] },
    card: { findFirst: async ({ where }) => cards.find(card => card.id === where.id && card.userId === where.userId) },
    category: { findFirst: async () => ({ id: "category" }) },
    dailyExpense: { create: async ({ data }) => {
      const expense = { id: "expense", ...data };
      subscription.dailyExpenses.push(expense);
      return expense;
    } },
    subscriptionCharge: { upsert: async ({ create }) => subscription.charges.push(create) },
  };
  const { applySubscriptionCharge } = sourceLoader()("src/lib/subscriptionChargeService.ts");
  return { subscription, apply: overrides => applySubscriptionCharge(tx, "owner", {
    subscriptionId: "s", month: "2026-10", action: "confirm", today: "2026-10-21", ...overrides,
  }) };
}

test("un cobro de $120 en efectivo se confirma por $135.50 en una tarjeta sin cambiar la suscripción", async () => {
  const { subscription, apply } = fixture();
  const before = { amount: subscription.amount, paymentMethod: subscription.paymentMethod, cardId: subscription.cardId };
  const result = await apply({ amount: "135.50", paymentMethod: "CARD", cardId: "nu" });
  assert.equal(result.alreadyConfirmed, false);
  const [expense] = subscription.dailyExpenses;
  assert.equal(expense.amount, "135.50");
  assert.equal(expense.paymentMethod, "CARD");
  assert.equal(expense.cardId, "nu");
  assert.deepEqual({ amount: subscription.amount, paymentMethod: subscription.paymentMethod, cardId: subscription.cardId }, before);
  assert.equal(subscription.charges[0].month, "2026-10");
  assert.equal((await apply({ amount: "135.50", paymentMethod: "CARD", cardId: "nu" })).expenseId, result.expenseId);
  assert.equal(subscription.dailyExpenses.length, 1);
});

test("permite otra tarjeta y al pagar en efectivo elimina la tarjeta del gasto", async () => {
  const switched = fixture("CARD", "bbva");
  await switched.apply({ paymentMethod: "CARD", cardId: "nu", amount: "110.25" });
  assert.equal(switched.subscription.dailyExpenses[0].cardId, "nu");
  const cash = fixture("CARD", "bbva");
  await cash.apply({ paymentMethod: "CASH", cardId: "bbva" });
  assert.equal(cash.subscription.dailyExpenses[0].paymentMethod, "CASH");
  assert.equal(cash.subscription.dailyExpenses[0].cardId, null);
  assert.equal(cash.subscription.cardId, "bbva");
});

test("rechaza métodos inválidos, tarjetas ajenas o ausentes y filtros Prisma antes de crear el gasto", async () => {
  for (const overrides of [
    { paymentMethod: "TRANSFER" }, { paymentMethod: null }, { paymentMethod: {} },
    { paymentMethod: "CARD" }, { paymentMethod: "CARD", cardId: null }, { paymentMethod: "CARD", cardId: "" },
    { paymentMethod: "CARD", cardId: "foreign" }, { paymentMethod: "CARD", cardId: "deleted" },
    { paymentMethod: "CARD", cardId: { not: "" } },
  ]) {
    const { apply, subscription } = fixture();
    await assert.rejects(apply(overrides), error => error.status === 400);
    assert.equal(subscription.dailyExpenses.length, 0);
    assert.equal(subscription.charges.length, 0);
  }
});

test("confirmar sin ajustes sigue usando los datos recurrentes", async () => {
  const { apply, subscription } = fixture("CARD", "bbva");
  await apply({});
  assert.equal(subscription.dailyExpenses[0].amount, "120");
  assert.equal(subscription.dailyExpenses[0].paymentMethod, "CARD");
  assert.equal(subscription.dailyExpenses[0].cardId, "bbva");
});
