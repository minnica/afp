function dateValue(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) : null;
}

export function sortUsageByCutDate(items, direction = "asc") {
  return [...items].sort((a, b) => {
    const aDate = dateValue(a.renewBy || a.selectedCycle?.cutDate);
    const bDate = dateValue(b.renewBy || b.selectedCycle?.cutDate);
    if (aDate === null && bDate !== null) return 1;
    if (bDate === null && aDate !== null) return -1;
    return (aDate !== null && bDate !== null ? (aDate - bDate) * (direction === "desc" ? -1 : 1) : 0)
      || String(a.card?.name || "").localeCompare(String(b.card?.name || ""), "es");
  });
}

export function usageHistoryPeriod(item) {
  const cycle = item.selectedCycle;
  return cycle ? `${cycle.year}-${String(cycle.month).padStart(2, "0")}` : "";
}

export function usageHistoryOptions(items) {
  return [...new Set(items.map(usageHistoryPeriod).filter(Boolean))].sort().reverse()
    .map((value) => {
      const [year, month] = value.split("-").map(Number);
      const label = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" })
        .format(new Date(Date.UTC(year, month - 1, 1)));
      return { value, label: label.charAt(0).toUpperCase() + label.slice(1) };
    });
}

export function formatUsageCutDate(item, today, historical = false) {
  const cut = dateValue(item.selectedCycle?.cutDate);
  if (cut === null) return "Período sin registrar";
  const date = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", timeZone: "UTC" })
    .format(new Date(cut));
  if (historical) return `Corte: ${date}`;
  const localDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((cut - localDay) / 86400000);
  const timing = days === 0 ? "hoy" : days === 1 ? "mañana" : `en ${days} días`;
  return `Corte: ${date} · ${timing}`;
}
