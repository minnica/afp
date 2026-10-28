import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fixtureConnection } from './helpers/fixture-database';
import { copyNextConfiguration } from './helpers/next-fixture';

const root = path.resolve(__dirname, '..');

test('browser fixtures: solo aceptan PostgreSQL local desechable sin parámetros', () => {
  for (const host of ['localhost', '127.0.0.1']) {
    const connection = `postgresql://postgres:fake@${host}:55441/afp_test_phase5`;
    assert.equal(fixtureConnection(connection), connection);
  }
  for (const value of ['', 'postgresql://example.test/afp_test', 'postgresql://localhost/afp',
    'postgresql://localhost/afp_test?schema=public', 'postgresql://localhost/afp_test#fragment',
    'https://localhost/afp_test', 'postgresql://localhost/afp_test%2fother']) {
    assert.throws(() => fixtureConnection(value));
  }
});

test('browser fixtures: no copian entorno, tipos generados ni configuraciones exclusivas de pruebas', () => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'afp-config-test-'));
  try {
    copyNextConfiguration(target);
    const files = fs.readdirSync(target);
    assert.ok(files.includes('tsconfig.json') && files.includes('package.json') && files.includes('postcss.config.mjs'));
    assert.ok(files.every(name => ['tsconfig.json', 'package.json', 'postcss.config.mjs', 'types'].includes(name)));
    assert.equal(fs.readFileSync(path.join(target, 'tsconfig.json'), 'utf8'), fs.readFileSync(path.join(root, 'tsconfig.json'), 'utf8'));
    assert.ok(!fs.existsSync(path.join(target, 'next-env.d.ts')) && !fs.existsSync(path.join(target, '.next')));
    assert.ok(!files.some(name => name.startsWith('.env') || name.startsWith('tsconfig.test')));
  } finally { fs.rmSync(target, { recursive: true, force: true }); }
});

test('browser fixtures: servidores y seeds rechazan la conexión antes de crear recursos', () => {
  const temporaryFixtures = () => fs.readdirSync(os.tmpdir()).filter(name => /^afp-(money|capture)-qa-/.test(name)).sort();
  const before = temporaryFixtures();
  for (const helper of ['money-browser-server', 'capture-browser-server', 'seed-ui', 'seed-capture-review', 'seed-receiver-payments']) {
    const result = spawnSync(process.execPath, ['--import', 'tsx', `tests/helpers/${helper}.ts`], {
      cwd: root, encoding: 'utf8', timeout: 15000,
      env: { ...process.env, AFP_TEST_DATABASE_URL: 'postgresql://localhost/shared_database' },
    });
    assert.equal(result.status, 1, `${helper}: ${result.stderr}`);
    assert.match(result.stderr, /Solo permite PostgreSQL local afp_test/);
  }
  assert.deepEqual(temporaryFixtures(), before);
});
