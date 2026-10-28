const assert = require('node:assert/strict');
const { test } = require('node:test');
const { sourceLoader } = require('./helpers/load-source.ts');
const { debtFixture } = require('./helpers/debt-fixture.cjs');
const { getPayablesSummary } = sourceLoader()('src/lib/payablesSummary.ts');

const loan = (overrides = {}) => ({
  id: 'loan', accountType: 'LOAN', status: 'ACTIVE',
  originalAmount: '140000', paidAmount: 25812.39, pendingBalance: 114187.61,
  ...overrides,
});
const reimbursement = (overrides = {}) => ({
  id: 'emmanuel', person: { name: 'Emmanuel' }, status: 'ACTIVE',
  originalAmount: '100000', paidAmount: 53500, pendingBalance: 46500,
  ...overrides,
});

test('resumen: resta únicamente reembolsos pendientes y conserva la deuda bancaria', () => {
  const rows = [
    loan({ reimbursementReceivable: reimbursement() }),
    loan({ id: 'belinda', originalAmount: '180000', paidAmount: 81000, pendingBalance: 99000,
      reimbursementReceivable: reimbursement({ id: 'belinda', person: { name: 'Belinda' },
        originalAmount: '180000', paidAmount: 12250, pendingBalance: 167750 }) }),
    loan({ id: 'own', originalAmount: '100000', paidAmount: 9443.83, pendingBalance: 90556.17 }),
    loan({ id: 'simple', accountType: 'SIMPLE', originalAmount: '35617.89', paidAmount: 23957.23, pendingBalance: 11660.66 }),
  ];
  const before = JSON.stringify(rows);
  const result = getPayablesSummary(rows);
  assert.equal(result.original, 455617.89);
  assert.equal(result.paid, 140213.45);
  assert.equal(result.pending, 315404.44);
  assert.equal(result.loans, 303743.78);
  assert.equal(result.other, 11660.66);
  assert.equal(result.toRecover, 214250);
  // Se compensa globalmente: Belinda aún debe más que el saldo de su préstamo.
  assert.equal(result.own, 101154.44);
  assert.equal(result.recoverySurplus, 0);
  assert.equal(result.reimbursements.map(x => x.name).join(', '), 'Emmanuel, Belinda');
  assert.equal(JSON.stringify(rows), before);
});

test('resumen: cancelaciones y excedentes no compensan las otras deudas', () => {
  const result = getPayablesSummary([
    loan({ status: 'CANCELLED', reimbursementReceivable: reimbursement() }),
    loan({ id: 'overpaid', status: 'PAID_OFF', pendingBalance: -100 }),
    loan({ id: 'cancelled-recovery', pendingBalance: 200, reimbursementReceivable: reimbursement({ status: 'CANCELLED' }) }),
    loan({ id: 'overpaid-recovery', pendingBalance: 300, reimbursementReceivable: reimbursement({ status: 'PAID_OFF', pendingBalance: -0.01 }) }),
    loan({ id: 'settled-recovery', pendingBalance: 400, reimbursementReceivable: reimbursement({ status: 'PAID_OFF', pendingBalance: 0 }) }),
  ]);
  assert.equal(result.pending, 900);
  assert.equal(result.toRecover, 0);
  assert.equal(result.own, 900);
  assert.equal(result.reimbursements.length, 0);
});

test('resumen: una cuenta vinculada varias veces se descuenta una sola vez', () => {
  const result = getPayablesSummary([
    loan({ pendingBalance: 200, reimbursementReceivable: reimbursement({ pendingBalance: 100 }) }),
    loan({ id: 'second', pendingBalance: 300, reimbursementReceivable: reimbursement({ pendingBalance: 100 }) }),
  ]);
  assert.equal(result.pending, 500);
  assert.equal(result.toRecover, 100);
  assert.equal(result.own, 400);
  assert.equal(result.reimbursements.length, 1);
});

test('resumen: conserva cobros pendientes de préstamos liquidados y expone el sobrante', () => {
  const result = getPayablesSummary([
    loan({ status: 'PAID_OFF', pendingBalance: 0, reimbursementReceivable: reimbursement({ pendingBalance: 200 }) }),
    loan({ id: 'other', pendingBalance: 100 }),
  ]);
  assert.equal(result.toRecover, 200);
  assert.equal(result.own, 0);
  assert.equal(result.recoverySurplus, 100);
});

test('resumen: cuentas propias, centavos y estado vacío no inventan reembolsos', () => {
  const result = getPayablesSummary([
    loan({ pendingBalance: '0.10' }),
    loan({ id: 'simple', accountType: 'SIMPLE', pendingBalance: '0.20' }),
  ]);
  assert.equal(result.pending, 0.3);
  assert.equal(result.own, 0.3);
  assert.equal(result.toRecover, 0);
  const empty = getPayablesSummary([]);
  for (const [key, value] of Object.entries(empty)) assert.equal(key === 'reimbursements' ? value.length : value, 0);
});

test('resumen: registrar y editar un ingreso actualiza el neto sin amortizar el banco', async () => {
  const f = debtFixture();
  const account = f.seed('receivable', { originalAmount: '100000' });
  f.seed('payable', { accountType: 'LOAN', originalAmount: '140000', currentBalance: '114187.61', reimbursementReceivableId: account.id });
  const read = async () => {
    const response = await f.call('payables', 'GET');
    assert.equal(response.status, 200);
    return getPayablesSummary(response.body.payables);
  };
  const before = await read();
  assert.equal(before.own, 14187.61);
  const input = { date: '2026-10-22', concept: 'Reembolso', amount: 28000, source: 'Persona', incomeTypeId: 'incomeType-a', receivableAccountId: account.id };
  const created = await f.call('incomes', 'POST', input);
  assert.equal(created.status, 200);
  const after = await read();
  assert.equal(after.pending, before.pending);
  assert.equal(after.toRecover, 72000);
  assert.equal(after.own, 42187.61);
  const updated = await f.call('incomes', 'PATCH', { ...input, id: created.body.income.id, amount: 53500 });
  assert.equal(updated.status, 200);
  const edited = await read();
  assert.equal(edited.pending, before.pending);
  assert.equal(edited.toRecover, 46500);
  assert.equal(edited.own, 67687.61);
});
