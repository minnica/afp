export const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const moneyFormatter = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export function formatMoney(value) {
  return moneyFormatter.format(Number(value ?? 0));
}

export function buildCategoryComparison(byMonth, monthIndex) {
  const current = byMonth[monthIndex] || [];
  const previous = byMonth[monthIndex - 1] || [];
  const entries = new Map();
  for (const category of previous) entries.set(category.id, { id: category.id, name: category.name, previous: Number(category.total), current: 0 });
  for (const category of current) {
    const entry = entries.get(category.id) || { id: category.id, previous: 0 };
    entries.set(category.id, { ...entry, name: category.name, current: Number(category.total) });
  }
  return [...entries.values()].filter((item) => item.previous > 0 || item.current > 0)
    .sort((a, b) => b.current - a.current || b.previous - a.previous || a.name.localeCompare(b.name, "es"));
}
