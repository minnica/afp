import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { dynamicRoute, financialLoader, testReply } from "./helpers/financial-fixtures";
import { fixtureDatabase } from "./helpers/fixture-database";
import { uiResponseSchemas } from "../src/lib/uiResponseSchemas";

const request = (query: string, authenticated = true) => ({
  url: `http://localhost/api/installment-purchases/payments?${query}`,
  headers: new Headers(authenticated ? { authorization: "Bearer fictitious" } : {}),
});

test("pagos MSI: exige sesión y conserva las cabeceras privadas", async () => {
  const api = dynamicRoute(financialLoader({
    "@/lib/prisma": { prisma: { $transaction() { throw new Error("No debe consultar la BD"); } } },
    "next/server": { NextResponse: { json: testReply } },
  })("src/app/api/installment-purchases/payments/route.ts"));
  const response = await api.GET(request("purchaseId=p", false));
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(response.headers.get("Vary"), "Authorization");
});

test("pagos MSI: rechaza una selección vacía o excesiva antes de consultar", async () => {
  const api = dynamicRoute(financialLoader({
    "@/lib/prisma": { prisma: { $transaction() { throw new Error("No debe consultar la BD"); } } },
    "@/lib/apiAuth": { requireApiUser: async () => ({ id: "owner" }), apiResponse: { json: testReply }, apiAccessErrorResponse: () => null },
  })("src/app/api/installment-purchases/payments/route.ts"));
  for (const query of ["", "purchaseId=", "purchaseId=%20%20", `purchaseId=${"x".repeat(201)}`]) {
    assert.equal((await api.GET(request(query))).status, 400);
  }
});

test("PostgreSQL pagos MSI: historial, ajuste, aislamiento por compra y propietario", { skip: !process.env.AFP_TEST_DATABASE_URL }, async t => {
  const db = await fixtureDatabase(process.env.AFP_TEST_DATABASE_URL!);
  const key = randomUUID();
  const owner = await db.user.create({ data: { email: `installment-payments-${key}@example.test` } });
  const other = await db.user.create({ data: { email: `installment-other-${key}@example.test` } });
  try {
    const card = await db.card.create({ data: { userId: owner.id, name: "Tarjeta ficticia", usualCutDay: 20, usualDueDay: 10 } });
    const category = await db.category.create({ data: { userId: owner.id, name: "Tecnología ficticia" } });
    const person = await db.person.create({ data: { userId: owner.id, name: "Persona ficticia" } });
    const incomeType = await db.incomeType.create({ data: { userId: owner.id, name: "Cobro ficticio" } });
    const foreignPerson = await db.person.create({ data: { userId: other.id, name: "Persona ajena" } });
    const account = await db.receivableAccount.create({ data: {
      userId: owner.id, personId: person.id, concept: "Compra para otra persona", originalAmount: "1200.00",
      balanceAdjustment: "-120.00", balanceAdjustmentNotes: "Bonificación ficticia", expectedMonthlyPayment: "90.00",
      originDate: new Date("2025-12-01T12:00:00Z"), originType: "INSTALLMENT_PURCHASE",
    } });
    const purchase = await db.installmentPurchase.create({ data: {
      userId: owner.id, cardId: card.id, categoryId: category.id, personId: person.id,
      receivableAccountId: account.id, concept: "Equipo ficticio", totalAmount: "1200.00", months: 12,
      purchaseDate: new Date("2025-12-01T12:00:00Z"),
      statementReconciliations: [{ year: 2026, month: 1, paymentNumber: 2, amount: "100.00", remainingBalance: "1000.00" }],
    } });
    const otherAccount = await db.receivableAccount.create({ data: {
      userId: owner.id, personId: person.id, concept: "Otra deuda de la misma persona", originalAmount: 500,
      originDate: new Date("2025-12-01"), originType: "MANUAL",
    } });
    const foreignAccount = await db.receivableAccount.create({ data: {
      userId: other.id, personId: foreignPerson.id, concept: "Deuda ajena", originalAmount: 9999,
      originDate: new Date("2025-12-01"), originType: "MANUAL",
    } });
    await db.income.createMany({ data: [
      ...["same-date-a", "same-date-b"].map(suffix => ({
        id: `${key}-${suffix}`, userId: owner.id, incomeTypeId: incomeType.id, receivableAccountId: account.id,
        amount: "90.00", date: new Date("2026-01-01T00:00:00Z"), source: "Persona ficticia", concept: "Abono idéntico legítimo",
      })),
      { id: `${key}-later`, userId: owner.id, incomeTypeId: incomeType.id, receivableAccountId: account.id,
        amount: "30.00", date: new Date("2026-01-02T12:00:00Z"), source: "Persona ficticia", concept: "Abono parcial" },
      { userId: owner.id, incomeTypeId: incomeType.id, receivableAccountId: otherAccount.id,
        amount: "500.00", date: new Date("2026-01-03"), source: "Persona ficticia", concept: "Otra deuda" },
    ] });
    const before = await db.installmentPurchase.findUniqueOrThrow({ where: { id: purchase.id } });
    const api = dynamicRoute(financialLoader({
      "@/lib/prisma": { prisma: db },
      "next/server": { NextResponse: { json: testReply } },
      "@supabase/supabase-js": { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: owner.id } } }) } }) },
    })("src/app/api/installment-purchases/payments/route.ts"));

    await t.test("la bonificación reduce el saldo y conserva abonos idénticos, fechas y orden", async () => {
      const response = await api.GET(request(`purchaseId=${purchase.id}&userId=${other.id}`));
      assert.equal(response.status, 200);
      const payload = uiResponseSchemas["installment-purchases/payments"].parse(response.body);
      const debt = payload.receivable;
      assert.ok(debt);
      assert.equal(debt.person.id, person.id);
      assert.equal(debt.paidAmount, 210);
      assert.equal(debt.pendingBalance, 870);
      assert.equal(Number(debt.balanceAdjustment), -120);
      assert.equal(Number(debt.expectedMonthlyPayment), 90);
      assert.equal(debt.incomes.length, 3);
      assert.deepEqual(debt.incomes.map(income => income.id), [`${key}-later`, `${key}-same-date-b`, `${key}-same-date-a`]);
      assert.equal(debt.incomes[1]?.date, "2026-01-01T00:00:00.000Z");
      assert.deepEqual(await db.installmentPurchase.findUniqueOrThrow({ where: { id: purchase.id } }), before);
      assert.equal((await db.receivableAccount.findUniqueOrThrow({ where: { id: account.id } })).status, "ACTIVE");
    });

    await t.test("una compra personal no se confunde con una cuenta sin abonos", async () => {
      const personal = await db.installmentPurchase.create({ data: {
        userId: owner.id, cardId: card.id, categoryId: category.id, concept: "Compra propia",
        totalAmount: 100, months: 2, purchaseDate: new Date("2026-01-01"),
      } });
      const personalReply = await api.GET(request(`purchaseId=${personal.id}`));
      assert.equal(personalReply.status, 200);
      assert.equal(uiResponseSchemas["installment-purchases/payments"].parse(personalReply.body).receivable, null);
      const empty = await db.installmentPurchase.create({ data: {
        userId: owner.id, cardId: card.id, categoryId: category.id, personId: person.id,
        receivableAccountId: otherAccount.id, concept: "Sin pagos propios", totalAmount: 500,
        months: 5, purchaseDate: new Date("2026-01-01"),
      } });
      await db.income.deleteMany({ where: { receivableAccountId: otherAccount.id } });
      const emptyReply = await api.GET(request(`purchaseId=${empty.id}`));
      const emptyAccount = uiResponseSchemas["installment-purchases/payments"].parse(emptyReply.body).receivable;
      assert.ok(emptyAccount);
      assert.equal(emptyAccount.paidAmount, 0);
      assert.equal(emptyAccount.pendingBalance, 500);
      assert.deepEqual(emptyAccount.incomes, []);
    });

    await t.test("una compra ajena, inexistente o vinculada a una cuenta ajena no expone datos", async () => {
      const foreignCard = await db.card.create({ data: { userId: other.id, name: "Ajena", usualCutDay: 20, usualDueDay: 10 } });
      const foreignCategory = await db.category.create({ data: { userId: other.id, name: "Ajena" } });
      const foreignPurchase = await db.installmentPurchase.create({ data: {
        userId: other.id, cardId: foreignCard.id, categoryId: foreignCategory.id, receivableAccountId: foreignAccount.id,
        concept: "Compra ajena", totalAmount: 9999, months: 3, purchaseDate: new Date("2026-01-01"),
      } });
      assert.equal((await api.GET(request(`purchaseId=${foreignPurchase.id}`))).status, 404);
      assert.equal((await api.GET(request(`purchaseId=${randomUUID()}`))).status, 404);
      await db.installmentPurchase.update({ where: { id: purchase.id }, data: { receivableAccountId: foreignAccount.id } });
      assert.equal((await api.GET(request(`purchaseId=${purchase.id}`))).status, 404);
    });
  } finally {
    await db.user.deleteMany({ where: { id: { in: [owner.id, other.id] } } });
    await db.$disconnect();
  }
});
