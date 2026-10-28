import { sourceLoader } from '../helpers/load-source';
import { debtFixture } from '../helpers/debt-fixture';
import { branch, sparseCalculations, uncheckedFixture } from '../helpers/financial-fixtures';
import { routeContext } from '../helpers/legacy-route-context';
const load = sourceLoader();
const payments = load('src/lib/calculations/cardCyclePayments.ts');
const state: number | null = payments.getCyclePaymentAmounts({ statementAmount: '0.00' }).pendingAmount;
void state;
// @ts-expect-error Los importes reales no admiten booleanos.
payments.getCyclePaymentAmounts({ statementAmount: true });
// @ts-expect-error El módulo real no exporta un cálculo inventado.
export type Invented = typeof payments.invented;
const partial = sparseCalculations(payments);
// @ts-expect-error Las proyecciones parciales siguen comprobando los escalares.
partial.getCyclePaymentAmounts({ statementAmount: true });
// @ts-expect-error El retorno sigue siendo el resultado real, no un número.
const total: number = partial.getCyclePaymentAmounts({ statementAmount: 0 });
void total;
const fixture = debtFixture();
// @ts-expect-error El fixture tiene una lista cerrada de tipos de cuenta.
fixture.seed('credit');
// @ts-expect-error Solo se admiten los cuatro métodos HTTP ejercitados.
fixture.call('expenses', 'PUT', {});
// @ts-expect-error Los registros del simulador conservan importes monetarios.
fixture.seed('payable', { amount: true });
// @ts-expect-error Los helpers privados están limitados a sus rutas conocidas.
routeContext('cards');
const dashboard = routeContext('dashboard');
void dashboard;
// @ts-expect-error formatPurchase pertenece únicamente al contexto de MSI.
export type Unexposed = typeof dashboard.formatPurchase;
const injected = uncheckedFixture(payments.getCyclePaymentAmounts, { statementAmount: {} });
// @ts-expect-error La inyección inválida conserva el contrato real del resultado.
const injectedNumber: number = injected;
void injectedNumber;
declare const variant: { amount: number } | { count: number };
const amount: number = branch(variant, 'amount').amount;
void amount;
// @ts-expect-error Una discriminación no puede inventar propiedades de la unión.
branch(variant, 'invented');
// @ts-expect-error Las fechas del módulo real exigen desplazamientos numéricos.
load('src/lib/money/dates.ts').addDays('2026-10-28', false);
import { auditHistory } from '../../scripts/audit-migration-history.cjs';
import { createStatements } from '../../scripts/android-assetlinks.cjs';
import { configure } from '../../scripts/configure-capture-bank-fallback-cron.cjs';
declare const db: import('@prisma/client').PrismaClient;
// @ts-expect-error El estado leído del historial es booleano, no texto.
auditHistory([{ migration_name: 'fixture', checksum: 'fixture', finished: 'yes', rolled_back: false }]);
// @ts-expect-error La factory de Digital Asset Links exige una huella textual.
createStatements(false);
// @ts-expect-error El configurador externo exige un secreto textual.
configure(db, 'https://example.test', 42);

import { faultingTransactions } from '../helpers/financial-persistence';
// @ts-expect-error El interceptor declara únicamente las transacciones por callback que ejercita.
faultingTransactions(db, {}).$transaction([]);
// @ts-expect-error El fixture conserva los estados de cuenta definidos en Prisma.
fixture.seed('payable', { status: 'UNKNOWN' });

const tracking = sparseCalculations(load('src/lib/cardBalanceTracking.ts'));
// @ts-expect-error El adaptador de cálculos no permite inyectar un Prisma parcial.
tracking.runBalanceSnapshot({}, async () => 1);
