import type { Prisma } from '@prisma/client';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { call, record } from './helpers/dynamic-values';
import { present } from './helpers/financial-fixtures';
import { sourceLoader } from './helpers/load-source.ts';

function fixture(paymentMethod: 'CASH' | 'CARD' = "CASH", cardId: string | null = null) {
  const subscription: Omit<import('../src/lib/calculations/types').FinancialSubscription, 'charges' | 'dailyExpenses'> & { userId: string; categoryId: string; charges: Prisma.SubscriptionChargeUncheckedCreateInput[]; dailyExpenses: (Prisma.DailyExpenseUncheckedCreateInput & { id: string })[] } = { id: "s", userId: "owner", name: "Luz", amount: "120", paymentMethod, cardId,
    categoryId: "category", chargeDay: 1, startMonth: 1, startYear: 2026, isActive: true, charges: [], dailyExpenses: [] };
  const cards = [{ id: "nu", userId: "owner" }, { id: "bbva", userId: "owner" }, { id: "foreign", userId: "other" }];
  const tx = {
    $queryRaw: async () => [{ id: subscription.id }],
    subscription: { findUnique: async () => subscription },
    cardCycle: { findMany: async () => [] },
    card: { findFirst: async ({ where }: { where: { id: string; userId: string } }) => cards.find(card => card.id === where.id && card.userId === where.userId) },
    category: { findFirst: async () => ({ id: "category" }) },
    dailyExpense: { create: async ({ data }: { data: Prisma.DailyExpenseUncheckedCreateInput }) => {
      const expense = { id: "expense", ...data };
      subscription.dailyExpenses.push({ ...expense, id: expense.id });
      return expense;
    } },
    subscriptionCharge: { upsert: async ({ create }: { create: Prisma.SubscriptionChargeUncheckedCreateInput }) => subscription.charges.push(create) },
  };
  const { applySubscriptionCharge } = sourceLoader()("src/lib/subscriptionChargeService.ts");
  return { subscription, apply: async (overrides: Record<string, unknown>) => record(await call(applySubscriptionCharge, tx, "owner", {
    subscriptionId: "s", month: "2026-10", action: "confirm", today: "2026-10-21", ...overrides,
  })) };
}

test("un cobro de $120 en efectivo se confirma por $135.50 en una tarjeta sin cambiar la suscripción", async () => {
  const { subscription, apply } = fixture();
  const before = { amount: subscription.amount, paymentMethod: subscription.paymentMethod, cardId: subscription.cardId };
  const result = await apply({ amount: "135.50", paymentMethod: "CARD" as const, cardId: "nu" });
  assert.equal(result.alreadyConfirmed, false);
  const [expense] = subscription.dailyExpenses;
  assert.equal(present(expense).amount, "135.50");
  assert.equal(present(expense).paymentMethod, "CARD");
  assert.equal(present(expense).cardId, "nu");
  assert.deepEqual({ amount: subscription.amount, paymentMethod: subscription.paymentMethod, cardId: subscription.cardId }, before);
  assert.equal(present(subscription.charges[0]).month, "2026-10");
  assert.equal((await apply({ amount: "135.50", paymentMethod: "CARD" as const, cardId: "nu" })).expenseId, result.expenseId);
  assert.equal(subscription.dailyExpenses.length, 1);
});

test("permite otra tarjeta y al pagar en efectivo elimina la tarjeta del gasto", async () => {
  const switched = fixture("CARD", "bbva");
  await switched.apply({ paymentMethod: "CARD" as const, cardId: "nu", amount: "110.25" });
  assert.equal(present(switched.subscription.dailyExpenses[0]).cardId, "nu");
  const cash = fixture("CARD", "bbva");
  await cash.apply({ paymentMethod: "CASH" as const, cardId: "bbva" });
  assert.equal(present(cash.subscription.dailyExpenses[0]).paymentMethod, "CASH");
  assert.equal(present(cash.subscription.dailyExpenses[0]).cardId, null);
  assert.equal(cash.subscription.cardId, "bbva");
});

test("rechaza métodos inválidos, tarjetas ajenas o ausentes y filtros Prisma antes de crear el gasto", async () => {
  for (const overrides of [
    { paymentMethod: "TRANSFER" as const }, { paymentMethod: null }, { paymentMethod: {} },
    { paymentMethod: "CARD" as const }, { paymentMethod: "CARD" as const, cardId: null }, { paymentMethod: "CARD" as const, cardId: "" },
    { paymentMethod: "CARD" as const, cardId: "foreign" }, { paymentMethod: "CARD" as const, cardId: "deleted" },
    { paymentMethod: "CARD" as const, cardId: { not: "" } },
  ]) {
    const { apply, subscription } = fixture();
    await assert.rejects(apply(overrides), error => record(error).status === 400);
    assert.equal(subscription.dailyExpenses.length, 0);
    assert.equal(subscription.charges.length, 0);
  }
});

test("confirmar sin ajustes sigue usando los datos recurrentes", async () => {
  const { apply, subscription } = fixture("CARD", "bbva");
  await apply({});
  assert.equal(present(subscription.dailyExpenses[0]).amount, "120");
  assert.equal(present(subscription.dailyExpenses[0]).paymentMethod, "CARD");
  assert.equal(present(subscription.dailyExpenses[0]).cardId, "bbva");
});
