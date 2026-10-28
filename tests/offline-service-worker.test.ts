import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import { present } from './helpers/financial-fixtures';
import { serviceWorkerListeners } from './helpers/integration-fixtures';

test('service worker servido como JavaScript: todas las API privadas pasan directo a la red', async () => {
  const listeners = serviceWorkerListeners(); let cacheAccesses = 0, network = 0;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8'), {
    URL, Response,
    self: { location: { origin: 'https://example.test' }, addEventListener: listeners.register },
    caches: { open: async () => { cacheAccesses++; return { put() {} }; } },
    fetch: async () => { network++; return new Response('shell'); },
  });
  for (const resource of ['expenses', 'captures/events', 'captures/movements', 'calendar/google', 'money'] as const) {
    for (const method of ['GET', 'POST'] as const) {
      listeners.fetch({ request: { method, mode: 'navigate', url: `https://example.test/api/${resource}` },
        respondWith() { assert.fail('Una API privada no debe pasar por el caché del service worker.'); } });
    }
  }
  assert.equal(cacheAccesses, 0); assert.equal(network, 0);
  let result: Promise<Response> | undefined;
  listeners.fetch({ request: { method: 'GET', mode: 'navigate', url: 'https://example.test/gastos' }, respondWith: promise => { result = promise; } });
  assert.equal(await present(await result).text(), 'shell');
  assert.equal(cacheAccesses, 1); assert.equal(network, 1);
});
