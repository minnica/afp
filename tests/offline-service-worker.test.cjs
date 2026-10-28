const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('service worker servido como JavaScript: todas las API privadas pasan directo a la red', async () => {
  const listeners = new Map(); let cacheAccesses = 0, network = 0;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8'), {
    URL, Response,
    self: { location: { origin: 'https://example.test' }, addEventListener: (name, run) => listeners.set(name, run) },
    caches: { open: async () => { cacheAccesses++; return { put() {} }; } },
    fetch: async () => { network++; return new Response('shell'); },
  });
  for (const resource of ['expenses', 'captures/events', 'captures/movements', 'calendar/google', 'money']) {
    for (const method of ['GET', 'POST']) {
      listeners.get('fetch')({ request: { method, mode: 'navigate', url: `https://example.test/api/${resource}` },
        respondWith() { assert.fail('Una API privada no debe pasar por el caché del service worker.'); } });
    }
  }
  assert.equal(cacheAccesses, 0); assert.equal(network, 0);
  let result;
  listeners.get('fetch')({ request: { method: 'GET', mode: 'navigate', url: 'https://example.test/gastos' }, respondWith: promise => { result = promise; } });
  assert.equal(await (await result).text(), 'shell');
  assert.equal(cacheAccesses, 1); assert.equal(network, 1);
});
