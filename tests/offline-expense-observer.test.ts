import type { OfflineChange } from '../src/lib/offlineExpenseContracts';
import { present } from './helpers/financial-fixtures';

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { integrationLoader as sourceLoader } from './helpers/integration-fixtures';

test('observador offline: ignora lecturas antiguas y deja de publicar al cambiar de cuenta', async () => {
  const reads: ((value: { clientId: string }[]) => void)[] = [], pending: (import("./../src/lib/offlineExpenseContracts").OfflineExpense[])[] = [], errors: (string)[] = [];
  let listener: ((change?: OfflineChange) => Promise<void>) | undefined, initial: (() => Promise<void>) | undefined, unsubscribed = false;
  const { observeOfflineExpenses } = sourceLoader({
    './offlineExpenses': {
      readOfflineExpenses: () => new Promise<{ clientId: string }[]>(resolve => reads.push(resolve)),
      subscribeOfflineExpenses: (_userId: string, callback: (change?: OfflineChange) => Promise<void>) => { listener = callback; return () => { unsubscribed = true; }; },
    },
  }, { navigator: { onLine: true }, window: { setTimeout: (callback: () => Promise<void>) => { initial = callback; return 1; }, clearTimeout() {} } })('src/lib/offlineExpenseObserver.ts');
  let confirmations = 0;
  const stop = observeOfflineExpenses({ userId: 'owner', onPending: rows => pending.push(rows),
    onConfirmed: async () => { confirmations++; }, onError: message => errors.push(message) });
  const first = present(initial)(), second = present(listener)();
  present(reads[1])([{ clientId: 'new' }]); await second;
  present(reads[0])([{ clientId: 'old' }]); await first;
  assert.deepEqual(pending, [[{ clientId: 'new' }]]);
  const confirmed = present(listener)({ userId: 'owner', confirmed: true });
  present(reads[2])([]); await confirmed;
  assert.equal(confirmations, 1);
  const inFlight = present(listener)({ userId: 'owner', confirmed: true });
  stop(); present(reads[3])([{ clientId: 'after-dispose' }]); await inFlight;
  assert.equal(unsubscribed, true);
  assert.equal(pending.length, 2);
  assert.equal(confirmations, 1);
  assert.deepEqual(errors, []);
});
