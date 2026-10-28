import type { Prisma } from '@prisma/client';
import assert from 'node:assert/strict';
import type { DateValue, MoneyValue } from '../../src/lib/calculations/types';
import { dynamicRoute, present, financialLoader as sourceLoader, testReply } from './financial-fixtures';

export interface DebtRow {
  id?: string; userId?: string; personId?: string; originalAmount?: MoneyValue;
  amount?: MoneyValue; status?: import('@prisma/client').PayableAccountStatus | import('@prisma/client').ReceivableAccountStatus; concept?: string; originDate?: DateValue;
  payableAccountId?: string | null; receivableAccountId?: string | null;
  reimbursementReceivableId?: string | null; cashContributionAmount?: MoneyValue;
  accountType?: import('@prisma/client').PayableAccount['accountType']; currentBalance?: MoneyValue; balanceAdjustment?: MoneyValue;
  loanPrincipalAmount?: MoneyValue; loanInterestAmount?: MoneyValue; date?: DateValue;
  paymentMethod?: import('@prisma/client').DailyExpense['paymentMethod']; categoryId?: string; incomeTypeId?: string; source?: string;
  dailyExpenses?: DebtRow[]; incomes?: DebtRow[]; reimbursementReceivable?: DebtRow | null;
  _count?: { cardCycleCredits: number }; [key: string]: unknown;
}
type Model = 'payableAccount' | 'receivableAccount' | 'dailyExpense' | 'income' | 'expenseTombstone';
type State = Record<Model, DebtRow[]>;
type Where = Pick<Prisma.DailyExpenseWhereInput, 'id' | 'userId' | 'payableAccountId'> & Pick<Prisma.IncomeWhereInput, 'receivableAccountId'>;
type Write = Partial<DebtRow>;
interface Delegate {
  upsert(args: { where: Where; create: Write; update: Write }): Promise<DebtRow | null>;
  findUnique(args: { where: Where }): Promise<DebtRow | null>;
  findFirst(args: { where: Where }): Promise<DebtRow | null>;
  findMany(args: { where?: Where }): Promise<(DebtRow | null)[]>;
  create(args: { data: Write }): Promise<DebtRow | null>;
  update(args: { where: Where; data: Write }): Promise<DebtRow | null>;
  delete(args: { where: Where }): Promise<DebtRow | undefined>;
}
type Transaction = Record<Model, Delegate> & {
  person: Reference; category: Reference; incomeType: Reference;
  cardCycleCredit: { aggregate(): Promise<{ _sum: { amount: number } }> };
  subscriptionCharge: { findUnique(): Promise<null> };
  $queryRaw?(sql: TemplateStringsArray, key: string): Promise<{ locked: number }[]>;
};
type Reference = { findFirst(args: { where: Pick<Prisma.PersonWhereUniqueInput, 'id' | 'userId'> }): Promise<{ id: string } | null> };


// Persistencia aislada con rollback. El bloqueo se adquiere por el SQL real
// del servicio; las pruebas PostgreSQL comprueban su semántica en el motor.
export function debtFixture() {
  let state: State = { payableAccount: [], receivableAccount: [], dailyExpense: [], income: [], expenseTombstone: [] };
  let tail = Promise.resolve(), sequence = 0, failure = false;
  const matches = (row: DebtRow, where: Where = {}) => Object.entries(where).every(([key, value]) => row[key] === value);
  function client(getState: () => State, transactional = false): Transaction {
    // Las claves se construyen a continuación, sin afirmar que sea PrismaClient.
    const delegates: Partial<Record<Model, Delegate>> = {};
    const hydrate = (model: Model, row: DebtRow | undefined): DebtRow | null => {
      if (!row) return null;
      const result = structuredClone(row);
      if (model === 'payableAccount') {
        result.dailyExpenses = getState().dailyExpense.filter(item => item.payableAccountId === row.id);
        result.reimbursementReceivable = hydrate('receivableAccount', getState().receivableAccount.find(item => item.id === row.reimbursementReceivableId));
      }
      if (model === 'receivableAccount') result.incomes = getState().income.filter(item => item.receivableAccountId === row.id);
      if (model === 'income') result._count = { cardCycleCredits: 0 };
      return result;
    };
    for (const model of ['payableAccount', 'receivableAccount', 'dailyExpense', 'income', 'expenseTombstone'] as const) {
      delegates[model] = {
        upsert: async ({ where, create, update }) => {
          assert.ok(transactional);
          let row = getState()[model].find(row => matches(row, where));
          if (row) Object.assign(row, update);
          else { row = { ...create }; getState()[model].push(row); }
          return hydrate(model, row);
        },
        findUnique: async ({ where }) => hydrate(model, getState()[model].find(row => matches(row, where))),
        findFirst: async ({ where }) => hydrate(model, getState()[model].find(row => matches(row, where))),
        findMany: async ({ where }) => getState()[model].filter(row => matches(row, where)).map(row => hydrate(model, row)),
        create: async ({ data }) => {
          assert.ok(transactional, 'Las escrituras deben usar la transacción');
          const row: DebtRow = { id: `movement-${++sequence}`, ...data };
          getState()[model].push(row);
          return hydrate(model, row);
        },
        update: async ({ where, data }) => {
          assert.ok(transactional);
          const row = getState()[model].find(row => matches(row, where));
          if (!row) throw Object.assign(new Error('Missing'), { code: 'P2025' });
          if (failure && Object.hasOwn(data, 'status')) throw new Error('Fallo al guardar el estado');
          Object.assign(row, data);
          return hydrate(model, row);
        },
        delete: async ({ where }) => {
          assert.ok(transactional);
          const index = getState()[model].findIndex(row => matches(row, where));
          if (index < 0) throw Object.assign(new Error('Missing'), { code: 'P2025' });
          return getState()[model].splice(index, 1)[0];
        },
      };
    }
    const reference = (model: string): Reference => ({ findFirst: async ({ where }) => where.id === `${model}-${where.userId}` ? { id: where.id } : null });
    return { payableAccount: present(delegates.payableAccount), receivableAccount: present(delegates.receivableAccount),
      dailyExpense: present(delegates.dailyExpense), income: present(delegates.income), expenseTombstone: present(delegates.expenseTombstone),
      person: reference('person'), category: reference('category'), incomeType: reference('incomeType'),
      cardCycleCredit: { aggregate: async () => ({ _sum: { amount: 0 } }) },
      subscriptionCharge: { findUnique: async () => null },
    };
  }
  const db = { ...client(() => state), $transaction: async <T>(run: (tx: Transaction) => Promise<T>, options: { isolationLevel: Prisma.TransactionIsolationLevel }) => {
    assert.equal(options.isolationLevel, 'ReadCommitted');
    let draft: State | undefined, release: (() => void) | undefined;
    const tx = client(() => { assert.ok(draft, 'Leer después de adquirir el bloqueo'); return draft; }, true);
    tx.$queryRaw = async (sql, key) => {
      assert.match(sql.join('?'), /pg_advisory_xact_lock\(hashtextextended/);
      assert.equal(key, 'afp:debt-accounts:a');
      const previous = tail;
      tail = new Promise(resolve => { release = resolve; });
      await previous;
      draft = structuredClone(state);
      return [{ locked: 1 }];
    };
    try {
      const result = await run(tx);
      state = present(draft);
      return result;
    } finally { release?.(); }
  } };
  const load = sourceLoader({
    '@/lib/prisma': { prisma: db },
    'next/server': { NextResponse: { json: testReply } },
    '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'a' } } }) } }) },
  }, { console: { error() {} } });
  const call = (route: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', body: Record<string, unknown> = {}) => dynamicRoute(load(`src/app/api/${route}/route`))[method]({
    headers: new Headers({ authorization: 'Bearer a' }), url: `http://localhost/api/${route}?id=${body.id || ''}`, json: async () => body,
  });
  const seed = (kind: 'payable' | 'receivable', values: Partial<DebtRow> = {}) => {
    const row = { id: `${kind}-${++sequence}`, userId: 'a', personId: 'person-a', originalAmount: 100, status: 'ACTIVE' as const, concept: 'Deuda', originDate: new Date('2026-10-17'), ...values };
    state[`${kind}Account`].push(row);
    return { ...row, originDate: '2026-10-17' };
  };
  return { call, seed, state: () => structuredClone(state), fail: (value: boolean) => { failure = value; } };
}

