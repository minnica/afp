// Diagnóstico local del build de producción; solo peticiones sin credencial.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const origin = process.env.AFP_A10_ORIGIN || 'http://127.0.0.1:4209';
assert.equal(new URL(origin).hostname, '127.0.0.1');
const routes = ['expenses', 'gastos/bootstrap', 'cards', 'card-cycles', 'incomes',
  'money', 'installment-purchases', 'subscriptions', 'subscription-charges',
  'receivables', 'payables', 'dashboard', 'notice-dismissals', 'settings',
  'setup-user', 'calendar/google', 'calendar/google/connect',
  'calendar/google/sync', 'calendar/google/disconnect'];
const results = [];
for (const route of routes) {
  const source = await fs.readFile(new URL(`../../../src/app/api/${route}/route.ts`, import.meta.url), 'utf8');
  const methods = [...source.matchAll(/export (?:async )?function (GET|POST|PATCH|DELETE)\b/g)].map(match => match[1]);
  assert.ok(methods.length, `No methods discovered: ${route}`);
  for (const method of methods) {
    const response = await fetch(`${origin}/api/${route}`, {
      method,
      ...(method === 'GET' ? {} : { headers: { 'Content-Type': 'application/json' }, body: '{}' }),
    });
    const result = { route, method, status: response.status,
      cacheControl: response.headers.get('cache-control'), vary: response.headers.get('vary') };
    results.push(result);
    assert.equal(response.status, 401, `${route} ${method}`);
    assert.equal(result.cacheControl, 'private, no-store');
    assert.match(result.vary, /Authorization/i);
    await response.arrayBuffer();
  }
}
const root = await fetch(`${origin}/`, { redirect: 'manual' });
assert.equal(root.status, 307);
assert.equal(root.headers.get('location'), '/dashboard');
const manifest = await fetch(`${origin}/manifest.webmanifest`);
assert.equal(manifest.status, 200);
await fs.writeFile(new URL('http-production.json', import.meta.url), JSON.stringify({ origin, results,
  root: { status: root.status, location: root.headers.get('location') },
  manifest: { status: manifest.status } }, null, 2) + '\n');
console.log(`${results.length} methods, ${routes.length} routes: all 401/private/no-store/Vary Authorization; root 307; manifest 200`);
