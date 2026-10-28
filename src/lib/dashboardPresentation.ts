import { format } from "date-fns";
import { es } from "date-fns/locale";

export const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function formatMoney(value: unknown) {
  const numberValue = Number(value || 0);

  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(numberValue);
}

export function formatCompactDate(dateString: Date | string | null | undefined) {
  if (!dateString) return "-";

  const date = new Date(dateString);
  const dateText = format(new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12), "d MMMM", { locale: es });

  const today = new Date();

  const todayUtc = Date.UTC(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );

  const targetUtc = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );

  const diffDays = Math.round((targetUtc - todayUtc) / 86400000);

  if (diffDays === 0) return `${dateText} [Hoy]`;
  if (diffDays > 0) return `${dateText} [+${diffDays}]`;

  return `${dateText} [${diffDays}]`;
}
