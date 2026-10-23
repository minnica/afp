const assert = require('node:assert/strict');
const { test } = require('node:test');
const { sourceLoader } = require('./helpers/load-source.cjs');
const { debtFixture } = require('./helpers/debt-fixture.cjs');
const { getDebtAccountState } = sourceLoader()('src/lib/calculations/debtAccounts.js');

const payment = (kind, account, amount) => ({ date: '2026-10-17', concept: 'Abono', amount,
  ...(kind === 'payable' ? { paymentMethod: 'CASH', categoryId: 'category-a', payableAccountId: account.id }
    : { source: 'Persona', incomeTypeId: 'incomeType-a', receivableAccountId: account.id }) });
const configs = [ ['payable', 'expenses', 'payables', 'expense', 'dailyExpense'], ['receivable', 'incomes', 'receivables', 'income', 'income'] ];

test('préstamos: saldo bancario conciliado conserva capital e intereses separados, incluido cero', () => {
  const account = { originalAmount: '140000', accountType: 'LOAN', currentBalance: '114187.61', status: 'ACTIVE' };
  const payments = [{ amount: '1351.85', loanPrincipalAmount: '1063.73', loanInterestAmount: '288.12' }];
  const state = getDebtAccountState(account, payments);
  assert.equal(state.pendingBalance, 114187.61);
  assert.equal(state.paidAmount, 25812.39);
  assert.equal(state.status, 'ACTIVE');
  assert.equal(getDebtAccountState(account, [...payments, { amount: '100000' }]).pendingBalance, 114187.61);
  assert.equal(getDebtAccountState({ ...account, currentBalance: '0' }, payments).status, 'PAID_OFF');
  assert.equal(getDebtAccountState({ ...account, currentBalance: '0', status: 'CANCELLED' }, payments).status, 'CANCELLED');
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
  const payable = (await ok(f, 'payables', 'GET')).payables[0];
  assert.equal(payable.pendingBalance, 114187.61);
  assert.equal(payable.paidAmount, 25812.39);
  assert.equal(payable.reimbursementReceivableId, 'receivable-linked');
  assert.equal((await ok(f, 'receivables', 'GET')).receivables[0].pendingBalance, 72000);
});
async function ok(f, route, method, body) {
  const response = await f.call(route, method, body);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body;
}

for (const [kind, route, accounts, key, model] of configs) {
  test(`${kind}: editar abono o principal reabre/liquida y borrar actualiza saldo y grupo`, async () => {
    const f = debtFixture(), account = f.seed(kind);
    const input = payment(kind, account, 100);
    const created = (await ok(f, route, 'POST', input))[key];
    assert.equal(f.state()[`${kind}Account`][0].status, 'PAID_OFF');
    // Los formularios de edición de gastos no envían la relación: se conserva.
    const edit = { ...input, id: created.id, amount: 50 };
    if (kind === 'payable') delete edit.payableAccountId;
    await ok(f, route, 'PATCH', edit);
    const active = (await ok(f, accounts, 'GET'))[accounts][0];
    assert.equal(active.status, 'ACTIVE');
    assert.equal(active.pendingBalance, 50);
    assert.equal(f.state()[model][0][`${kind}AccountId`], account.id);
    await ok(f, route, 'PATCH', { ...edit, amount: 100 });
    const increased = await ok(f, accounts, 'PATCH', { ...account, originalAmount: 200 });
    assert.equal(increased[kind].status, 'ACTIVE');
    assert.equal(increased[kind].pendingBalance, 100);
    assert.equal(f.state()[`${kind}Account`][0].status, 'ACTIVE');
    const reduced = await ok(f, accounts, 'PATCH', { ...account, originalAmount: 80 });
    assert.equal(reduced[kind].status, 'PAID_OFF');
    assert.equal(reduced[kind].pendingBalance, -20);
    assert.equal(reduced[kind].excessAmount, 20);
    await ok(f, route, 'DELETE', { id: created.id });
    assert.equal(f.state()[`${kind}Account`][0].status, 'ACTIVE');
    assert.equal((await ok(f, accounts, 'GET'))[accounts][0].pendingBalance, 80);
  });

  test(`${kind}: centavos exactos, abonos concurrentes y edición simultánea del principal`, async () => {
    const f = debtFixture(), account = f.seed(kind, { originalAmount: '0.30' });
    const responses = await Promise.all([0.1, 0.2].map(amount => ok(f, route, 'POST', payment(kind, account, amount))));
    assert.equal(f.state()[`${kind}Account`][0].status, 'PAID_OFF');
    const row = (await ok(f, accounts, 'GET'))[accounts][0];
    assert.equal(row.pendingBalance, 0);
    assert.equal(row.paidAmount, 0.3);
    await Promise.all([
      ok(f, route, 'PATCH', { ...payment(kind, account, 0.19), id: responses[1][key].id }),
      ok(f, accounts, 'PATCH', { ...account, originalAmount: 0.29 }),
    ]);
    assert.equal(f.state()[`${kind}Account`][0].status, 'PAID_OFF');
    await ok(f, accounts, 'PATCH', { ...account, originalAmount: 0.30 });
    assert.equal(f.state()[`${kind}Account`][0].status, 'ACTIVE');
    assert.equal((await ok(f, accounts, 'GET'))[accounts][0].pendingBalance, 0.01);
  });

  test(`${kind}: CANCELLED se conserva al crear, editar, borrar abonos y cambiar principal`, async () => {
    const f = debtFixture(), account = f.seed(kind, { status: 'CANCELLED' });
    const input = payment(kind, account, 150);
    const created = (await ok(f, route, 'POST', input))[key];
    assert.equal(f.state()[`${kind}Account`][0].status, 'CANCELLED');
    await ok(f, route, 'PATCH', { ...input, id: created.id, amount: 50 });
    assert.equal(f.state()[`${kind}Account`][0].status, 'CANCELLED');
    assert.equal((await ok(f, accounts, 'PATCH', { ...account, originalAmount: 20 }))[kind].status, 'CANCELLED');
    await ok(f, route, 'DELETE', { id: created.id });
    assert.equal(f.state()[`${kind}Account`][0].status, 'CANCELLED');
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
      [route, 'PATCH', { ...input, id: created.id, amount: 50 }],
      [route, 'DELETE', { id: created.id }],
      [accounts, 'PATCH', { ...account, originalAmount: 200 }],
    ]) {
      assert.equal((await f.call(r, method, body)).status, 500);
      assert.deepEqual(f.state(), before);
    }
    f.fail(false);
    await ok(f, route, 'PATCH', { ...input, id: created.id, amount: 50 });
    assert.equal(f.state()[`${kind}Account`][0].status, 'ACTIVE');
  });
}

test('ingresos: dos traslados simultáneos recalculan origen y destino; desvincular reabre', async () => {
  const f = debtFixture(), first = f.seed('receivable'), second = f.seed('receivable'), third = f.seed('receivable');
  const input = payment('receivable', first, 100);
  const { income } = await ok(f, 'incomes', 'POST', input);
  await Promise.all([second, third].map(account => ok(f, 'incomes', 'PATCH', { ...input, id: income.id, receivableAccountId: account.id })));
  const finalAccount = f.state().income[0].receivableAccountId;
  for (const row of f.state().receivableAccount) assert.equal(row.status, row.id === finalAccount ? 'PAID_OFF' : 'ACTIVE');
  await ok(f, 'incomes', 'PATCH', { ...input, id: income.id, receivableAccountId: null });
  assert.ok(f.state().receivableAccount.every(row => row.status === 'ACTIVE'));
});

test('cálculo compartido redondea cada partida histórica y conserva cancelaciones y excedentes', () => {
  const result = getDebtAccountState({ originalAmount: '0.22', status: 'ACTIVE' }, [{ amount: '0.105' }, { amount: '0.105' }]);
  assert.equal(result.paidAmount, 0.22);
  assert.equal(result.pendingBalance, 0);
  assert.equal(result.status, 'PAID_OFF');
  assert.equal(getDebtAccountState({ originalAmount: 1, status: 'CANCELLED' }, [{ amount: 2 }]).status, 'CANCELLED');
});
