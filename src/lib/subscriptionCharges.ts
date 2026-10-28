import { usageEvidence } from './calculations/usageEvidence';
import type { FinancialSubscription, StatementCycle } from './calculations/types';
// Días bancarios YYYY-MM-DD; el día actual se calcula en la zona del usuario.
export function validChargeDay(day: unknown): day is string {
  return typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day)
    && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day;
}

export function validChargeMonth(month: unknown): month is string {
  return typeof month === "string" && /^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(month);
}

export function subscriptionChargeDate(subscription: FinancialSubscription, month: string) {
  if (!validChargeMonth(month)) return null;
  const [year, number] = month.split("-").map(Number) as [number, number];
  const frequency = Number(subscription.frequencyMonths || 1);
  const offset = year * 12 + number - (Number(subscription.startYear || year) * 12 + Number(subscription.startMonth || number));
  if (!Number.isInteger(frequency) || frequency < 1 || offset < 0 || offset % frequency) return null;
  const day = Number(subscription.chargeDay);
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  const date = `${month}-${String(Math.min(day, new Date(Date.UTC(year, number, 0)).getUTCDate())).padStart(2, "0")}`;
  if (!subscription.isActive && (!subscription.deactivatedAt || date > new Date(subscription.deactivatedAt).toISOString().slice(0, 10))) return null;
  return date;
}

export function isSubscriptionChargeResolved(subscription: Pick<FinancialSubscription, "charges">, month: string) {
  return (subscription.charges || []).some(charge => charge.month === month
    && (charge.status === "SKIPPED" || (charge.status === "CONFIRMED" && charge.expenseId)));
}

export function getSubscriptionReceipts(subscription: FinancialSubscription, month: string, cycles: StatementCycle[] = []) {
  return cycles.flatMap(cycle => {
    const evidence = usageEvidence(cycle.usageReconciliation);
    if (cycle.cardId !== subscription.cardId || !evidence || evidence.version !== 1
      || typeof evidence.source !== "string" || !evidence.source.trim() || !/^[a-f0-9]{64}$/.test(evidence.sourceSha256 || "")
      || !validChargeDay(evidence.startDate) || !validChargeDay(evidence.cutDate) || evidence.startDate > evidence.cutDate
      || Number(evidence.cutDate.slice(0, 4)) !== cycle.year || Number(evidence.cutDate.slice(5, 7)) !== cycle.month) return [];
    return (Array.isArray(evidence.subscriptionCharges) ? evidence.subscriptionCharges : [])
      .filter(receipt => receipt?.subscriptionId === subscription.id && validChargeDay(receipt.date)
        && receipt.date.startsWith(month) && receipt.date >= evidence.startDate && receipt.date <= evidence.cutDate
        && ["string", "number"].includes(typeof receipt.amount) && /^\d+(?:\.\d{1,2})?$/.test(String(receipt.amount)) && Number(receipt.amount) > 0)
      .map(receipt => ({ ...receipt, amount: Number(receipt.amount), source: evidence.source }));
  });
}

export function buildSubscriptionCharges({ subscriptions, month, today, cycles = [] }: { subscriptions: FinancialSubscription[]; month: string; today: string; cycles?: StatementCycle[] }) {
  if (!validChargeMonth(month) || !validChargeDay(today)) return [];
  return subscriptions.flatMap(subscription => {
    const date = subscriptionChargeDate(subscription, month);
    const decision = (subscription.charges || []).find(charge => charge.month === month);
    const expenses = (subscription.dailyExpenses || []).filter(expense =>
      expense.id === decision?.expenseId || (expense.subscriptionCharge ? expense.subscriptionCharge.month === month
        : new Date(expense.date).toISOString().startsWith(month)));
    const receipts = getSubscriptionReceipts(subscription, month, cycles);
    if ((!date || date > today) && !decision && !expenses.length && !receipts.length) return [];
    const status = expenses.length || decision?.expenseId ? "CONFIRMED" : receipts.length ? "VERIFIED"
      : decision?.status === "SKIPPED" ? "SKIPPED" : "PENDING";
    if (!date && status === "PENDING") return [];
    return [{
      id: `${subscription.id}:${month}`, subscriptionId: subscription.id, month,
      name: subscription.name, date: date || `${month}-01`, amount: Number(subscription.amount),
      paymentMethod: subscription.paymentMethod, cardId: subscription.cardId, cardName: subscription.card?.name || null,
      categoryName: subscription.category?.name || null, status,
      confirmedAmount: expenses.length ? expenses.reduce((sum, expense) => sum + Math.round(Number(expense.amount) * 100), 0) / 100
        : receipts.length ? receipts.reduce((sum, receipt) => sum + Math.round(receipt.amount * 100), 0) / 100 : null,
      confirmedPaymentMethod: expenses.length === 1 ? expenses[0]!.paymentMethod ?? null : null,
      confirmedCardName: expenses.length === 1 ? expenses[0]!.card?.name || null : null,
      expenseId: expenses[0]?.id || decision?.expenseId || null,
    }];
  }).sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, "es"));
}
