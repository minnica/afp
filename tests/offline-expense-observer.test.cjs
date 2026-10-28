const assert = require('node:assert/strict');
const { test } = require('node:test');
const { sourceLoader } = require('./helpers/load-source.ts');

test('observador offline: ignora lecturas antiguas y deja de publicar al cambiar de cuenta', async () => {
  const reads = [], pending = [], errors = [];
  let listener, initial, unsubscribed = false;
  const { observeOfflineExpenses } = sourceLoader({
    './offlineExpenses': {
      readOfflineExpenses: () => new Promise(resolve => reads.push(resolve)),
      subscribeOfflineExpenses: (_userId, callback) => { listener = callback; return () => { unsubscribed = true; }; },
    },
  }, { navigator: { onLine: true }, window: { setTimeout: callback => { initial = callback; return 1; }, clearTimeout() {} } })('src/lib/offlineExpenseObserver.ts');
  let confirmations = 0;
  const stop = observeOfflineExpenses({ userId: 'owner', onPending: rows => pending.push(rows),
    onConfirmed: async () => { confirmations++; }, onError: message => errors.push(message) });
  const first = initial(), second = listener();
  reads[1]([{ clientId: 'new' }]); await second;
  reads[0]([{ clientId: 'old' }]); await first;
  assert.deepEqual(pending, [[{ clientId: 'new' }]]);
  const confirmed = listener({ userId: 'owner', confirmed: true });
  reads[2]([]); await confirmed;
  assert.equal(confirmations, 1);
  const inFlight = listener({ userId: 'owner', confirmed: true });
  stop(); reads[3]([{ clientId: 'after-dispose' }]); await inFlight;
  assert.equal(unsubscribed, true);
  assert.equal(pending.length, 2);
  assert.equal(confirmations, 1);
  assert.deepEqual(errors, []);
});
