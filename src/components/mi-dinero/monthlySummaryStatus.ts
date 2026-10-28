import type { ForecastResponse } from '@/lib/money/responses';
const cents = (value: number) => Math.round(Number(value) * 100);

export function monthlySummaryStatus(month: ForecastResponse['monthly'][number], { reserved = 0, incomplete = false } = {}) {
  const minimum = cents(month.minimum), reserve = cents(reserved);
  const change = (cents(month.closing) - cents(month.opening)) / 100;
  const minimumTone: 'destructive' | 'warning' | null = minimum <= 0 ? 'destructive' : reserve > 0 && minimum <= reserve ? 'warning' : null;
  const closingTone: 'destructive' | 'warning' | 'success' | null = cents(month.closing) <= 0 ? 'destructive' : change < 0 ? 'warning' : change > 0 ? 'success' : null;
  let status: { reason: string; variant: 'destructive' | 'warning' | 'success'; label: string };

  if (minimum < 0) {
    status = { reason: 'negative', variant: 'destructive', label: 'Saldo negativo' };
  } else if (minimum === 0) {
    status = { reason: 'zero', variant: 'destructive', label: 'Saldo en cero' };
  } else if (minimum < reserve) {
    status = { reason: 'below-reserve', variant: 'warning', label: 'Bajo tu reserva' };
  } else if (reserve > 0 && minimum === reserve) {
    status = { reason: 'reserve-limit', variant: 'warning', label: 'Reserva al límite' };
  } else if (incomplete) {
    status = { reason: 'incomplete', variant: 'warning', label: 'Datos pendientes' };
  } else if (change < 0) {
    status = { reason: 'declining', variant: 'warning', label: 'Cierre a la baja' };
  } else {
    status = { reason: 'positive', variant: 'success', label: reserve > 0 ? 'Sobre tu reserva' : 'Saldo positivo' };
  }

  return { ...status, change, minimumTone, closingTone } as const;
}
