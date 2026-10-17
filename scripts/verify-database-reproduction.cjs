const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { readFileSync, readdirSync, writeFileSync, mkdirSync, cpSync, mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { root, auditHistory, localMigrations } = require('./audit-migration-history.cjs');
const before = require('../artifacts/auditoria-2026-10-15/a11-metadata-before.json');
const beforeAutomation = require('../artifacts/auditoria-2026-10-15/a11-automation-before.json');
const metadataSql = readFileSync(path.join(__dirname, 'database-metadata.sql'), 'utf8');
const automationSql = readFileSync(path.join(__dirname, 'database-automation.sql'), 'utf8');
const securityMigration = '20261017020000_enable_application_rls';
const makeClient = connectionString => new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

function runPrisma(args, url) {
  // El wrapper de pnpm configura la resolución de las dependencias de la CLI.
  const cli = path.join(root, 'node_modules/.bin/prisma');
  const result = spawnSync(cli, args, {
    cwd: root, encoding: 'utf8',
    env: { ...process.env, DIRECT_URL: url, DATABASE_URL: url },
  });
  if (result.status !== 0) throw new Error(`prisma ${args.join(' ')}: ${result.stderr}\n${result.stdout}`);
  return result.stdout.trim();
}

async function catalog(db) {
  return (await db.$queryRawUnsafe(metadataSql))[0].metadata;
}

async function assertAutomation(db) {
  assert.deepEqual((await db.$queryRawUnsafe(automationSql))[0].automation, beforeAutomation);
}

async function assertNewTableRls(db, role) {
  // Comprueba los tres eventos y que el automatismo se limite a public.
  await db.$executeRawUnsafe('CREATE TABLE public.a11_rls_create (id integer)');
  await db.$executeRawUnsafe('CREATE TABLE public.a11_rls_ctas AS SELECT 1 AS id');
  await db.$executeRawUnsafe('SELECT 1 AS id INTO public.a11_rls_select');
  await db.$executeRawUnsafe('CREATE SCHEMA a11_other');
  await db.$executeRawUnsafe('CREATE TABLE a11_other.probe (id integer)');
  const flags = await db.$queryRawUnsafe("SELECT n.nspname AS schema, c.relname AS name, c.relrowsecurity AS rls FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE (n.nspname='public' AND c.relname LIKE 'a11_rls_%') OR (n.nspname='a11_other' AND c.relname='probe') ORDER BY schema,name");
  assert.equal(flags.length, 4);
  for (const row of flags) assert.equal(row.rls, row.schema === 'public');
  await db.$executeRawUnsafe(`GRANT SELECT ON public.a11_rls_ctas TO ${role}`);
  await db.$transaction(async tx => {
    await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
    assert.deepEqual(await tx.$queryRawUnsafe('SELECT * FROM public.a11_rls_ctas'), []);
  });
  await db.$executeRawUnsafe('DROP TABLE public.a11_rls_create, public.a11_rls_ctas, public.a11_rls_select');
  await db.$executeRawUnsafe('DROP SCHEMA a11_other CASCADE');
}

function runRegressions(url) {
  const files = readdirSync(path.join(root, 'tests')).filter(name => name.endsWith('.test.cjs')).sort();
  const result = spawnSync(process.execPath, ['--test', '--experimental-test-isolation=none', ...files.map(name => path.join(root, 'tests', name))], {
    cwd: root, encoding: 'utf8', env: { ...process.env, AFP_TEST_DATABASE_URL: url },
  });
  process.stdout.write(result.stdout || '');
  if (result.status !== 0) throw new Error(`Fallaron las regresiones: ${result.stderr}`);
}

function assertCatalog(actual) {
  // Conserva el snapshot histórico; verifica explícitamente las columnas nuevas.
  const creditColumns = ['postCutCreditAmount', 'postCutCreditDate', 'postCutCreditNotes'];
  const expectedCredits = [
    { ...before.columns.find(row => row.table_name === 'card_cycles' && row.column_name === 'paidAmount'), column_name: 'postCutCreditAmount', is_nullable: 'NO', column_default: '0' },
    { ...before.columns.find(row => row.table_name === 'card_cycles' && row.column_name === 'paidAt'), column_name: 'postCutCreditDate' },
    { ...before.columns.find(row => row.table_name === 'card_cycles' && row.column_name === 'notes'), column_name: 'postCutCreditNotes' },
  ];
  assert.deepEqual(actual.columns.filter(row => row.table_name === 'card_cycles' && creditColumns.includes(row.column_name)), expectedCredits);
  for (const section of ['columns', 'constraints', 'indexes', 'enums']) {
    const rows = actual[section].filter(row => (row.table_name || row.tablename) !== 'expense_operations' && !(section === 'columns' && row.table_name === 'card_cycles' && creditColumns.includes(row.column_name)));
    assert.deepEqual(rows, before[section], `Catálogo distinto en ${section}`);
  }
  assert.equal(actual.security.length, before.security.length + 1);
  for (const row of actual.security) {
    assert.equal(row.rls, true, `RLS desactivado: ${row.table_name}`);
    assert.equal(row.force_rls, false);
    assert.equal(row.policies, 0);
  }
}

async function seed(db) {
  const user = await db.user.create({ data: { id: 'a11-user', email: 'a11@example.test' } });
  const person = await db.person.create({ data: { id: 'a11-person', userId: user.id, name: 'Prueba A11' } });
  const receivable = await db.receivableAccount.create({ data: {
    id: 'a11-receivable', userId: user.id, personId: person.id, concept: 'Reembolso',
    originalAmount: '125.50', originDate: new Date('2026-10-17'), originType: 'MANUAL',
  } });
  await db.payableAccount.create({ data: {
    id: 'a11-loan', userId: user.id, personId: person.id, concept: 'Préstamo de prueba',
    originalAmount: '1000.50', originDate: new Date('2026-10-17'), originType: 'MANUAL',
    accountType: 'LOAN', annualInterestRate: '12.25', currentBalance: '875.00',
    firstPaymentDate: new Date('2026-11-01'), paymentAmount: '125.50',
    paymentDays: [1, 15], paymentsMade: 1, totalPayments: 8,
    reimbursementReceivableId: receivable.id,
  } });
  const category = await db.category.create({ data: { id: 'a11-category', userId: user.id, name: 'Abono' } });
  await db.dailyExpense.create({ data: {
    id: 'a11-payment', userId: user.id, categoryId: category.id, payableAccountId: 'a11-loan',
    date: new Date('2026-10-17'), paymentMethod: 'CASH', concept: 'Abono de prueba', amount: '125.50',
    loanBalanceAfterPayment: '875.00', loanInterestAmount: '12.50', loanPrincipalAmount: '113.00',
  } });
}

async function records(db) {
  return {
    loan: await db.payableAccount.findUnique({ where: { id: 'a11-loan' } }),
    payment: await db.dailyExpense.findUnique({ where: { id: 'a11-payment' } }),
    receivable: await db.receivableAccount.findUnique({ where: { id: 'a11-receivable' } }),
  };
}

async function assertAccess(db, roles) {
  const tables = (await catalog(db)).security.map(row => row.table_name);
  await db.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${roles.join(', ')}`);
  await db.$executeRawUnsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${roles.join(', ')}`);
  for (const role of roles.slice(0, 2)) {
    await db.$transaction(async tx => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
      for (const table of tables) {
        assert.deepEqual(await tx.$queryRawUnsafe(`SELECT * FROM public."${table}" LIMIT 1`), [], `${role} puede leer ${table}`);
      }
      assert.equal(await tx.$executeRawUnsafe("UPDATE public.users SET name = 'prohibido' WHERE id = 'a11-user'"), 0);
      assert.equal(await tx.$executeRawUnsafe("DELETE FROM public.users WHERE id = 'a11-user'"), 0);
    });
    await assert.rejects(db.$transaction(async tx => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
      await tx.$executeRawUnsafe("INSERT INTO public.users (id, email) VALUES ('a11-forbidden', 'forbidden@example.test')");
    }), /row.level security/);
  }
  // Propietario real sin SUPERUSER ni BYPASSRLS, como alternativa de servidor.
  const owner = roles[2];
  for (const table of tables) await db.$executeRawUnsafe(`ALTER TABLE public."${table}" OWNER TO ${owner}`);
  await db.$transaction(async tx => {
    await tx.$executeRawUnsafe(`SET LOCAL ROLE ${owner}`);
    assert.equal((await tx.$queryRawUnsafe("SELECT id FROM public.users WHERE id = 'a11-user'")).length, 1);
    await tx.$executeRawUnsafe("INSERT INTO public.users (id, email) VALUES ('a11-server', 'server@example.test')");
    await tx.$executeRawUnsafe("DELETE FROM public.users WHERE id = 'a11-server'");
  });
}

async function main() {
  const connectionString = process.env.AFP_MIGRATION_TEST_DATABASE_URL;
  if (!connectionString) throw new Error('Falta AFP_MIGRATION_TEST_DATABASE_URL: PostgreSQL local desechable afp_test… con permiso de crear bases/roles.');
  const url = new URL(connectionString);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) &&
    /^\/afp_test[a-zA-Z0-9_]*$/.test(url.pathname) && !url.search,
  'Solo permite una BD local afp_test… sin parámetros que puedan redirigir la conexión.');
  const id = randomBytes(6).toString('hex');
  const names = [`afp_test_a11_fresh_${id}`, `afp_test_a11_upgrade_${id}`];
  const roles = ['anon', 'authenticated', 'owner'].map(role => `afp_a11_${role}_${id}`);
  const temp = mkdtempSync(path.join(tmpdir(), 'afp-a11-'));
  const admin = makeClient(connectionString);
  const createdDatabases = [], createdRoles = [];
  try {
    for (const role of roles) {
      await admin.$executeRawUnsafe(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOBYPASSRLS`);
      createdRoles.push(role);
    }
    // Un historial anterior separado permite simular una actualización sin
    // modificar archivos versionados ni usar reset/db push/migrate resolve.
    const oldMigrations = path.join(temp, 'migrations');
    mkdirSync(oldMigrations);
    cpSync(path.join(root, 'prisma/migrations/migration_lock.toml'), path.join(oldMigrations, 'migration_lock.toml'));
    for (const row of before.migrations) {
      cpSync(path.join(root, 'prisma/migrations', row.migration_name), path.join(oldMigrations, row.migration_name), { recursive: true });
    }
    const oldConfig = path.join(temp, 'prisma.config.ts');
    writeFileSync(oldConfig, `export default { schema: ${JSON.stringify(path.join(root, 'prisma/schema.prisma'))}, migrations: { path: ${JSON.stringify(oldMigrations)} }, datasource: { url: process.env.DIRECT_URL } };\n`);
    const oldSecurity = path.join(temp, 'security.sql');
    writeFileSync(oldSecurity, before.security.map(row => `ALTER TABLE public."${row.table_name}" ENABLE ROW LEVEL SECURITY;`).join('\n') + '\n' +
      beforeAutomation.functions[0].definition + ';\nCREATE EVENT TRIGGER ensure_rls ON ddl_command_end WHEN TAG IN (\'CREATE TABLE\', \'CREATE TABLE AS\', \'SELECT INTO\') EXECUTE FUNCTION public.rls_auto_enable();\n');

    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
      createdDatabases.push(name);
      const target = new URL(url); target.pathname = '/' + name;
      const dbUrl = target.href;
      const db = makeClient(dbUrl);
      try {
        let savedRecords, savedHistory;
        if (i === 1) {
          runPrisma(['migrate', 'deploy', '--config', oldConfig], dbUrl);
          runPrisma(['db', 'execute', '--file', oldSecurity], dbUrl);
          const oldCatalog = await catalog(db);
          await assertAutomation(db);
          for (const section of ['columns', 'constraints', 'indexes', 'enums', 'security', 'migrations']) {
            assert.deepEqual(oldCatalog[section], before[section], `Estado previo distinto: ${section}`);
          }
          await seed(db);
          savedRecords = await records(db);
          savedHistory = await db.$queryRawUnsafe('SELECT * FROM public._prisma_migrations ORDER BY migration_name');
        }
        runPrisma(['migrate', 'deploy'], dbUrl);
        const first = await catalog(db);
        assertCatalog(first);
        await assertAutomation(db);
        const history = auditHistory(first.migrations);
        assert.deepEqual(history.errors, []);
        assert.deepEqual(history.pending, []);
        assert.equal(first.migrations.length, localMigrations().length);
        runPrisma(['migrate', 'deploy'], dbUrl);
        assert.deepEqual((await catalog(db)).migrations, first.migrations);
        runPrisma(['migrate', 'diff', '--from-config-datasource', '--to-schema', 'prisma/schema.prisma', '--exit-code'], dbUrl);
        runPrisma(['migrate', 'status'], dbUrl);
        if (i === 0) {
          runRegressions(dbUrl);
          await seed(db);
          savedRecords = await records(db);
        }
        runPrisma(['db', 'execute', '--file', path.join(root, 'prisma/migrations', securityMigration, 'migration.sql')], dbUrl);
        assert.deepEqual(await records(db), savedRecords);
        if (savedHistory) {
          const currentHistory = await db.$queryRawUnsafe('SELECT * FROM public._prisma_migrations ORDER BY migration_name');
          assert.deepEqual(currentHistory.filter(row => before.migrations.some(old => old.migration_name === row.migration_name)), savedHistory);
        }
        assertCatalog(await catalog(db));
        await assertAutomation(db);
        await assertAccess(db, roles);
        await assertNewTableRls(db, roles[0]);
        console.log(`OK ${i ? 'actualización desde las 13 migraciones aplicadas' : 'base vacía'}: catálogo equivalente, diff vacío, checksums, deploy repetible, registros intactos y RLS.`);
      } finally { await db.$disconnect(); }
    }
    console.log(`Reconstrucción y actualización verificadas; ${localMigrations().length} migraciones y 17 tablas con RLS, incluido el historial.`);
  } finally {
    // Solo elimina bases/roles con sufijo aleatorio creados por esta ejecución.
    for (const name of createdDatabases.reverse()) await admin.$executeRawUnsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
    for (const role of createdRoles.reverse()) await admin.$executeRawUnsafe(`DROP ROLE ${role}`);
    await admin.$disconnect();
    rmSync(temp, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
