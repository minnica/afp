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
  const actual = (await db.$queryRawUnsafe(automationSql))[0].automation;
  // Se mantiene íntegra la automatización histórica; la nueva función solo fija propietario.
  const added = actual.functions.filter(row => row.name === 'capture_device_owner_immutable');
  if (added.length) {
    assert.equal(added.length, 1);
    assert.match(added[0].definition, /OLD\."userId" IS NOT NULL/);
    assert.match(added[0].definition, /NEW\."userId" IS DISTINCT FROM OLD\."userId"/);
  }
  assert.deepEqual({ ...actual, functions: actual.functions.filter(row => row.name !== 'capture_device_owner_immutable') }, beforeAutomation);
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
  const balanceColumns = ['balanceAsOf', 'creditLimit', 'usedBalance'];
  const capturedBalanceColumns = actual.columns.filter(row => row.table_name === 'cards' && balanceColumns.includes(row.column_name));
  assert.deepEqual(capturedBalanceColumns.map(row => row.column_name), balanceColumns);
  for (const column of capturedBalanceColumns) {
    assert.equal(column.is_nullable, 'YES');
    assert.equal(column.column_default, null);
    assert.equal(column.data_type, column.column_name === 'balanceAsOf' ? 'date' : 'numeric');
  }
  assert.match(actual.constraints.find(row => row.table_name === 'cards' && row.name === 'cards_credit_balance_complete_check')?.definition || '', /CHECK.*creditLimit.*usedBalance.*balanceAsOf/);
  const creditColumns = ['postCutCreditAmount', 'postCutCreditDate', 'postCutCreditNotes'];
  const expectedCredits = [
    { ...before.columns.find(row => row.table_name === 'card_cycles' && row.column_name === 'paidAmount'), column_name: 'postCutCreditAmount', is_nullable: 'NO', column_default: '0' },
    { ...before.columns.find(row => row.table_name === 'card_cycles' && row.column_name === 'paidAt'), column_name: 'postCutCreditDate' },
    { ...before.columns.find(row => row.table_name === 'card_cycles' && row.column_name === 'notes'), column_name: 'postCutCreditNotes' },
  ];
  assert.deepEqual(actual.columns.filter(row => row.table_name === 'card_cycles' && creditColumns.includes(row.column_name)), expectedCredits);
  assert.deepEqual(actual.columns.filter(row => row.table_name === 'daily_expenses' && row.column_name === 'cashContributionAmount'), [
    { ...before.columns.find(row => row.table_name === 'daily_expenses' && row.column_name === 'amount'), column_name: 'cashContributionAmount', column_default: '0' },
  ]);
  const contributionConstraint = actual.constraints.filter(row => row.table_name === 'daily_expenses' && row.name === 'daily_expenses_cash_contribution_check');
  assert.equal(contributionConstraint.length, 1);
  assert.match(contributionConstraint[0].definition, /CHECK.*cashContributionAmount/);
  for (const table of ['daily_expenses', 'installment_purchases']) {
    const column = actual.columns.filter(row => row.table_name === table && row.column_name === 'reconciliationStatus');
    assert.equal(column.length, 1);
    assert.equal(column[0].column_default, "'CONFIRMED'::text");
    assert.equal(column[0].is_nullable, 'NO');
    const constraint = actual.constraints.find(row => row.table_name === table && row.name === `${table}_reconciliation_check`);
    assert.match(constraint.definition, /CONFIRMED.*PENDING/);
  }
  for (const section of ['columns', 'constraints', 'indexes', 'enums']) {
    const rows = actual[section].filter(row => (row.table_name || row.tablename) !== 'expense_operations'
      && !['capture_devices', 'capture_pairings', 'capture_events', 'capture_rate_limits', 'capture_card_aliases',
        'capture_automations', 'capture_merchant_rules', 'capture_movements', 'expense_tombstones', 'capture_statements'].includes(row.table_name || row.tablename)
      && !(section === 'columns' && row.table_name === 'card_cycles' && creditColumns.includes(row.column_name))
      && !(section === 'columns' && row.table_name === 'cards' && balanceColumns.includes(row.column_name))
      && !(section === 'constraints' && row.name === 'cards_credit_balance_complete_check')
      && !(section === 'columns' && row.table_name === 'daily_expenses' && row.column_name === 'cashContributionAmount')
      && !(section === 'columns' && ['daily_expenses', 'installment_purchases'].includes(row.table_name) && ['reconciliationStatus', 'reconciledAt'].includes(row.column_name))
      && !(section === 'constraints' && ['daily_expenses_reconciliation_check', 'installment_purchases_reconciliation_check'].includes(row.name))
      && !(section === 'constraints' && row.name === 'daily_expenses_cash_contribution_check'));
    assert.deepEqual(rows, before[section], `Catálogo distinto en ${section}`);
  }
  assert.equal(actual.security.length, before.security.length + 11);
  for (const row of actual.security) {
    assert.equal(row.rls, true, `RLS desactivado: ${row.table_name}`);
    assert.equal(row.force_rls, false);
    assert.equal(row.policies, 0);
  }
}

async function seed(db) {
  const user = await db.user.create({ data: { id: 'a11-user', email: 'a11@example.test' } });
  await db.$executeRaw`INSERT INTO cards (id, "userId", name, "usualCutDay", "usualDueDay", "updatedAt")
    VALUES ('a11-card', ${user.id}, 'Tarjeta histórica', 10, 30, CURRENT_TIMESTAMP)`;
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
  // La semilla también se inserta antes de las migraciones nuevas: solo columnas históricas.
  await db.$executeRaw`INSERT INTO daily_expenses
    (id, "userId", "categoryId", "payableAccountId", date, "paymentMethod", concept, amount,
     "loanBalanceAfterPayment", "loanInterestAmount", "loanPrincipalAmount", "updatedAt")
    VALUES ('a11-payment', ${user.id}, ${category.id}, 'a11-loan', '2026-10-17', 'CASH', 'Abono de prueba', 125.50,
      875.00, 12.50, 113.00, CURRENT_TIMESTAMP)`;
}

async function records(db) {
  return {
    card: await db.card.findUnique({ where: { id: 'a11-card' }, omit: { creditLimit: true, usedBalance: true, balanceAsOf: true } }),
    loan: await db.payableAccount.findUnique({ where: { id: 'a11-loan' } }),
    payment: await db.dailyExpense.findUnique({ where: { id: 'a11-payment' }, omit: { cashContributionAmount: true, reconciliationStatus: true, reconciledAt: true } }),
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
        const historicalCard = await db.card.findUnique({ where: { id: 'a11-card' } });
        assert.equal(historicalCard.creditLimit, null);
        assert.equal(historicalCard.usedBalance, null);
        assert.equal(historicalCard.balanceAsOf, null);
        assert.equal(String((await db.dailyExpense.findUnique({ where: { id: 'a11-payment' } })).cashContributionAmount), '0');
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
    console.log(`Reconstrucción y actualización verificadas; ${localMigrations().length} migraciones y ${before.security.length + 11} tablas con RLS, incluido el historial.`);
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
