import type { DateValue, MoneyValue } from './calculations/types';
import { bankDay, daysUntilBankDate, mexicoDayNumber } from './financialDates';
/** Usa el estado de cuenta desde el día de corte; antes, conserva la estimación. */
export function getDashboardPayment(cycle: { cutDate?: DateValue; statementAmount?: MoneyValue; postCutCreditAmount?: MoneyValue; calculatedAmount?: MoneyValue }, today: Date) {
  const cutDay = bankDay(cycle.cutDate ?? new Date(NaN));
  const localDay = mexicoDayNumber(today);
  const isStatement = localDay >= cutDay && cycle.statementAmount != null;
  // El total del período descuenta devoluciones confirmadas, pero no los pagos.
  const amount = isStatement
    ? Math.max(0, Math.round(Number(cycle.statementAmount) * 100) - Math.round(Number(cycle.postCutCreditAmount ?? 0) * 100)) / 100
    : Number(cycle.calculatedAmount ?? 0);

  return { amount: Math.round(amount * 100) / 100, isStatement };
}

export function formatPaymentDeadline(dateString: DateValue | null | undefined, today: Date, { includePreposition = false, includeDate = true } = {}) {
  if (!dateString) return "-";
  const date = new Date(dateString);
  if (!Number.isFinite(date.getTime())) return "-";

  const days = daysUntilBankDate(date, today);
  let timing;
  if (days === 0) timing = "Es hoy";
  else if (days === 1) timing = "Es mañana";
  else if (days === -1) timing = "Fue ayer";
  else if (days > 1) timing = `Es en ${days} días`;
  else timing = `Fue hace ${Math.abs(days)} días`;

  if (!includeDate) return timing;
  const month = new Intl.DateTimeFormat("es-MX", { month: "long", timeZone: "UTC" }).format(date);
  const dateLabel = `${date.getUTCDate()}${includePreposition ? " de " : " "}${month}`;
  return `${timing} [${dateLabel}]`;
}
