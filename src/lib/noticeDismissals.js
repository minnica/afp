const dismissibleTypes = new Set([
  "CARD_PAYMENT", "CUT_CYCLE", "CUT_CYCLE_UPCOMING", "RECEIVABLE", "CASH_SUBSCRIPTION",
]);

export function getNoticeMonth(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

// El identificador distingue cada vencimiento. Un cambio del importe de un pago
// de tarjeta lo vuelve a mostrar para que una preferencia anterior no lo oculte.
export function getNoticeKey(notice) {
  if (!notice || !dismissibleTypes.has(notice.type) || typeof notice.id !== "string" || !notice.id || !notice.date) return null;
  const date = new Date(notice.date);
  if (!Number.isFinite(date.getTime())) return null;
  const type = notice.type === "CUT_CYCLE_UPCOMING" ? "CUT_CYCLE" : notice.type;
  const id = notice.id.replace(/^cut-cycle-upcoming-/, "cut-cycle-");
  const amount = type === "CARD_PAYMENT" ? Math.round(Number(notice.amount) * 100) : null;
  if (type === "CARD_PAYMENT" && !Number.isSafeInteger(amount)) return null;
  return JSON.stringify([type, id, date.toISOString().slice(0, 10), amount]);
}

export function isNoticeKey(key) {
  if (typeof key !== "string" || key.length > 600) return false;
  try {
    const parts = JSON.parse(key);
    if (!Array.isArray(parts) || parts.length !== 4) return false;
    const [type, id, date, amount] = parts;
    return dismissibleTypes.has(type) && type !== "CUT_CYCLE_UPCOMING"
      && typeof id === "string" && id.length > 0 && id.length <= 200
      && typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
      && Number.isFinite(new Date(`${date}T12:00:00Z`).getTime())
      && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date
      && (type === "CARD_PAYMENT" ? Number.isSafeInteger(amount) : amount === null);
  } catch {
    return false;
  }
}

export function partitionNotices(notices, dismissals, month) {
  const keys = new Set(dismissals.filter((entry) => entry.month === month).map((entry) => entry.noticeKey));
  const visible = [];
  const hidden = [];
  for (const notice of notices) {
    (keys.has(getNoticeKey(notice)) ? hidden : visible).push(notice);
  }
  return { visible, hidden };
}
