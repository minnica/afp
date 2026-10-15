/** Usa el estado de cuenta desde el día de corte; antes, conserva la estimación. */
export function getDashboardPayment(cycle, today) {
  const cutDate = new Date(cycle.cutDate ?? NaN);
  const cutDay = Date.UTC(cutDate.getUTCFullYear(), cutDate.getUTCMonth(), cutDate.getUTCDate());
  const localDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const isStatement = localDay >= cutDay && cycle.statementAmount != null;
  const amount = Number((isStatement ? cycle.statementAmount : cycle.calculatedAmount) ?? 0);

  return { amount: Math.round(amount * 100) / 100, isStatement };
}

export function formatPaymentDeadline(dateString, today, { includePreposition = false, includeDate = true } = {}) {
  if (!dateString) return "-";
  const date = new Date(dateString);
  if (!Number.isFinite(date.getTime())) return "-";

  const targetDay = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const localDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((targetDay - localDay) / 86400000);
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
