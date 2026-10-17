const { createHash } = require('node:crypto');
const { readdirSync, readFileSync } = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const root = path.resolve(__dirname, '..');

function localMigrations() {
  return readdirSync(path.join(root, 'prisma/migrations'), { withFileTypes: true })
    .filter(entry => entry.isDirectory()).map(entry => {
      const sql = readFileSync(path.join(root, 'prisma/migrations', entry.name, 'migration.sql'));
      return { migration_name: entry.name, checksum: createHash('sha256').update(sql).digest('hex') };
    }).sort((a, b) => a.migration_name.localeCompare(b.migration_name));
}

function auditHistory(rows, local = localMigrations()) {
  const files = new Map(local.map(row => [row.migration_name, row]));
  const applied = new Set();
  const errors = [];
  for (const row of rows) {
    if (row.rolled_back) continue;
    if (!row.finished) {
      errors.push(`Migración incompleta: ${row.migration_name}`);
      continue;
    }
    if (applied.has(row.migration_name)) errors.push(`Registro duplicado: ${row.migration_name}`);
    applied.add(row.migration_name);
    const file = files.get(row.migration_name);
    if (file) {
      if (file.checksum !== row.checksum) errors.push(`Checksum distinto: ${row.migration_name}`);
    } else {
      errors.push(`Migración aplicada sin archivo reconocido: ${row.migration_name}`);
    }
  }
  return {
    errors,
    pending: local.filter(row => !applied.has(row.migration_name)).map(row => row.migration_name),
  };
}

async function main() {
  // Deliberadamente sin fallback a .env/DATABASE_URL: la conexión es explícita.
  const connectionString = process.env.AFP_MIGRATION_AUDIT_DATABASE_URL;
  if (!connectionString) throw new Error('Falta AFP_MIGRATION_AUDIT_DATABASE_URL (solo lectura).');
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const rows = await db.$transaction(async tx => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      return tx.$queryRawUnsafe('SELECT migration_name, checksum, finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS rolled_back FROM public._prisma_migrations ORDER BY migration_name');
    });
    const report = auditHistory(rows);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.errors.length ? 1 : report.pending.length ? 2 : 0;
  } finally {
    await db.$disconnect();
  }
}

if (require.main === module) main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

module.exports = { auditHistory, localMigrations, root };
