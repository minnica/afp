import assert from 'node:assert/strict';
import { test } from 'node:test';
import { debtFixture } from './helpers/debt-fixture.ts';
import { array, record } from './helpers/dynamic-values';
import { branch, present, sparseCalculations } from './helpers/financial-fixtures';
import { sourceLoader } from './helpers/load-source.ts';
const { getDebtAccountState } = sparseCalculations(sourceLoader()('src/lib/calculations/debtAccounts.ts'));

const payment = (kind: 'payable' | 'receivable', account: { id: string }, amount: number) => ({ date: '2026-10-17', concept: 'Abono', amount,
  ...(kind === 'payable' ? { paymentMethod: 'CASH' as const, categoryId: 'category-a', payableAccountId: account.id }
    : { source: 'Persona', incomeTypeId: 'incomeType-a', receivableAccountId: account.id }) });
const configs = [ ['payable', 'expenses', 'payables', 'expense', 'dailyExpense'], ['receivable', 'incomes', 'receivables', 'income', 'income'] ] as const;

test('préstamos: saldo bancario conciliado conserva capital e intereses separados, incluido cero', () => {
  const account = { originalAmount: '140000', accountType: 'LOAN', currentBalance: '114187.61', status: 'ACTIVE' as const };
  const payments = [{ amount: '1351.85', loanPrincipalAmount: '1063.73', loanInterestAmount: '288.12' }];
  const state = getDebtAccountState(account, payments);
  assert.equal(state.pendingBalance, 114187.61);
  assert.equal(state.paidAmount, 25812.39);
  assert.equal(state.status, 'ACTIVE');
  assert.equal(getDebtAccountState(account, [...payments, { amount: '100000' }]).pendingBalance, 114187.61);
  assert.equal(getDebtAccountState({ ...account, currentBalance: '0' }, payments).status, 'PAID_OFF');
  assert.equal(getDebtAccountState({ ...account, currentBalance: '0', status: 'CANCELLED' as const }, payments).status, 'CANCELLED');
  const noSnapshot = getDebtAccountState({ ...account, currentBalance: null }, payments);
  assert.equal(noSnapshot.pendingBalance, 138936.27);
  assert.equal(noSnapshot.paidAmount, 1063.73);
});

test('préstamos: GET conserva el saldo bancario al registrar reembolsos o gastos', async () => {
  const f = debtFixture();
  const account = f.seed('payable', { originalAmount: '140000', accountType: 'LOAN', currentBalance: '114187.61', reimbursementReceivableId: 'receivable-linked' });
  f.seed('receivable', { id: 'receivable-linked', originalAmount: '100000' });
  await ok(f, 'incomes', 'POST', { ...payment('receivable', { id: 'receivable-linked' }, 28000) });
  await ok(f, 'expenses', 'POST', payment('payable', account, 1351.85));
  const payable = array((await ok(f, 'payables', 'GET')).payables)[0];
  assert.equal(record(payable).pendingBalance, 114187.61);
  assert.equal(record(payable).paidAmount, 25812.39);
  assert.equal(record(payable).reimbursementReceivableId, 'receivable-linked');
  assert.equal(record(array((await ok(f, 'receivables', 'GET')).receivables)[0]).pendingBalance, 72000);
});

test('préstamos: desglose usa los ingresos vigentes sin descontarlos del banco ni modificar el historial', async () => {
  const f = debtFixture();
  const receivable = f.seed('receivable', { originalAmount: '100000' });
  f.seed('payable', { originalAmount: '140000', accountType: 'LOAN', currentBalance: '114187.61', reimbursementReceivableId: receivable.id });
  const first = (await ok(f, 'incomes', 'POST', payment('receivable', receivable, 28000))).income;
  const latest = (await ok(f, 'incomes', 'POST', payment('receivable', receivable, 25500))).income;
  async function check(paid: number, pending: number, status = 'ACTIVE') {
    const beforeRead = f.state();
    const loan = array((await ok(f, 'payables', 'GET')).payables)[0];
    assert.equal(record(loan).pendingBalance, 114187.61);
    assert.equal(record(loan).paidAmount, 25812.39);
    assert.equal(Number(record(loan).originalAmount), 140000);
    assert.equal(Number(record(record(loan).reimbursementReceivable).originalAmount), 100000);
    assert.equal(record(record(loan).reimbursementReceivable).paidAmount, paid);
    assert.equal(record(record(loan).reimbursementReceivable).pendingBalance, pending);
    assert.equal(record(record(loan).reimbursementReceivable).status, status);
    assert.equal(record(record(loan).reimbursementReceivable).excessAmount, Math.max(0, -pending));
    assert.equal(Object.hasOwn(record(record(loan).reimbursementReceivable), 'incomes'), false);
    const separate = array((await ok(f, 'receivables', 'GET')).receivables)[0];
    assert.equal(record(separate).pendingBalance, pending);
    assert.equal(record(separate).paidAmount, paid);
    assert.deepEqual(f.state(), beforeRead);
  }
  await check(53500, 46500);
  await ok(f, 'incomes', 'PATCH', { ...payment('receivable', receivable, 72000), id: record(latest).id });
  await check(100000, 0, 'PAID_OFF');
  await ok(f, 'incomes', 'PATCH', { ...payment('receivable', receivable, 72000.01), id: record(latest).id });
  await check(100000.01, -0.01, 'PAID_OFF');
  await ok(f, 'incomes', 'DELETE', { id: record(latest).id });
  await check(28000, 72000);
  await ok(f, 'incomes', 'DELETE', { id: record(first).id });
  await check(0, 100000);
});

test('préstamos: cuenta de reembolso cancelada y préstamo propio conservan su identidad', async () => {
  const f = debtFixture();
  const cancelled = f.seed('receivable', { originalAmount: '100000', status: 'CANCELLED' as const });
  const linked = f.seed('payable', { originalAmount: '140000', accountType: 'LOAN', currentBalance: '114187.61', reimbursementReceivableId: cancelled.id });
  const own = f.seed('payable', { originalAmount: '100000', accountType: 'LOAN', currentBalance: '90556.17' });
  await ok(f, 'incomes', 'POST', payment('receivable', cancelled, 53500));
  const { payables } = await ok(f, 'payables', 'GET');
  assert.equal(record(record(array(payables).find(x => record(x).id === linked.id)).reimbursementReceivable).status, 'CANCELLED');
  assert.equal(record(record(array(payables).find(x => record(x).id === linked.id)).reimbursementReceivable).pendingBalance, 46500);
  assert.equal(record(array(payables).find(x => record(x).id === own.id)).reimbursementReceivable, null);
  assert.equal(record(array(payables).find(x => record(x).id === own.id)).pendingBalance, 90556.17);
});
async function ok(f: ReturnType<typeof debtFixture>, route: string, method: import('./helpers/financial-fixtures').TestMethod, body?: Record<string, unknown>) {
  const response = await f.call(route, method, body);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body;
}

for (const [kind, route, accounts, key, model] of configs) {
  test(`${kind}: editar abono o principal reabre/liquida y borrar actualiza saldo y grupo`, async () => {
    const f = debtFixture(), account = f.seed(kind);
    const input = payment(kind, account, 100);
    const created = (await ok(f, route, 'POST', input))[key];
    assert.equal(present(f.state()[`${kind}Account`][0]).status, 'PAID_OFF');
    // Los formularios de edición de gastos no envían la relación: se conserva.
    const edit: Record<string, unknown> = { ...input, id: record(created).id, amount: 50 };
    if (kind === 'payable') delete branch(edit, 'payableAccountId').payableAccountId;
    await ok(f, route, 'PATCH', edit);
    const active = array((await ok(f, accounts, 'GET'))[accounts])[0];
    assert.equal(record(active).status, 'ACTIVE');
    assert.equal(record(active).pendingBalance, 50);
    assert.equal(present(f.state()[model][0])[`${kind}AccountId`], account.id);
    await ok(f, route, 'PATCH', { ...edit, amount: 100 });
    const increased = await ok(f, accounts, 'PATCH', { ...account, originalAmount: 200 });
    assert.equal(record(increased[kind]).status, 'ACTIVE');
    assert.equal(record(increased[kind]).pendingBalance, 100);
    assert.equal(present(f.state()[`${kind}Account`][0]).status, 'ACTIVE');
    const reduced = await ok(f, accounts, 'PATCH', { ...account, originalAmount: 80 });
    assert.equal(record(reduced[kind]).status, 'PAID_OFF');
    assert.equal(record(reduced[kind]).pendingBalance, -20);
    assert.equal(record(reduced[kind]).excessAmount, 20);
    await ok(f, route, 'DELETE', { id: record(created).id });
    assert.equal(present(f.state()[`${kind}Account`][0]).status, 'ACTIVE');
    assert.equal(record(array((await ok(f, accounts, 'GET'))[accounts])[0]).pendingBalance, 80);
  });

  test(`${kind}: centavos exactos, abonos concurrentes y edición simultánea del principal`, async () => {
    const f = debtFixture(), account = f.seed(kind, { originalAmount: '0.30' });
    const responses = await Promise.all([0.1, 0.2].map(amount => ok(f, route, 'POST', payment(kind, account, amount))));
    assert.equal(present(f.state()[`${kind}Account`][0]).status, 'PAID_OFF');
    const row = array((await ok(f, accounts, 'GET'))[accounts])[0];
    assert.equal(record(row).pendingBalance, 0);
    assert.equal(record(row).paidAmount, 0.3);
    await Promise.all([
      ok(f, route, 'PATCH', { ...payment(kind, account, 0.19), id: record(present(responses[1])[key]).id }),
      ok(f, accounts, 'PATCH', { ...account, originalAmount: 0.29 }),
    ]);
    assert.equal(present(f.state()[`${kind}Account`][0]).status, 'PAID_OFF');
    await ok(f, accounts, 'PATCH', { ...account, originalAmount: 0.30 });
    assert.equal(present(f.state()[`${kind}Account`][0]).status, 'ACTIVE');
    assert.equal(record(array((await ok(f, accounts, 'GET'))[accounts])[0]).pendingBalance, 0.01);
  });

  test(`${kind}: CANCELLED se conserva al crear, editar, borrar abonos y cambiar principal`, async () => {
    const f = debtFixture(), account = f.seed(kind, { status: 'CANCELLED' as const });
    const input = payment(kind, account, 150);
    const created = (await ok(f, route, 'POST', input))[key];
    assert.equal(present(f.state()[`${kind}Account`][0]).status, 'CANCELLED');
    await ok(f, route, 'PATCH', { ...input, id: record(created).id, amount: 50 });
    assert.equal(present(f.state()[`${kind}Account`][0]).status, 'CANCELLED');
    assert.equal(record((await ok(f, accounts, 'PATCH', { ...account, originalAmount: 20 }))[kind]).status, 'CANCELLED');
    await ok(f, route, 'DELETE', { id: record(created).id });
    assert.equal(present(f.state()[`${kind}Account`][0]).status, 'CANCELLED');
  });

  test(`${kind}: fallo del estado revierte alta, edición, borrado y cambio del principal`, async () => {
    const f = debtFixture(), account = f.seed(kind);
    const input = payment(kind, account, 100);
    f.fail(true);
    const empty = f.state();
    assert.equal((await f.call(route, 'POST', input)).status, 500);
    assert.deepEqual(f.state(), empty);
    f.fail(false);
    const created = (await ok(f, route, 'POST', input))[key];
    const before = f.state();
    f.fail(true);
    for (const [r, method, body] of [
      [route, 'PATCH', { ...input, id: record(created).id, amount: 50 }],
      [route, 'DELETE', { id: record(created).id }],
      [accounts, 'PATCH', { ...account, originalAmount: 200 }],
    ] as const) {
      assert.equal((await f.call(r, method, body)).status, 500);
      assert.deepEqual(f.state(), before);
    }
    f.fail(false);
    await ok(f, route, 'PATCH', { ...input, id: record(created).id, amount: 50 });
    assert.equal(present(f.state()[`${kind}Account`][0]).status, 'ACTIVE');
  });
}

test('ingresos: dos traslados simultáneos recalculan origen y destino; desvincular reabre', async () => {
  const f = debtFixture(), first = f.seed('receivable'), second = f.seed('receivable'), third = f.seed('receivable');
  const input = payment('receivable', first, 100);
  const { income } = await ok(f, 'incomes', 'POST', input);
  await Promise.all([second, third].map(account => ok(f, 'incomes', 'PATCH', { ...input, id: record(income).id, receivableAccountId: account.id })));
  const finalAccount = present(f.state().income[0]).receivableAccountId;
  for (const row of f.state().receivableAccount) assert.equal(row.status, row.id === finalAccount ? 'PAID_OFF' : 'ACTIVE');
  await ok(f, 'incomes', 'PATCH', { ...input, id: record(income).id, receivableAccountId: null });
  assert.ok(f.state().receivableAccount.every(row => row.status === 'ACTIVE'));
});

test('cálculo compartido redondea cada partida histórica y conserva cancelaciones y excedentes', () => {
  const result = getDebtAccountState({ originalAmount: '0.22', status: 'ACTIVE' as const }, [{ amount: '0.105' }, { amount: '0.105' }]);
  assert.equal(result.paidAmount, 0.22);
  assert.equal(result.pendingBalance, 0);
  assert.equal(result.status, 'PAID_OFF');
  assert.equal(getDebtAccountState({ originalAmount: 1, status: 'CANCELLED' as const }, [{ amount: 2 }]).status, 'CANCELLED');
});
