import * as window from '../../src/lib/historyWindow';
import { record, array } from './dynamic-values';

// Los escenarios históricos de cálculo usan proyecciones incompletas. El lector
// SQL se verifica aparte contra PostgreSQL; este adaptador conserva sus filas y
// la autorización, sin hacer pasar el doble por PrismaClient.
export function historyFixtureMocks(mocks: Record<string, unknown>) {
  const dependency = mocks['@/lib/prisma'];
  if (!dependency) return mocks;
  const db = record(record(dependency).prisma);
  if (!Object.hasOwn(db, 'cardCycle') && !Object.hasOwn(db, 'dailyExpense')) return mocks;
  if (typeof db.$connect === 'function') return mocks;
  const call = async (model: string, args: object) => {
    const delegate = record(db[model]);
    const fn = delegate.findMany;
    if (typeof fn !== 'function') throw new Error(`Fixture sin ${model}.findMany`);
    return array(await Reflect.apply(fn, delegate, [args])).map(record);
  };
  if (db.cardCycle) {
    const delegate = record(db.cardCycle);
    if (!delegate.count) delegate.count = async (args: object) => (await call('cardCycle', args)).length;
  }
  if (!db.$transaction) db.$transaction = (fn: (tx: object) => unknown) => fn(db);
  if (db.income) {
    const income = record(db.income);
    if (!income.aggregate) income.aggregate = async (args: object) => ({ _sum: { amount: (await call('income', args)).reduce((sum, row) => sum + Number(row.amount || 0), 0) } });
  }
  return { ...mocks,
    '@/lib/nuHistory': { nuHistoryReferences: async () => ({ expenseIds: [], purchaseIds: [], cycleIds: [] }) },
    '@/lib/dashboardDebts': {
      dashboardReceivables: async (_db: object, userId: string) => (await call('receivableAccount', { where: { userId } })).map(account => ({ ...account,
        totalPaid: array(account.incomes || []).reduce<number>((sum, row) => sum + Number(record(row).amount || 0), 0),
      })),
      dashboardPayables: async (_db: object, userId: string) => call('payableAccount', { where: { userId, expectedDate: { not: null } } }),
    },
    '@/lib/historyWindow': { ...window,
      dashboardCycleIds: async (_db: object, userId: string) => call('cardCycle', { where: { userId }, select: { id: true } }),
      relevantPurchaseIds: async (_db: object, userId: string) => call('installmentPurchase', { where: { userId }, select: { id: true } }),
      previousCycleReferences: async () => [],
    },
    '@/lib/expenseHistory': {
      expenseHistoryQuery: (params: URLSearchParams) => ({ ...window.readPage(params), where: window.readDateRange(params) }),
      readExpenseHistory: async (_db: object, userId: string, query: { where: object; pageSize: number }, select: object) => {
        const expenses = await call('dailyExpense', { where: { userId, ...query.where }, select });
        const dates = await call('dailyExpense', { where: { userId }, select: { date: true } });
        const total = expenses.reduce((sum, row) => sum + Number(row.amount || 0), 0);
        return { expenses, total, personalTotal: total - expenses.reduce((sum, row) => sum + Number(row.cashContributionAmount || 0), 0),
          availableMonths: [...new Set(dates.flatMap(row => typeof row.date === 'string' ? [row.date.slice(0, 7)] : []))].sort().reverse(),
          totalCount: expenses.length, page: 1, pageSize: query.pageSize, pageCount: 1 };
      },
    },
  };
}
