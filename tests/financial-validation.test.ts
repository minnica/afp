import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { calendarDaySchema, moneyInputSchema } from '../src/lib/financialValidation';
import { dynamicRoute, financialLoader, fixedDate, plain, testReply } from './helpers/financial-fixtures';
import { record } from './helpers/dynamic-values';
import { fixtureDatabase } from './helpers/fixture-database';

const invalidDates = ['2026-02-30', '2026-02-29', '2100-02-29', '2026-04-31', '2026-13-01', '2026-00-01', '2026-01-00', '2026-1-01', '2026-01-01T12:00:00Z', '0000-01-01', ' 2026-10-29 '];
const invalidAmounts = ['10.123', 10.123, '9999999999.991', '10000000000', 10000000000, '1e3', '0x10', '1,000', ' ', ' 10.00 ', 'NaN', 'Infinity', NaN, Infinity];
const request = (body: unknown) => ({ url: 'http://localhost/api/test', headers: new Headers({ authorization: 'Bearer test' }), json: async () => body });
const authMocks = {
  'next/server': { NextResponse: { json: testReply } },
  '@/lib/calendar/schedule': { scheduleCalendarSync() {} },
  '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) } }) },
};

test('A08: fechas reales, bisiestos y formato bancario estricto', () => {
  for (const value of invalidDates) assert.equal(calendarDaySchema.safeParse(value).success, false, value);
  for (const value of ['2024-02-29', '2000-02-29', '2026-02-28', '2026-12-31']) assert.equal(calendarDaySchema.parse(value), value);
});

test('A08: centavos y límites sin redondear, convertir ni recortar la entrada', () => {
  for (const value of invalidAmounts) assert.equal(moneyInputSchema.safeParse(value).success, false, String(value));
  for (const value of ['0', 0, '0.01', 0.1, '10.00', '9999999999.99', '-9999999999.99', 9999999999.99]) assert.equal(moneyInputSchema.parse(value), value);
});

test('A08: el contrato conserva el cuerpo original y acepta ausencias de acciones parciales', () => {
  const { readFinancialInput } = financialLoader(authMocks)('src/lib/financialContracts.ts');
  const input = { operationId: randomUUID(), concept: '  Comida  ', amount: '10.00', date: '2024-02-29', notes: '  ', extra: { version: 1 } };
  const serialized = JSON.stringify(input);
  assert.equal(JSON.stringify(readFinancialInput(input)), serialized);
  assert.equal(JSON.stringify(input), serialized);
  for (const body of [{ id: 'x', action: 'UNMARK_AS_PAID' }, { expectedDate: null, expectedMonthlyPayment: '', manualMonthlyPayment: null }, { paidAmount: 0, paidAt: '', postCutCreditAmount: 0, postCutCreditDate: null }]) {
    assert.equal(JSON.stringify(readFinancialInput(body)), JSON.stringify(body));
  }
  assert.equal(readFinancialInput({ deactivatedAt: '2026-10-29T12:00:00.000Z' }).deactivatedAt, '2026-10-29T12:00:00.000Z');
  for (const deactivatedAt of ['2026-02-30', '2026-02-30T12:00:00Z', 'invalid']) assert.throws(() => readFinancialInput({ deactivatedAt }));
  assert.throws(() => readFinancialInput({ amount: true }), { message: 'Datos no válidos.' });
  assert.throws(() => readFinancialInput({ concept: [] }), { message: 'Datos no válidos.' });
});

test('A08: todas las rutas manuales rechazan entradas inválidas antes de acceder a persistencia', async t => {
  let accesses = 0;
  const db = new Proxy({}, { get() { accesses++; throw new Error('La entrada inválida no debe acceder a BD'); } });
  const load = financialLoader({ ...authMocks, '@/lib/prisma': { prisma: db } });
  const families = [
    { route: 'expenses', methods: ['POST', 'PATCH'], dates: ['date'], amounts: ['amount', 'cashContributionAmount'], texts: ['concept'] },
    { route: 'incomes', methods: ['POST', 'PATCH'], dates: ['date'], amounts: ['amount'], texts: ['concept', 'source'] },
    { route: 'receivables', methods: ['POST', 'PATCH'], dates: ['originDate'], amounts: ['originalAmount', 'expectedMonthlyPayment'], texts: ['concept'] },
    { route: 'payables', methods: ['POST', 'PATCH'], dates: ['originDate', 'expectedDate'], amounts: ['originalAmount', 'expectedMonthlyPayment'], texts: ['concept'] },
    { route: 'installment-purchases', methods: ['POST', 'PATCH'], dates: ['purchaseDate'], amounts: ['totalAmount', 'manualMonthlyPayment'], texts: ['concept'] },
    { route: 'subscriptions', methods: ['POST', 'PATCH'], dates: ['deactivatedAt'], amounts: ['amount'], texts: ['name'] },
    { route: 'cards', methods: ['POST', 'PATCH'], dates: [], amounts: [], texts: ['name'] },
    { route: 'card-cycles', methods: ['PATCH'], dates: ['startDate', 'cutDate', 'dueDate', 'paidAt', 'postCutCreditDate'], amounts: ['statementAmount', 'paidAmount', 'postCutCreditAmount'], texts: [] },
    { route: 'subscription-charges', methods: ['POST'], dates: ['date', 'today'], amounts: ['amount'], texts: [] },
    { route: 'settings', methods: ['POST'], dates: [], amounts: [], texts: ['name'] },
  ] as const;
  for (const family of families) {
    for (const method of family.methods) await t.test(`${method} /api/${family.route}`, async () => {
      const api = dynamicRoute(load(`src/app/api/${family.route}/route.ts`));
      const cases = [
        ...family.dates.flatMap(field => invalidDates.map(value => ({ [field]: value }))),
        ...family.amounts.flatMap(field => invalidAmounts.map(value => ({ [field]: value }))),
        ...family.texts.flatMap(field => ['', ' ', '\t\n'].map(value => ({ [field]: value }))),
      ];
      for (const body of cases) {
        const result = await api[method](request({ id: 'x', ...body }));
        assert.equal(result.status, 400, `${method} ${family.route}: ${JSON.stringify(body)}`);
        assert.equal(typeof result.body.error, 'string');
      }
    });
  }
  assert.equal(accesses, 0);
});

test('A08: Mi dinero, saldos y revisión de Captura comparten los límites monetarios', () => {
  const load = financialLoader(authMocks);
  const { accountSchema } = load('src/lib/money/schema.ts');
  const { transferSchema } = load('src/lib/money/transferContracts.ts');
  const { creditBalanceSchema } = load('src/lib/cardBalances.ts');
  const { correctionSchema } = load('src/lib/captureReview.ts');
  for (const amount of invalidAmounts) {
    assert.equal(accountSchema.safeParse({ name: 'Cuenta', kind: 'CASH', openingBalance: amount, asOf: '2026-10-29', reservedAmount: 0 }).success, false);
    assert.equal(transferSchema.safeParse({ fromAccountId: 'a', toAccountId: 'b', amount, date: '2026-10-29', concept: 'Traspaso' }).success, false);
    assert.equal(creditBalanceSchema('2026-10-29').safeParse({ creditLimit: amount, usedBalance: 0, balanceAsOf: '2026-10-29' }).success, false);
    assert.equal(correctionSchema.safeParse({ cardId: 'a', date: '2026-10-29', amount: String(amount), merchant: 'Comercio', categoryId: 'b', currency: 'MXN' }).success, false);
  }
});

test('PostgreSQL A08: altas, ediciones y reintentos conservan fechas, centavos y registros', { skip: !process.env.AFP_TEST_DATABASE_URL }, async t => {
  const db = await fixtureDatabase(process.env.AFP_TEST_DATABASE_URL!);
  const owner = await db.user.create({ data: { email: `a08-${randomUUID()}@example.test` } });
  try {
    const category = await db.category.create({ data: { userId: owner.id, name: 'Categoría A08' } });
    const incomeType = await db.incomeType.create({ data: { userId: owner.id, name: 'Ingreso A08' } });
    const person = await db.person.create({ data: { userId: owner.id, name: 'Persona A08' } });
    const card = await db.card.create({ data: { userId: owner.id, name: 'Tarjeta A08', usualCutDay: 10, usualDueDay: 30 } });
    const load = financialLoader({ ...authMocks, '@/lib/prisma': { prisma: db },
      '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: owner.id } } }) } }) },
    }, { Date: fixedDate(new Date('2026-10-29T18:00:00Z')) });
    const call = (route: string, method: 'POST' | 'PATCH', body: unknown) => dynamicRoute(load(`src/app/api/${route}/route.ts`))[method](request(body));
    const families = [
      { route: 'expenses', key: 'expense', body: { date: '2024-02-29', amount: '10.01', concept: '  Gasto A08  ', paymentMethod: 'CASH', categoryId: category.id }, field: 'amount' },
      { route: 'incomes', key: 'income', body: { date: '2024-02-29', amount: '10.01', concept: '  Ingreso A08  ', source: '  Fuente  ', incomeTypeId: incomeType.id }, field: 'amount' },
      { route: 'receivables', key: 'receivable', body: { originDate: '2024-02-29', originalAmount: '10.01', concept: '  Cobro A08  ', personId: person.id, expectedMonthlyPayment: '', expectedChargeDays: [] }, field: 'originalAmount' },
      { route: 'payables', key: 'payable', body: { originDate: '2024-02-29', originalAmount: '10.01', concept: '  Deuda A08  ', personId: person.id, expectedDate: '', expectedMonthlyPayment: null }, field: 'originalAmount' },
      { route: 'installment-purchases', key: 'purchase', body: { purchaseDate: '2024-02-29', totalAmount: '10.01', concept: '  MSI A08  ', cardId: card.id, categoryId: category.id, months: 3, initialPaymentsMade: 0, manualMonthlyPayment: '' }, field: 'totalAmount' },
      { route: 'subscriptions', key: 'subscription', body: { name: '  Suscripción A08  ', amount: '10.01', paymentMethod: 'CASH', categoryId: category.id, chargeDay: 1, startMonth: 10, startYear: 2026, frequencyMonths: 1 }, field: 'amount' },
    ];
    for (const family of families) await t.test(`${family.route}: crea y edita; rechaza sin alterar lo guardado`, async () => {
      const created = await call(family.route, 'POST', family.body);
      assert.equal(created.status, 200, JSON.stringify(created.body));
      const id = record(created.body[family.key]).id;
      assert.equal(typeof id, 'string');
      const edited = await call(family.route, 'PATCH', { ...family.body, id, [family.field]: '10.02' });
      assert.equal(edited.status, 200, JSON.stringify(edited.body));
      assert.equal(Number(record(edited.body[family.key])[family.field]), 10.02);
      const dateField = ['date', 'originDate', 'purchaseDate'].find(field => field in family.body);
      if (dateField) assert.equal(record(edited.body[family.key])[dateField], '2024-02-29T12:00:00.000Z');
      const textField = 'name' in family.body ? 'name' : 'concept';
      assert.equal(String(record(edited.body[family.key])[textField]).trim(), record(edited.body[family.key])[textField]);
      const before = plain(await db.user.findUnique({ where: { id: owner.id }, include: { dailyExpenses: true, incomes: true, receivableAccounts: true, payableAccounts: true, installmentPurchases: true, subscriptions: true } }));
      const invalid = [{ [family.field]: '10.123' }, { [family.field]: '10000000000' }, { [family.field]: '-0.01' },
        { [textField]: '   ' }, ...(dateField ? [{ [dateField]: '2026-02-30' }] : [])];
      for (const method of ['POST', 'PATCH'] as const) for (const override of invalid) {
        assert.equal((await call(family.route, method, { ...family.body, id, ...override })).status, 400);
      }
      const after = plain(await db.user.findUnique({ where: { id: owner.id }, include: { dailyExpenses: true, incomes: true, receivableAccounts: true, payableAccounts: true, installmentPurchases: true, subscriptions: true } }));
      assert.deepEqual(after, before);
    });

    await t.test('gastos: fecha bisiesta, máximo monetario, trim e idempotencia sin normalizar el recibo', async () => {
      const input = { operationId: randomUUID(), date: '2024-02-29', amount: '9999999999.99', concept: '  Límite A08  ', paymentMethod: 'CASH', categoryId: category.id };
      const first = await call('expenses', 'POST', input);
      assert.equal(first.status, 200);
      assert.deepEqual((await call('expenses', 'POST', input)).body, first.body);
      assert.equal((await call('expenses', 'POST', { ...input, concept: input.concept.trim() })).status, 409);
      const expense = await db.dailyExpense.findUniqueOrThrow({ where: { id: String(record(first.body.expense).id) } });
      assert.equal(expense.date.toISOString(), '2024-02-29T12:00:00.000Z');
      assert.equal(expense.concept, 'Límite A08');
      assert.equal(expense.amount.toFixed(2), '9999999999.99');
      const before = await db.expenseOperation.count({ where: { userId: owner.id } });
      for (const override of [{ date: '2026-02-30' }, { amount: '10.123' }, { concept: '   ' }]) {
        assert.equal((await call('expenses', 'POST', { ...input, operationId: randomUUID(), ...override })).status, 400);
      }
      assert.equal(await db.expenseOperation.count({ where: { userId: owner.id } }), before);
    });

    await t.test('ciclos: fechas válidas, estado cero y ausencia de pago conservan sus contratos', async () => {
      const cycle = await db.cardCycle.create({ data: { userId: owner.id, cardId: card.id, month: 10, year: 2026, startDate: new Date('2026-09-11'), cutDate: new Date('2026-10-10'), dueDate: new Date('2026-10-30') } });
      assert.equal((await call('card-cycles', 'PATCH', { id: cycle.id, action: 'UPDATE_STATEMENT', statementAmount: '0.00' })).status, 200);
      assert.equal((await call('card-cycles', 'PATCH', { id: cycle.id, action: 'MARK_AS_PAID', paidAmount: 0, paidAt: '' })).status, 200);
      const before = plain(await db.cardCycle.findUniqueOrThrow({ where: { id: cycle.id } }));
      assert.equal(before.paidAt, null);
      assert.equal(before.paidAmount, null);
      assert.equal((await call('card-cycles', 'PATCH', { id: cycle.id, action: 'UPDATE_DATES', startDate: '2026-02-30', cutDate: '2026-10-10', dueDate: '2026-10-30' })).status, 400);
      assert.deepEqual(plain(await db.cardCycle.findUniqueOrThrow({ where: { id: cycle.id } })), before);
    });

    await t.test('conciliación de Captura: total máximo, cero y null; entrada inválida revierte la transacción', async () => {
      const { reconcileCaptureStatement } = load('src/lib/captureReconciliation.ts');
      const input = { action: 'save', cardId: card.id, startDate: '2026-10-01', endDate: '2026-10-29', notes: '', expectedUpdatedAt: null };
      for (const chargesTotal of ['10.123', '10000000000', '-0.01']) {
        await assert.rejects(() => reconcileCaptureStatement(db, owner.id, { ...input, chargesTotal }), { status: 400 });
      }
      assert.equal(await db.captureStatement.count({ where: { userId: owner.id } }), 0);
      await reconcileCaptureStatement(db, owner.id, { ...input, chargesTotal: '9999999999.99' });
      for (const chargesTotal of ['0', null]) {
        const current = await db.captureStatement.findFirstOrThrow({ where: { userId: owner.id } });
        await reconcileCaptureStatement(db, owner.id, { ...input, expectedUpdatedAt: current.updatedAt.toISOString(), chargesTotal });
        const saved = await db.captureStatement.findUniqueOrThrow({ where: { id: current.id } });
        assert.equal(saved.chargesTotal === null ? null : saved.chargesTotal.toString(), chargesTotal);
      }
    });
  } finally {
    await db.user.delete({ where: { id: owner.id } });
    await db.$disconnect();
  }
});
