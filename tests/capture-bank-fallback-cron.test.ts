import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { command, configure } from '../scripts/configure-capture-bank-fallback-cron.cjs';
import { array } from './helpers/dynamic-values';
import { present } from './helpers/financial-fixtures';
const connectionString = process.env.AFP_TEST_DATABASE_URL;

test('respaldo: programación idempotente y SQL condicional con adaptadores locales de cron/net/Vault', { skip: !connectionString }, async () => {
  assert.ok(connectionString);
  const url = new URL(connectionString);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && /^\/afp_test\w*$/.test(url.pathname) && !url.search);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const userId = 'bank-fallback-cron-fixture', secret = 'fictitious-cron-secret-'.repeat(3);
  // PostgreSQL real verifica transacciones, parámetros, SQL condicional y cuerpos.
  // Los servicios de extensiones son adaptadores de prueba; no simulan su reloj.
  try {
    const [existing] = await db.$queryRaw<{ present: boolean }[]>`SELECT to_regnamespace('cron') IS NOT NULL OR to_regnamespace('net') IS NOT NULL OR to_regnamespace('vault') IS NOT NULL AS present`;
    assert.equal(present(existing).present, false, 'Usar base local desechable sin extensiones externas.');
    for (const sql of [
      'CREATE SCHEMA cron', 'CREATE SCHEMA net', 'CREATE SCHEMA vault',
      'CREATE TABLE cron.job (jobname text PRIMARY KEY, schedule text, command text)',
      'CREATE TABLE vault.secrets (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text UNIQUE, decrypted_secret text)',
      'CREATE VIEW vault.decrypted_secrets AS SELECT * FROM vault.secrets',
      'CREATE TABLE net.requests (url text, headers jsonb, body jsonb, timeout integer)',
      `CREATE FUNCTION vault.create_secret(value text, key text) RETURNS uuid LANGUAGE sql AS $$ INSERT INTO vault.secrets(name, decrypted_secret) VALUES(key,value) RETURNING id $$`,
      `CREATE FUNCTION vault.update_secret(key uuid, value text) RETURNS void LANGUAGE sql AS $$ UPDATE vault.secrets SET decrypted_secret=value WHERE id=key $$`,
      `CREATE FUNCTION cron.schedule(key text, frequency text, sql text) RETURNS bigint LANGUAGE plpgsql AS $$ BEGIN INSERT INTO cron.job VALUES(key,frequency,sql) ON CONFLICT(jobname) DO UPDATE SET schedule=EXCLUDED.schedule, command=EXCLUDED.command; RETURN 1; END $$`,
      `CREATE FUNCTION net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds integer) RETURNS bigint LANGUAGE plpgsql AS $$ BEGIN INSERT INTO net.requests VALUES(url,headers,body,timeout_milliseconds); RETURN 1; END $$`,
    ]) await db.$executeRawUnsafe(sql);
    await assert.rejects(configure(db, 'http://example.test', secret));
    await assert.rejects(configure(db, 'https://example.test', 'short'));
    await assert.rejects(configure(db, 'https://example.test/path', secret));
    await configure(db, 'https://example.test', secret); await configure(db, 'https://example.test', secret);
    assert.equal(array((await db.$queryRaw<{ schedule: string; command: string }[]>`SELECT * FROM cron.job`)).length, 1);
    assert.equal(array((await db.$queryRaw`SELECT * FROM vault.secrets`)).length, 2);
    const [job] = await db.$queryRaw<{ schedule: string; command: string }[]>`SELECT * FROM cron.job`;
    assert.equal(present(job).schedule, '* * * * *'); assert.equal(present(job).command, command); assert.ok(!present(job).command.includes(secret));
    await db.$queryRawUnsafe(present(job).command); assert.equal(array((await db.$queryRaw<{ url: string; headers: { Authorization: string }; body: object; timeout: number }[]>`SELECT * FROM net.requests`)).length, 0);
    await db.user.create({ data: { id: userId, email: 'fallback-cron@example.test' } });
    const m = await db.captureMovement.create({ data: { userId, status: 'REVIEW' as const, reason: 'BANK_FALLBACK_WAIT', proposal: {}, fallbackDueAt: new Date(Date.now() + 900000) } });
    await db.$queryRawUnsafe(present(job).command); assert.equal(array((await db.$queryRaw<{ url: string; headers: { Authorization: string }; body: object; timeout: number }[]>`SELECT * FROM net.requests`)).length, 0);
    await db.captureMovement.update({ where: { id: m.id }, data: { fallbackDueAt: new Date(Date.now() - 1000) } });
    await db.$queryRawUnsafe(present(job).command);
    const [request] = await db.$queryRaw<{ url: string; headers: { Authorization: string }; body: object; timeout: number }[]>`SELECT * FROM net.requests`;
    assert.equal(present(request).url, 'https://example.test/api/cron/capture-bank-fallback'); assert.equal(present(request).headers.Authorization, `Bearer ${secret}`);
    assert.deepEqual(present(request).body, {}); assert.equal(present(request).timeout, 60000);
    await db.$queryRawUnsafe(present(job).command); assert.equal(array((await db.$queryRaw<{ url: string; headers: { Authorization: string }; body: object; timeout: number }[]>`SELECT * FROM net.requests`)).length, 2, 'Pendiente permanece reintentable al fallar HTTP.');
    await db.captureMovement.update({ where: { id: m.id }, data: { fallbackDueAt: null, reason: 'BANK_FALLBACK_REGISTERED', status: 'REGISTERED' as const } });
    await db.$queryRawUnsafe(present(job).command); assert.equal(array((await db.$queryRaw<{ url: string; headers: { Authorization: string }; body: object; timeout: number }[]>`SELECT * FROM net.requests`)).length, 2);
  } finally {
    await db.user.deleteMany({ where: { id: userId } });
    for (const name of ['cron', 'net', 'vault']) await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${name} CASCADE`);
    await db.$disconnect();
  }
});
