// Un importe bancario se aplica solo al cargo mensual y corte autorizados.
// No cambia la tarifa de la suscripción ni reinterpreta evidencia histórica.
export function getSubscriptionStatementAmount(subscription, cycle, chargeDate) {
  const scheduledAmount = Number(subscription.amount || 0);
  const evidence = cycle.usageReconciliation;
  if (!evidence || evidence.version !== 1 || !evidence.source ||
      !/^[a-f0-9]{64}$/.test(evidence.sourceSha256 || "")) return scheduledAmount;
  const validDay = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if (!validDay(evidence.startDate) || !validDay(evidence.cutDate) ||
      evidence.startDate > evidence.cutDate ||
      Number(evidence.cutDate.slice(0, 4)) !== cycle.year ||
      Number(evidence.cutDate.slice(5, 7)) !== cycle.month ||
      subscription.cardId !== cycle.cardId) return scheduledAmount;
  const scheduledDate = new Date(chargeDate);
  if (!Number.isFinite(scheduledDate.getTime())) return scheduledAmount;
  const month = scheduledDate.toISOString().slice(0, 7);
  const receipts = (Array.isArray(evidence.subscriptionCharges) ? evidence.subscriptionCharges : [])
    .filter((receipt) => receipt && receipt.subscriptionId === subscription.id &&
      validDay(receipt.date) && receipt.date.slice(0, 7) === month);
  // Si hay varios cargos del mismo mes, se requiere conciliarlos individualmente.
  if (receipts.length !== 1) return scheduledAmount;
  const receipt = receipts[0];
  if (receipt.applyToCycleAmount !== true || receipt.date < evidence.startDate ||
      receipt.date > evidence.cutDate ||
      !["number", "string"].includes(typeof receipt.amount) ||
      !/^\d+(?:\.\d{1,2})?$/.test(String(receipt.amount))) return scheduledAmount;
  const amount = Number(receipt.amount);
  return Number.isFinite(amount) && amount > 0 ? amount : scheduledAmount;
}
