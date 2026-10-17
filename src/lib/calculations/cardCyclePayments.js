// El estado guardado y la fecha de pago no demuestran la liquidación.
export function getCyclePaymentState(cycle, today = new Date()) {
  const hasStatement = cycle.statementAmount !== null && cycle.statementAmount !== undefined;
  const statementCents = hasStatement ? Math.round(Number(cycle.statementAmount) * 100) : null;
  const paidCents = Math.max(0, Math.round(Number(cycle.paidAmount ?? 0) * 100));
  // Solo el crédito confirmado para pagar este corte. Las bonificaciones de sus
  // cargos (cycle.credits) ya están contempladas en el estado y no se restan aquí.
  const creditCents = Math.max(0, Math.round(Number(cycle.postCutCreditAmount ?? 0) * 100));
  const dueCents = hasStatement ? Math.max(0, statementCents - creditCents) : null;
  const paymentDueAmount = hasStatement ? dueCents / 100 : null;
  const pendingAmount = hasStatement ? Math.max(0, dueCents - paidCents) / 100 : null;
  const excessAmount = hasStatement ? Math.max(0, paidCents - dueCents) / 100 : 0;
  const paymentStatus = !hasStatement ? "UNCONFIRMED"
    : dueCents === 0 ? "NO_PAYMENT_DUE"
    : pendingAmount === 0 ? "PAID"
    : paidCents > 0 ? "PARTIALLY_PAID" : "PENDING";
  const isSettled = paymentStatus === "PAID" || paymentStatus === "NO_PAYMENT_DUE";
  let displayStatus;
  if (isSettled) displayStatus = paymentStatus;
  else if (today > new Date(cycle.dueDate)) displayStatus = "OVERDUE";
  else if (paymentStatus === "PARTIALLY_PAID") displayStatus = "PARTIALLY_PAID";
  else if (today >= new Date(cycle.cutDate)) displayStatus = hasStatement ? "PAYMENT_PENDING" : "CUT";
  else displayStatus = "OPEN";

  return { paymentStatus, paymentDueAmount, pendingAmount, excessAmount, isSettled, displayStatus };
}

// Conserva el enum existente. La distinción financiera se deriva en cada lectura.
export function getStoredCycleStatus(cycle) {
  const state = getCyclePaymentState(cycle);
  if (state.isSettled) return "PAID";
  return state.displayStatus === "PARTIALLY_PAID" ? "PAYMENT_PENDING" : state.displayStatus;
}

export function parseCycleMoney(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const amount = Number(text);
  return Number.isSafeInteger(Math.round(amount * 100)) ? amount : null;
}
