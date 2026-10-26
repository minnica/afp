const assert = require("node:assert/strict");
const { test } = require("node:test");
const { randomBytes, randomUUID } = require("node:crypto");
const { sourceLoader } = require("./helpers/load-source.cjs");

test("Captura: todos los métodos protegidos separan sesión web y credencial nativa antes de leer cuerpo o BD", async () => {
  let databaseCalls = 0;
  const load = sourceLoader({
    "@/lib/prisma": { prisma: new Proxy({}, { get() { databaseCalls++; throw new Error("No debe consultar BD"); } }) },
    "next/server": { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } },
    "@supabase/supabase-js": { createClient: () => ({ auth: { getUser: async () => ({ data: { user: null }, error: new Error("invalid") }) } }) },
  });
  const native = `Capture ${randomUUID()}.${randomBytes(32).toString("base64url")}`;
  for (const name of ["pairings", "devices", "device", "events", "payment-receipts", "notices"]) {
    const handlers = load(`src/app/api/captures/${name}/route.js`);
    for (const [method, handler] of Object.entries(handlers)) {
      if (name === "pairings" && method === "POST") continue;
      for (const authorization of [undefined, "Bearer invalid", name === "devices" || name === "pairings" ? native : "Capture malformed"]) {
        const response = await handler({ headers: new Headers(authorization ? { authorization } : {}),
          get body() { throw new Error("No debe leer el cuerpo"); } });
        assert.equal(response.status, 401, `${method} ${name}`);
      }
    }
  }
  assert.equal(databaseCalls, 0);
});
