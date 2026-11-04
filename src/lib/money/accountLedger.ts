import { accountBalanceEffects, amount, cents, type BalanceReference } from './balance';
import { day } from './dates';
import type { MoneyEvent } from './types';

const kindLabels: Record<string, string> = {
  INCOME: 'Ingreso', COLLECTION: 'Cobro recibido', EXPENSE: 'Gasto',
  CONTRIBUTION: 'Aportación recibida', CARD_PAYMENT: 'Pago de tarjeta',
  TRANSFER: 'Transferencia', WITHDRAWAL: 'Retiro', AUTO_YIELD: 'Rendimiento',
  ADJUSTMENT: 'Ajuste de referencia',
};
const sourceLabels: Record<string, string> = { '/ingresos': 'Ingresos', '/gastos': 'Gastos', '/tarjetas': 'Tarjetas' };

export type AccountLedgerEntry = {
  key: string; date: string; label: string; kind: string; kindLabel: string;
  cents: number; amount: number; balance: number; adjustment: boolean;
  certainty: 'REGISTERED' | 'CALCULATED' | 'ESTIMATED';
  description: string | null; source: { href: string; label: string } | null;
};

export function buildAccountLedger(account: BalanceReference, events: readonly MoneyEvent[], today: string) {
  const referenceDate = day(account.asOf), openingCents = cents(account.openingBalance);
  const entries: AccountLedgerEntry[] = [];
  for (const effect of accountBalanceEffects(account, events, today)) {
    if (!effect.baselineCents && !effect.coveredCents && effect.events.length) {
      for (const event of effect.events) {
        if (!event.cents || !event.date) continue;
        const sourceLabel = event.route ? sourceLabels[event.route] : undefined;
        entries.push({
          key: event.key, date: event.date, label: event.label, kind: event.kind,
          kindLabel: kindLabels[event.kind] || 'Movimiento', cents: event.cents,
          amount: amount(event.cents), balance: 0, adjustment: false,
          certainty: event.automaticYield ? 'CALCULATED' : event.estimatedIncome ? 'ESTIMATED' : 'REGISTERED',
          description: event.approximateDate ? 'Fecha aproximada del último abono; el detalle histórico está incompleto.' : null,
          source: event.route && sourceLabel ? { href: event.route, label: sourceLabel } : null,
        });
      }
    } else {
      // A reference stores aggregate effects, not the old bank statement or
      // the time a record was edited. Explain the net adjustment explicitly;
      // do not invent a new deposit/expense or a bank operation date.
      entries.push({
        key: `reference-change:${effect.key}`, date: referenceDate,
        label: effect.events.length === 1 ? `Ajuste · ${effect.events[0]!.label}` : effect.key.startsWith('card-flow:') ? 'Ajuste en pagos de tarjeta incluidos' : 'Cambio en un movimiento incluido',
        kind: 'ADJUSTMENT', kindLabel: kindLabels.ADJUSTMENT!,
        cents: effect.cents, amount: amount(effect.cents), balance: 0, adjustment: true,
        certainty: effect.events.some(event => event.estimatedIncome) ? 'ESTIMATED' : effect.events.some(event => event.automaticYield) ? 'CALCULATED' : 'REGISTERED', source: null,
        description: 'Cambio neto de un registro modificado, eliminado o reasignado respecto al saldo de referencia. No representa una nueva operación bancaria; su fecha de cambio no está disponible.',
      });
    }
  }
  entries.sort((a, b) => a.date.localeCompare(b.date) || Number(b.adjustment) - Number(a.adjustment) || a.key.localeCompare(b.key));
  let running = openingCents, incoming = 0, outgoing = 0, adjustments = 0, calculated = 0, estimated = 0;
  for (const entry of entries) {
    running += entry.cents; entry.balance = amount(running);
    if (entry.adjustment) adjustments += entry.cents;
    else if (entry.cents > 0) incoming += entry.cents;
    else outgoing -= entry.cents;
    if (entry.certainty === 'CALCULATED') calculated += entry.cents;
    if (entry.certainty === 'ESTIMATED') estimated += entry.cents;
  }
  return {
    referenceDate, today, openingBalance: amount(openingCents), balance: amount(running),
    incoming: amount(incoming), outgoing: amount(outgoing), adjustments: amount(adjustments),
    calculated: amount(calculated), estimated: amount(estimated),
    entries: entries.reverse(), months: [...new Set(entries.map(e => e.date.slice(0, 7)))].sort().reverse(),
  };
}

function normalize(value: string) { return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es-MX').trim(); }
export function filterAccountLedger(entries: readonly AccountLedgerEntry[], query = '', period = 'ALL') {
  const search = normalize(query);
  // Filtering never recalculates balances: every row retains the account's
  // complete daily order, including movements hidden by the current search.
  return entries.filter(entry => (period === 'ALL' || entry.date.startsWith(period)) && (!search || normalize(`${entry.label} ${entry.kindLabel}`).includes(search)));
}
