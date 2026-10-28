// Adaptación de pruebas históricas: dependencias reales, adaptadores explícitos.
// Solo expone los helpers privados que ya comprobaban esos escenarios.
const { sourceLoader } = require('./load-source.cjs');
function routeContext(route, globals = {}) {
  const load = sourceLoader({
    '@/lib/prisma': { prisma: globals.prisma || {} },
    '@/lib/apiAuth': {
      apiResponse: globals.NextResponse || { json: body => body },
      requireApiUser: globals.requireApiUser || (async () => ({ id: 'u' })),
      apiAccessErrorResponse: globals.apiAccessErrorResponse || (() => null),
      requireOwnedReferences: globals.requireOwnedReferences || (async () => {}),
      ApiAccessError: class extends Error {},
    },
  });
  const helpers = Object.assign({}, ...[
    'sharedExpenses', 'subscriptionCharges', 'importantNotices',
    'calculations/installmentStatements', 'calculations/cardCredits',
    'calculations/subscriptionStatements', 'calculations/cardCycles',
    'calculations/cardCyclePayments', 'calculations/cycleDataQuality',
    'calculations/cardUsageWaivers',
  ].map(name => load(`src/lib/${name}.js`)));
  const exposed = route === 'dashboard' ? [
    'buildWeeklyComparison', 'buildCategoryBreakdown', 'buildCardMonthlyComparison',
    'shouldIncludePurchaseInMonth', 'isSubscriptionChargeableInMonth', 'getMonthlySubscriptions',
  ] : route === 'installment-purchases' ? ['formatPurchase'] : [];
  return { ...helpers, ...load(`src/app/api/${route}/route.js`, exposed) };
}
module.exports = { routeContext };
