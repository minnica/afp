import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { discoverTests, runTests } from './run-tests.ts';

function fixture(files: Record<string, string>, operation: (directory: string) => void) {
  const directory = mkdtempSync(path.join(tmpdir(), 'afp-test-runner-'));
  try {
    for (const [name, source] of Object.entries(files)) {
      const file = path.join(directory, name);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, source);
    }
    operation(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function execute(directory: string, selectedFiles: readonly string[] = [], env = process.env) {
  const bootstrap = path.join(directory, 'bootstrap.cjs');
  writeFileSync(bootstrap, `const { runTests } = require(${JSON.stringify(path.join(__dirname, 'run-tests.ts'))});
process.exitCode = runTests({ directory: __dirname, selectedFiles: ${JSON.stringify(selectedFiles)} });`);
  return spawnSync(process.execPath, ['--import', 'tsx', bootstrap], {
    cwd: path.resolve(__dirname, '..'), env, encoding: 'utf8', timeout: 15000,
  });
}

test('ejecutor: descubre CJS y TS una vez en orden, sin contratos, seeds, helpers ni artefactos', () => {
  fixture({
    'z.test.ts': '', 'a.test.cjs': '',
    'types/negative.test.ts': 'throw new Error("contrato ejecutado")',
    'helpers/server.test.ts': '', 'fixtures/data.test.cjs': '',
    'artifacts/old.test.cjs': '', 'seed-ui.ts': '', 'other.test.js': '',
  }, directory => {
    mkdirSync(path.join(directory, 'directory.test.ts'));
    assert.deepEqual(discoverTests(directory).map(file => path.basename(file)), ['a.test.cjs', 'z.test.ts']);
  });
});

test('ejecutor: selección exacta conserva el orden y rechaza rutas ajenas o repetidas', () => {
  fixture({ 'a.test.cjs': '', 'z.test.ts': '', 'seed-ui.ts': '' }, directory => {
    const a = path.join(directory, 'a.test.cjs'), z = path.join(directory, 'z.test.ts');
    assert.deepEqual(discoverTests(directory, ['z.test.ts', path.relative(process.cwd(), a)]), [a, z]);
    assert.deepEqual(discoverTests(directory, [z]), [z]);
    for (const name of ['missing.test.ts', 'seed-ui.ts', '../a.test.cjs']) {
      assert.throws(() => discoverTests(directory, [name]), /Prueba no descubierta/);
    }
    assert.throws(() => discoverTests(directory, ['a.test.cjs', a]), /más de una vez/);
  });
});

test('ejecutor: rechaza nombres base duplicados aunque se seleccione otra prueba', () => {
  fixture({ 'same.test.ts': '', 'same.test.cjs': '', 'other.test.ts': '' }, directory => {
    assert.throws(() => discoverTests(directory), /Nombre de prueba duplicado: same.test/);
    assert.throws(() => discoverTests(directory, ['other.test.ts']), /Nombre de prueba duplicado/);
  });
});

test('ejecutor: ausencia de pruebas y errores de arranque nunca se presentan como éxito', () => {
  fixture({ 'seed-ui.ts': '' }, directory => {
    assert.throws(() => discoverTests(directory), /No se encontraron pruebas/);
  });
  fixture({ 'probe.test.ts': '' }, directory => {
    assert.throws(() => runTests({ directory, executable: path.join(directory, 'missing-node') }), /No se pudo iniciar node:test/);
  });
});

test('ejecutor: convivencia CJS/TS, imports relativos y dinámicos, entorno explícito y aislamiento compartido', () => {
  fixture({
    'value.ts': 'export enum Value { Expected = 42 }',
    'a.test.cjs': `const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Value } = require('./value.ts');
test('fixture cjs', () => { assert.equal(Value.Expected, 42); globalThis.afpRunnerOrder = ['cjs']; });`,
    'b.test.ts': `import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Value } from './value.ts';
test('fixture ts', async () => {
  assert.equal(Value.Expected, (await import('./value.ts')).Value.Expected);
  assert.deepEqual(globalThis.afpRunnerOrder, ['cjs']);
  assert.equal(process.env.AFP_RUNNER_PROBE, 'fictitious');
});`,
    'types/negative.test.ts': 'throw new Error("contrato ejecutado")',
    'helpers/seed.ts': 'throw new Error("seed ejecutado")',
  }, directory => {
    const result = execute(directory, [], { ...process.env, AFP_RUNNER_PROBE: 'fictitious' });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /# pass 2/);
    const selected = execute(directory, ['a.test.cjs']);
    assert.equal(selected.status, 0, selected.stdout + selected.stderr);
    assert.match(selected.stdout, /# pass 1/);
    assert.doesNotMatch(selected.stdout, /fixture ts/);
  });
});

test('ejecutor: propaga aserciones fallidas, códigos de salida y terminaciones por señal', () => {
  fixture({
    'assertion.test.ts': `import { test } from 'node:test'; import assert from 'node:assert/strict';
test('fallo deliberado', () => assert.fail('expected failure'));`,
    'exit.test.cjs': 'process.exit(7);',
    'signal.test.cjs': "process.kill(process.pid, 'SIGKILL');",
  }, directory => {
    const failure = execute(directory, ['assertion.test.ts']);
    assert.equal(failure.status, 1, failure.stdout + failure.stderr);
    assert.match(failure.stdout, /expected failure/);
    assert.equal(execute(directory, ['exit.test.cjs']).status, 7);
    const signal = execute(directory, ['signal.test.cjs']);
    assert.equal(signal.status, 1);
    assert.match(signal.stderr, /node:test terminó por señal SIGKILL/);
  });
});

test('ejecutor: tsx no expone el entorno del proceso al cargador con vm', () => {
  fixture({
    'environment.ts': 'export const environment = process.env;',
    'environment.test.cjs': `const assert = require('node:assert/strict');
const { test } = require('node:test');
const { sourceLoader } = require(${JSON.stringify(path.join(__dirname, 'helpers/load-source.cjs'))});
test('entorno ficticio', () => {
  assert.equal(process.env.AFP_RUNNER_PROBE, 'fictitious');
  const { environment } = sourceLoader()(require('node:path').join(__dirname, 'environment.ts'));
  assert.deepEqual(Object.keys(environment), []);
});`,
  }, directory => {
    const result = execute(directory, [], { ...process.env, AFP_RUNNER_PROBE: 'fictitious' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  });
});

test('ejecutor: CLI lista sin ejecutar, acepta archivos y rechaza filtros desconocidos', () => {
  const cli = (args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', path.join(__dirname, 'run-tests.ts'), ...args], {
    cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 15000,
  });
  const listed = cli(['--list', 'latest-request.test.ts']);
  assert.equal(listed.status, 0, listed.stderr);
  assert.equal(listed.stdout.trim(), JSON.stringify(['tests/latest-request.test.ts']));
  const selected = cli(['tests/latest-request.test.ts']);
  assert.equal(selected.status, 0, selected.stdout + selected.stderr);
  assert.match(selected.stdout, /# pass 3/);
  for (const args of [['missing.test.ts'], ['--test-name-pattern=foo'], ['helpers/seed-ui.cjs']]) {
    const result = cli(args);
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stdout, /# pass/);
  }
});
