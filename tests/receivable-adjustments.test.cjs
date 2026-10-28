const assert = require('node:assert/strict');
const { test } = require('node:test');
const { sourceLoader } = require('./helpers/load-source.ts');
const { debtFixture } = require('./helpers/debt-fixture.cjs');
const { getDebtAccountState } = sourceLoader()('src/lib/calculations/debtAccounts.ts');
const { getPayablesSummary } = sourceLoader()('src/lib/payablesSummary.ts');

test('conciliación: conserva 38 pagos completos, principal original y saldo separado', () => {
  const account = { originalAmount: '179253.89', balanceAdjustment: '23270.51', status: 'ACTIVE' };
  const payments = [{ amount: '36727.74' }, ...Array.from({ length: 38 }, () => ({ amount: '1750.00' }))];
  const before = JSON.stringify({ account, payments });
  const state = getDebtAccountState(account, payments);
  assert.equal(state.paidAmount, 103227.74);
  assert.equal(state.pendingBalance, 99296.66);
  assert.equal(state.status, 'ACTIVE');
  assert.equal(state.excessAmount, 0);
  assert.equal(getDebtAccountState({ ...account, balanceAdjustment: 0 }, payments).pendingBalance, 76026.15);
  assert.equal(JSON.stringify({ account, payments }), before);
});

test('conciliación: cero, ajustes negativos, centavos, cancelación y excedentes', () => {
  assert.equal(getDebtAccountState({ originalAmount: 100, balanceAdjustment: 20 }, [{ amount: 120 }]).pendingBalance, 0);
  const negative = getDebtAccountState({ originalAmount: 100, balanceAdjustment: -20 }, [{ amount: 90 }]);
  assert.equal(negative.paidAmount, 90);
  assert.equal(negative.pendingBalance, -10);
  assert.equal(negative.excessAmount, 10);
  assert.equal(negative.status, 'PAID_OFF');
  assert.equal(getDebtAccountState({ originalAmount: '0.10', balanceAdjustment: '0.20' }, [{ amount: '0.30' }]).pendingBalance, 0);
  assert.equal(getDebtAccountState({ originalAmount: 100, balanceAdjustment: -100, status: 'CANCELLED' }, []).status, 'CANCELLED');
});

test('conciliación: ingresos y edición del principal conservan el ajuste sin crear dinero', async () => {
  const f = debtFixture();
  const account = f.seed('receivable', { originalAmount: 100, balanceAdjustment: 20, balanceAdjustmentNotes: 'Conciliación no monetaria' });
  const input = { date: '2026-10-22', concept: 'Abono', amount: 50, source: 'Persona', incomeTypeId: 'incomeType-a', receivableAccountId: account.id };
  const created = await f.call('incomes', 'POST', input);
  assert.equal(created.status, 200);
  const first = (await f.call('receivables', 'GET')).body.receivables[0];
  assert.equal(first.paidAmount, 50);
  assert.equal(first.pendingBalance, 70);
  const update = await f.call('receivables', 'PATCH', { ...account, originalAmount: 90, balanceAdjustment: 9999 });
  assert.equal(update.status, 200);
  assert.equal(update.body.receivable.balanceAdjustment, 20, 'La edición habitual no modifica conciliaciones');
  assert.equal(update.body.receivable.balanceAdjustmentNotes, 'Conciliación no monetaria');
  assert.equal(update.body.receivable.pendingBalance, 60);
  const edited = await f.call('incomes', 'PATCH', { ...input, id: created.body.income.id, amount: 110 });
  assert.equal(edited.status, 200);
  assert.equal((await f.call('receivables', 'GET')).body.receivables[0].pendingBalance, 0);
  assert.equal(f.state().income.length, 1);
  assert.equal(f.state().dailyExpense.length, 0);
  await f.call('incomes', 'DELETE', { id: created.body.income.id });
  const reopened = (await f.call('receivables', 'GET')).body.receivables[0];
  assert.equal(reopened.status, 'ACTIVE');
  assert.equal(reopened.pendingBalance, 110);
  assert.equal(reopened.balanceAdjustment, 20);
});

test('conciliación: cuenta vinculada, resumen y banco usan el saldo correcto', async () => {
  const f = debtFixture();
  const account = f.seed('receivable', { originalAmount: '179253.89', balanceAdjustment: '23270.51', balanceAdjustmentNotes: 'Conciliación no monetaria' });
  f.seed('payable', { accountType: 'LOAN', originalAmount: '179253.89', currentBalance: '99296.66', reimbursementReceivableId: account.id });
  const income = await f.call('incomes', 'POST', { date: '2026-10-22', concept: 'Pagos anteriores', amount: '103227.74', source: 'Persona', incomeTypeId: 'incomeType-a', receivableAccountId: account.id });
  assert.equal(income.status, 200);
  const loan = (await f.call('payables', 'GET')).body.payables[0];
  assert.equal(loan.pendingBalance, 99296.66);
  assert.equal(loan.reimbursementReceivable.pendingBalance, 99296.66);
  assert.equal(loan.reimbursementReceivable.paidAmount, 103227.74);
  assert.equal(loan.reimbursementReceivable.balanceAdjustment, '23270.51');
  const summary = getPayablesSummary([loan]);
  assert.equal(summary.toRecover, 99296.66);
  assert.equal(summary.own, 0);
});
