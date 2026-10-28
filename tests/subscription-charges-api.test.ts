import assert from 'node:assert/strict';
import { test } from 'node:test';
import { record } from './helpers/dynamic-values';
import { present } from './helpers/financial-fixtures';

import { financialLoader as sourceLoader, testReply } from './helpers/financial-fixtures';

function api() {
  const calls: unknown[][] = [];
  class SubscriptionChargeError extends Error {}
  const globals = { Headers, Date, URL, process: { env: {} }, console, SubscriptionChargeError,
    createClient: () => ({ auth: { getUser: async (token = '') => ({ data: { user: token === "valid" ? { id: "owner" } : null } }) } }),
    NextResponse: { json: testReply },
    prisma: { $transaction: async <T>(run: (tx: string) => Promise<T>) => run("transaction") },
    loadSubscriptionCharges: async (...args: unknown[]) => { calls.push(args); return []; },
    applySubscriptionCharge: async (...args: unknown[]) => { calls.push(args); return { expenseId: "expense" }; },
  };
  const route = sourceLoader({
    "@/lib/prisma": { prisma: globals.prisma },
    "@supabase/supabase-js": { createClient: globals.createClient },
    "next/server": { NextResponse: globals.NextResponse },
    "@/lib/calendar/schedule": { scheduleCalendarSync() {} },
    "@/lib/subscriptionChargeService": globals,
  })("src/app/api/subscription-charges/route.ts");
  const request = (token?: string, body?: unknown) => ({ url: "http://localhost/api/subscription-charges?month=2026-10&userId=other",
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
  assert.equal(present(calls[0])[1], "owner");
  assert.equal(result.headers.get("Cache-Control"), "private, no-store");
  await route.POST(request("valid", { month: "2026-10", userId: "other", amount: "135.50", paymentMethod: "CARD" as const, cardId: "card",
    createReceivable: true, expenseData: { userId: "other", categoryId: "foreign" } }));
  assert.equal(present(calls[1])[0], "transaction");
  assert.equal(present(calls[1])[1], "owner");
  assert.equal(record(present(calls[1])[2]).expenseData, undefined);
  assert.equal(record(present(calls[1])[2]).createReceivable, undefined);
  assert.equal(record(present(calls[1])[2]).amount, "135.50");
  assert.equal(record(present(calls[1])[2]).paymentMethod, "CARD");
  assert.equal(record(present(calls[1])[2]).cardId, "card");
});

test("cobros API: rechaza meses, días y cuerpos inválidos antes de escribir", async () => {
  const { route, calls, request } = api();
  for (const body of [null, { month: "2026-13" }, { month: "2026-10", today: "2099-01-01" }, { month: "2026-10", today: "2026-02-30" }]) {
    assert.equal((await route.POST(request("valid", body))).status, 400);
  }
  assert.equal(calls.length, 0);
});
