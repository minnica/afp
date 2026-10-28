import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import { sourceLoader, resolveSource, transformSource, checkSourceExports } from './helpers/load-source';
import { buildBrowserModule } from './helpers/browser-module';
import { record, array, call } from './helpers/dynamic-values';

function fixture(t: TestContext, files: Record<string, string>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'afp-source-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const [name, source] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), source);
  }
  return (name: string) => path.join(dir, name);
}

test('cargador: JS → TS → JS, tipos, alias, exports/default y reexports', t => {
  const file = fixture(t, {
    'value.js': 'export const value = 4;',
    'typed.ts': `import { value } from './value.js';
      import type { Missing } from './types-only-does-not-exist';
      import { expenseCents } from '@/lib/sharedExpenses';
      export const amount: number = value + expenseCents(1);
      export default (input: number): number => input + amount;`,
    'index.ts': "export { default, amount as renamed } from './typed'; export * from './value';",
    'entry.js': "import fn, { renamed, value } from './index'; export const result = [fn(2), renamed, value];",
  });
  const result = record(sourceLoader()(file('entry.js'))).result;
  assert.deepEqual(Array.from(array(result)), [106, 104, 4]);
});

test('cargador: mocks tienen prioridad, incluso módulos inexistentes y valores falsy', t => {
  const file = fixture(t, { 'entry.ts': `import mocked from './missing'; import { value } from '@/missing';
    import zero from 'zero'; export const result = [mocked, value, zero];` });
  const load = sourceLoader({ './missing': 'mock', '@/missing': { value: 7 }, zero: 0 });
  assert.deepEqual(Array.from(array(record(load(file('entry.ts'))).result)), ['mock', 7, 0]);
});

test('cargador: caché por instancia, imports circulares y reexports vivos', t => {
  const file = fixture(t, {
    'counter.ts': 'export let count: number = 0; export const increment = () => ++count;',
    'index.js': "export * from './counter';",
    'a.ts': "import { read } from './b'; export const value = 3; export const result = () => read();",
    'b.js': "import { value } from './a'; export const read = () => value;",
  });
  const load = sourceLoader(), counter = record(load(file('index.js')));
  call(counter.increment);
  assert.equal(counter.count, 1);
  assert.equal(record(load(file('counter.ts'))).count, 1);
  assert.equal(record(sourceLoader()(file('counter.ts'))).count, 0);
  assert.equal(call(record(load(file('a.ts'))).result), 3);
});

test('cargador: resolución inequívoca, índices y extensiones explícitas sin sustitución', t => {
  const file = fixture(t, { 'only.ts': 'export default 1;', 'folder/index.ts': 'export default 2;', 'duplicate.js': 'export default 3;', 'duplicate.ts': 'export default 4;' });
  assert.equal(record(sourceLoader()(file('only.ts'))).default, 1);
  assert.equal(record(sourceLoader()(file('only'))).default, 1);
  assert.throws(() => resolveSource(file('only.js')), /no encontrado/);
  assert.throws(() => sourceLoader()(file('only.jsx')), /no encontrado/);
  assert.equal(record(sourceLoader()(file('folder'))).default, 2);
  assert.throws(() => resolveSource(file('duplicate')), /ambiguo/);
  assert.equal(record(sourceLoader()(file('duplicate.js'))).default, 3);
  fs.writeFileSync(file('only.tsx'), 'export default 5;');
  assert.throws(() => resolveSource(file('only')), /ambiguo/);
  assert.equal(record(sourceLoader()(file('only.ts'))).default, 1);
  assert.equal(record(sourceLoader()(file('only.tsx'))).default, 5);
  assert.throws(() => resolveSource(file('only.js')), /no encontrado/);
  assert.throws(() => resolveSource(file('absent')), /no encontrado/);
});

test('cargador: JSX y TSX se ejecutan con runtime React', t => {
  const file = fixture(t, { 'component.tsx': 'export default ({ value }: { value: string }) => <strong>{value}</strong>;', 'view.jsx': "import Component from './component'; export const result = Component({ value: 'test' });" });
  const result = record(record(sourceLoader()(file('view.jsx'))).result);
  assert.equal(result.type, 'strong');
  assert.equal(record(result.props).children, 'test');
});

test('cargador: no hereda credenciales, no carga dotenv ni abre red o BD', t => {
  const file = fixture(t, {
    'env.ts': 'export const env = process.env; export const fetchType = typeof fetch;',
    'dotenv.js': "import 'dotenv/config';",
    'network.ts': "import http from 'node:http'; export default http;",
    'supabase.js': "import { createClient } from '@supabase/supabase-js'; export const db = createClient();",
    'prisma.js': "import { PrismaClient } from '@prisma/client'; export const db = new PrismaClient();",
  });
  const previous = process.env.AFP_LOADER_SECRET;
  process.env.AFP_LOADER_SECRET = 'must-not-leak';
  t.after(() => { if (previous === undefined) delete process.env.AFP_LOADER_SECRET; else process.env.AFP_LOADER_SECRET = previous; });
  const result = record(sourceLoader()(file('env.ts')));
  assert.equal(record(result.env).AFP_LOADER_SECRET, undefined);
  assert.equal(result.fetchType, 'undefined');
  for (const name of ['dotenv.js', 'network.ts', 'supabase.js', 'prisma.js']) assert.throws(() => sourceLoader()(file(name)), /mock explícito/);
  assert.equal(record(record(sourceLoader({}, { process: { env: { TEST: 'fake' } } })(file('env.ts'))).env).TEST, 'fake');
});

test('cargador: elimina de la caché evaluaciones fallidas', t => {
  const file = fixture(t, { 'entry.ts': 'throw new Error("fallo"); export const value = 1;' });
  const load = sourceLoader();
  assert.throws(() => load(file('entry.ts')), /fallo/);
  fs.writeFileSync(file('entry.ts'), 'export const value: number = 2;');
  assert.equal(record(load(file('entry.ts'))).value, 2);
});

test('fixture offline: transforma TS e imports relativos en ESM con API simulada', async t => {
  const file = fixture(t, {
    'value.ts': 'export const value: number = 5;',
    'entry.ts': "import { value } from './value'; import { apiFetch } from '@/lib/apiFetch'; export const run = (): Promise<number> => apiFetch(value);",
  });
  const code = await buildBrowserModule(file('entry.ts'), { '@/lib/apiFetch': 'export const apiFetch = async value => value + 1;' });
  const result: unknown = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  assert.equal(await call(record(result).run), 6);
});


test('cargador tipado: rutas conocidas, exports públicos y lenguajes admitidos', () => {
  const load = sourceLoader();
  assert.equal(load('src/lib/money/dates.ts').addDays('2026-10-28', 1), '2026-10-29');
  assert.equal(load('src/lib/money/dates.ts'), load('src/lib/money/dates.ts'));
  assert.throws(() => sourceLoader({ './dates': { validDay: () => true } })('src/lib/money/dates.ts', ['invalid-name']), /inválido/);
  checkSourceExports('src/lib/money/transferClient.ts', { sendTransfer: () => {} });
  assert.throws(() => checkSourceExports('src/lib/money/transferClient.ts', {}), /Export público inválido/);
  assert.throws(() => checkSourceExports('src/lib/money/transferClient.ts', { sendTransfer: 1 }), /Export público inválido/);
  assert.throws(() => transformSource('', 'fixture.txt'), /no admitido/);
});
