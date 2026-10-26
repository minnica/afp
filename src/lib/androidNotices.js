import { createHash } from "node:crypto";
import { ApiAccessError } from "@/lib/apiAuth";
import { calculateCycleAmount } from "@/lib/calculations/cardCycles";
import { getCyclePaymentState } from "@/lib/calculations/cardCyclePayments";
import { cycleCreditSelect } from "@/lib/calculations/cardCredits";
import { getDebtAccountState } from "@/lib/calculations/debtAccounts";
import { buildDashboardPayments, buildImportantNotices } from "@/lib/importantNotices";
import { getNoticeKey, getNoticeMonth, partitionNotices } from "@/lib/noticeDismissals";

const noticePaths = {
  CARD_PAYMENT: "/tarjetas", CUT_CYCLE: "/tarjetas", CUT_CYCLE_UPCOMING: "/tarjetas",
  CASH_SUBSCRIPTION: "/gastos", RECEIVABLE: "/ingresos", PAYABLE: "/gastos",
};

export function noticeLocalDate(timeZone = "America/Mexico_City", now = new Date()) {
  if (typeof timeZone !== "string" || timeZone.length > 100) throw new ApiAccessError("Zona horaria no válida.", 400);
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return new Date(Number(value.year), Number(value.month) - 1, Number(value.day), 12);
  } catch {
    throw new ApiAccessError("Zona horaria no válida.", 400);
  }
}

// Solo devuelve avisos; nunca expone al teléfono los registros que los originan.
export async function loadAndroidNotices(db, userId, now) {
  const month = getNoticeMonth(now);
  const where = { userId };
  const [cards, cycles, expenses, subscriptions, purchases, receivables, dismissals, payables] = await Promise.all([
    db.card.findMany({ where, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.cardCycle.findMany({ where, include: { credits: { select: cycleCreditSelect }, card: true }, orderBy: [{ year: "asc" }, { month: "asc" }] }),
    db.dailyExpense.findMany({ where, include: { subscriptionCharge: { select: { month: true } } } }),
    db.subscription.findMany({ where, include: { charges: { select: { month: true, status: true, expenseId: true } },
      dailyExpenses: { select: { id: true, date: true, subscriptionCharge: { select: { month: true } } } } } }),
    db.installmentPurchase.findMany({ where }),
    db.receivableAccount.findMany({ where, include: { person: { select: { name: true } }, incomes: { select: { date: true, amount: true } } } }),
    db.noticeDismissal.findMany({ where: { userId, month }, select: { month: true, noticeKey: true } }),
    db.payableAccount.findMany({ where: { userId, expectedDate: { not: null } }, select: {
      id: true, concept: true, originalAmount: true, accountType: true, currentBalance: true,
      expectedDate: true, status: true, person: { select: { name: true } },
      dailyExpenses: { select: { amount: true, loanPrincipalAmount: true } },
    } }),
  ]);
  const cyclesWithAmounts = cycles.map(cycle => ({ ...cycle, ...getCyclePaymentState(cycle, now),
    ...calculateCycleAmount({ cycle, expenses, subscriptions, purchases, includeBreakdown: false }) }));
  const payments = buildDashboardPayments(cards, cyclesWithAmounts, now);
  const activeReceivables = receivables.map(account => ({ ...account, ...getDebtAccountState(account, account.incomes) }))
    .filter(account => account.status === "ACTIVE");
  const all = buildImportantNotices({ payments, subscriptions, activeReceivables, payables, cyclesWithAmounts, cards, now });
  return partitionNotices(all, dismissals, month).visible.map(notice => ({
    // Una ocurrencia avisa al aparecer, al vencer y al cambiar su saldo pendiente.
    key: createHash("sha256").update(JSON.stringify([month, getNoticeKey(notice), notice.type, notice.group])).digest("hex"),
    title: notice.title,
    body: notice.description,
    path: noticePaths[notice.type] || "/dashboard",
  }));
}
