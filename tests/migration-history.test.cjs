const assert = require('node:assert/strict');
const { test } = require('node:test');
const { auditHistory, localMigrations } = require('../scripts/audit-migration-history.cjs');
const snapshot = require('../artifacts/auditoria-2026-10-15/a11-metadata-before.json');

test('A11: recupera la migración original y conserva los trece checksums aplicados', () => {
  const report = auditHistory(snapshot.migrations);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.pending, [
    '20261017000000_add_expense_operations',
    '20261017020000_enable_application_rls',
  ]);
});

test('A11: rechaza SQL alterado, ausente y migraciones fallidas', () => {
  const local = localMigrations();
  const changed = local.map((row, i) => i ? row : { ...row, checksum: 'incorrecto' });
  assert.ok(auditHistory(snapshot.migrations, changed).errors.some(message => message.startsWith('Checksum distinto:')));
  assert.ok(auditHistory(snapshot.migrations, local.slice(1)).errors.some(message => message.startsWith('Migración aplicada sin archivo')));
  assert.ok(auditHistory([{ ...snapshot.migrations[0], finished: false }]).errors.some(message => message.startsWith('Migración incompleta:')));
  const legacy = snapshot.migrations.find(row => row.migration_name.includes('loan'));
  assert.equal(auditHistory([{ ...legacy, checksum: 'incorrecto' }]).errors.length, 1);
  assert.equal(auditHistory([legacy], local.filter(row => !row.migration_name.includes('add_payable_loan'))).errors.length, 1);
});

test('A11: una base creada desde Git tiene todos los checksums y ningún pendiente', () => {
  const rows = localMigrations().map(row => ({ ...row, finished: true, rolled_back: false }));
  assert.deepEqual(auditHistory(rows), { errors: [], pending: [] });
});
