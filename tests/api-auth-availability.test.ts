import assert from 'node:assert/strict';
import { test } from 'node:test';
import { record as objectValue } from './helpers/dynamic-values';
import type { AuthFixtureResult } from './helpers/integration-fixtures';
import { integrationLoader as sourceLoader } from './helpers/integration-fixtures';

function fixture(getUser: (token?: string) => Promise<AuthFixtureResult>) {
  const load = sourceLoader({
    '@supabase/supabase-js': { createClient: () => ({ auth: { getUser } }) },
    '@/lib/calendar/schedule': { scheduleCalendarSync: () => assert.fail('no se agenda una lectura') },
    'next/server': { NextResponse: { json: (body: unknown, options) => ({ body, ...options }) } },
  });
  return load('src/lib/apiAuth.ts');
}
const request = (token?: string) => new Request('http://localhost/api/money', { method: 'GET', headers: new Headers(token ? { authorization: `Bearer ${token}` } : {}) });

test('Auth: las interrupciones de red y errores temporales devuelven 503, conservando la denegación', async () => {
  for (const error of [{ name: 'AuthRetryableFetchError' }, { status: 0 }, { status: 408 }, { status: 429 }, { status: 503 }] as const) {
    const auth = fixture(async () => ({ data: { user: { id: 'owner' } }, error }));
    await assert.rejects(auth.requireApiUser(request('test')), failure => objectValue(failure).status === 503);
  }
  const auth = fixture(async () => { throw new TypeError('fetch failed'); });
  await assert.rejects(auth.requireApiUser(request('test')), failure => objectValue(failure).status === 503);
});

test('Auth: tokens rechazados o identidad ausente siguen devolviendo 401', async () => {
  for (const result of [{ error: { status: 401 } }, { error: { status: 403 } }, { data: { user: null } }] as const) {
    const auth = fixture(async () => result);
    await assert.rejects(auth.requireApiUser(request('invalid')), failure => objectValue(failure).status === 401);
  }
  const auth = fixture(() => assert.fail('consulta sin Bearer'));
  await assert.rejects(auth.requireApiUser(request()), failure => objectValue(failure).status === 401);
});

test('Auth: la recuperación valida de nuevo el token y obtiene la identidad del servidor', async () => {
  let calls = 0;
  const auth = fixture(async token => {
    assert.equal(token, 'test'); calls++;
    return calls === 1 ? { error: { status: 503 } } : { data: { user: { id: 'owner' } }, error: null };
  });
  await assert.rejects(auth.requireApiUser(request('test')), failure => objectValue(failure).status === 503);
  assert.equal((await auth.requireApiUser(request('test'))).id, 'owner');
  assert.equal(calls, 2);
});
