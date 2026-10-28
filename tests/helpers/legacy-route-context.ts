import { sourceLoader as rawLoader } from './load-source';
// Adaptación de pruebas históricas: dependencias reales, adaptadores explícitos.
// Solo expone los helpers privados que ya comprobaban esos escenarios.
import type { FinancialCycle, FinancialExpense, FinancialPurchase, FinancialSubscription } from '../../src/lib/calculations/types';
import type { FinancialResponse } from '../../src/lib/financialResponses';
import { record } from './dynamic-values';
import { sparseCalculations, type Sparse, type SparseModule } from './financial-fixtures';

type RealHelpers = typeof import('../../src/lib/sharedExpenses') & typeof import('../../src/lib/subscriptionCharges') & typeof import('../../src/lib/importantNotices') & typeof import('../../src/lib/calculations/installmentStatements') & typeof import('../../src/lib/calculations/cardCredits') & typeof import('../../src/lib/calculations/subscriptionStatements') & typeof import('../../src/lib/calculations/cardCycles') & typeof import('../../src/lib/calculations/cardCyclePayments') & typeof import('../../src/lib/calculations/cycleDataQuality') & typeof import('../../src/lib/calculations/cardUsageWaivers');
type Helpers = Omit<SparseModule<RealHelpers>, 'getPurchaseCycleNumber' | 'shouldIncludePurchaseInCycle'> & {
  getPurchaseCycleNumber(purchase: Sparse<FinancialPurchase>, cycle: Sparse<FinancialCycle>, historic?: number | Record<string, number>): number | null;
  shouldIncludePurchaseInCycle(purchase: Sparse<FinancialPurchase>, cycle: Sparse<FinancialCycle>, historic?: number | Record<string, number>): boolean;
};
type Route<G extends Globals> = { [M in import('./financial-fixtures').TestMethod]: (request: import('./financial-fixtures').TestRequest) => Promise<G extends { NextResponse: { json: (...args: never[]) => infer R } } ? R : unknown> };
type RouteName = 'dashboard' | 'card-cycles' | 'installment-purchases' | 'incomes';
type Globals = { prisma?: object; NextResponse?: { json(body: Record<string, unknown>, init?: ResponseInit): unknown }; requireApiUser?: () => Promise<{ id: string }>; apiAccessErrorResponse?: () => null; requireOwnedReferences?: () => Promise<void>; URL?: typeof URL; console?: Console };
type WeeklyArgs = { expenses: Sparse<FinancialExpense>[]; subscriptions?: Sparse<FinancialSubscription>[]; purchases?: Sparse<FinancialPurchase>[]; cycles?: Sparse<FinancialCycle>[]; currentYear: number; currentMonth: number; categoryId?: string | null };
interface DashboardPrivate {
  buildWeeklyComparison(args: WeeklyArgs): FinancialResponse<'dashboard'>['weeklyComparisonByMonth'][string];
  buildCategoryBreakdown(args: { categories: { id: string; name?: string }[]; expenses: Sparse<FinancialExpense>[]; subscriptions: Sparse<FinancialSubscription>[]; purchases: Sparse<FinancialPurchase>[]; cycles?: Sparse<FinancialCycle>[]; year: number; month: number }): FinancialResponse<'dashboard'>['categoryBreakdownCurrent'];
  buildCardMonthlyComparison(args: { cyclesWithAmounts: Sparse<FinancialCycle & { calculatedAmount: number; cashContributionsAmount: number }>[]; cards: { id: string; name?: string }[]; currentYear: number; currentMonth: number }): FinancialResponse<'dashboard'>['cardMonthlyComparisonByMonth'][string];
  shouldIncludePurchaseInMonth(purchase: Sparse<FinancialPurchase>, year: number, month: number): boolean;
  isSubscriptionChargeableInMonth(subscription: Sparse<FinancialSubscription>, year: number, month: number): boolean;
  getMonthlySubscriptions(subscriptions: Sparse<FinancialSubscription>[], expenses: Sparse<FinancialExpense>[], cycles: Sparse<FinancialCycle>[], year: number, month: number): Sparse<FinancialSubscription>[];
}
interface PurchasePrivate { formatPurchase(purchase: Sparse<FinancialPurchase>): Sparse<FinancialPurchase> & { currentMonth: number; remainingMonths: number; monthlyPaymentUsed: number; remainingBalance: number; verifiedStatementDate: string | null } }

export function routeContext<G extends Globals = Globals>(route: 'dashboard', globals?: G): Helpers & Route<G> & DashboardPrivate;
export function routeContext<G extends Globals = Globals>(route: 'installment-purchases', globals?: G): Helpers & Route<G> & PurchasePrivate;
export function routeContext<G extends Globals = Globals>(route: RouteName, globals?: G): Helpers & Route<G>;

export function routeContext(route: RouteName, globals: Globals = {}): unknown {
  const mocks: Record<string, unknown> = {
    '@/lib/prisma': { prisma: globals.prisma || {} },
    '@/lib/apiAuth': {
      apiResponse: globals.NextResponse || { json: (body: unknown) => body },
      requireApiUser: globals.requireApiUser || (async () => ({ id: 'u' })),
      apiAccessErrorResponse: globals.apiAccessErrorResponse || (() => null),
      requireOwnedReferences: globals.requireOwnedReferences || (async () => {}),
      ApiAccessError: class extends Error {},
    },
  };
  const load = rawLoader(mocks);
  const sourceLoaderForPrivate = load;
  const helpers = sparseCalculations({
    ...load('src/lib/sharedExpenses.ts'),
    ...load('src/lib/subscriptionCharges.ts'),
    ...load('src/lib/importantNotices.ts'),
    ...load('src/lib/calculations/installmentStatements.ts'),
    ...load('src/lib/calculations/cardCredits.ts'),
    ...load('src/lib/calculations/subscriptionStatements.ts'),
    ...load('src/lib/calculations/cardCycles.ts'),
    ...load('src/lib/calculations/cardCyclePayments.ts'),
    ...load('src/lib/calculations/cycleDataQuality.ts'),
    ...load('src/lib/calculations/cardUsageWaivers.ts'),
  });
  const exposed = route === 'dashboard' ? [
    'buildWeeklyComparison', 'buildCategoryBreakdown', 'buildCardMonthlyComparison',
    'shouldIncludePurchaseInMonth', 'isSubscriptionChargeableInMonth', 'getMonthlySubscriptions',
  ] : route === 'installment-purchases' ? ['formatPurchase'] : [];
  const exports = record(sourceLoaderForPrivate(`src/app/api/${route}/route`, exposed));
  for (const name of exposed) if (typeof exports[name] !== 'function') throw new Error(`Export privado inválido: ${route}#${name}`);
  // Lista cerrada por ruta. vm no permite demostrar la firma privada: se
  // concentra aquí la conversión y los escenarios verifican su comportamiento.
  const privateHelpers = exports as Partial<DashboardPrivate & PurchasePrivate>;
  return { ...helpers, ...exports, ...privateHelpers };
}

