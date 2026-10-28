const assert = require('node:assert/strict');
const { test } = require('node:test');
const { sourceLoader } = require('./helpers/load-source.cjs');
const { createLatestRequest } = sourceLoader()('src/lib/latestRequest.js');
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

test('lecturas: foco y visibilidad comparten la petición pendiente sin cancelarla', async () => {
  const requests = createLatestRequest(), gate = deferred();
  let calls = 0, signal;
  const operation = value => { calls++; signal = value; return gate.promise; };
  const first = requests.run('owner:scenario', operation);
  const second = requests.run('owner:scenario', operation);
  await Promise.resolve();
  assert.equal(first, second); assert.equal(calls, 1); assert.equal(signal.aborted, false);
  gate.resolve('loaded'); assert.equal(await second, 'loaded');
  await requests.run('owner:scenario', async () => { calls++; });
  assert.equal(calls, 2, 'no reutiliza respuestas terminadas');
});

test('lecturas: cambiar de escenario o usuario cancela la anterior sin liberar la nueva', async () => {
  const requests = createLatestRequest(), firstGate = deferred(), nextGate = deferred();
  let firstSignal;
  const first = requests.run('a:base', signal => { firstSignal = signal; return firstGate.promise; });
  await Promise.resolve();
  const next = requests.run('b:scenario', () => nextGate.promise);
  assert.equal(firstSignal.aborted, true);
  firstGate.resolve(); await first;
  assert.equal(requests.run('b:scenario', () => assert.fail('consulta repetida')), next);
  nextGate.resolve('new'); assert.equal(await next, 'new');
});

test('lecturas: un fallo permite reintentar y cancelar impide enviar trabajo pendiente', async () => {
  const requests = createLatestRequest();
  await assert.rejects(requests.run('a', async () => { throw new Error('offline'); }), /offline/);
  assert.equal(await requests.run('a', async () => 'recovered'), 'recovered');
  const pending = requests.run('a', () => assert.fail('envío después de salir'));
  requests.cancel(); requests.cancel();
  await assert.rejects(pending, error => error.name === 'AbortError');
  assert.equal(await requests.run('a', async () => 'fresh'), 'fresh');
});
