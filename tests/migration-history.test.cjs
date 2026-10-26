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
    '20261017030000_add_post_cut_credits',
    '20261020000000_add_cash_expense_contributions',
    '20261021000000_add_android_capture_linking',
    '20261021010000_add_capture_processing',
    '20261021020000_capture_installment_reconciliation',
    '20261021030000_capture_review_and_reconciliation',
    '20261021040000_add_card_credit_balances',
    '20261022000000_add_card_balance_tracking',
    '20261023000000_add_google_calendar_sync',
    '20261023010000_capture_wallet_date_policy',
    '20261023020000_capture_nu_cfe_policy',
    '20261023030000_capture_card_payments',
    '20261023040000_automatic_payment_receipts',
    '20261023050000_receivable_balance_adjustment',
    '20261023060000_receiver_payment_notices',
    '20261024010000_capture_mercadopago_purchase_policy',
    '20261024020000_capture_bank_fallback',
    '20261025000000_add_money_accounts',
    '20261025010000_money_account_yields',
    '20261025020000_automatic_money_yields',
    '20261025030000_payroll_business_days',
    '20261026000000_expense_refunds',
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
