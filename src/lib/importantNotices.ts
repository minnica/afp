import type { FinancialSubscription, FinancialCycle, DateValue, MoneyValue, DebtAccount, DebtPayment } from './calculations/types';
export type NoticeCycle = FinancialCycle & { isSettled?: boolean; paymentStatus?: string; calculatedAmount?: number };
type NoticeCard = { id: string; name: string };
type NoticeSubscription = Omit<FinancialSubscription, 'dailyExpenses'> & { dailyExpenses?: { date: DateValue; subscriptionCharge?: { month: string } | null }[] };
type NoticeReceivable = DebtAccount & { id: string; concept: string; expectedChargeDays?: number[]; expectedMonthlyPayment?: MoneyValue; originDate?: DateValue; person?: { name: string } | null; incomes?: ({ date: DateValue } & DebtPayment)[] };
type NoticePayable = DebtAccount & { id: string; concept: string; expectedDate?: DateValue | null; person?: { name: string } | null; dailyExpenses?: DebtPayment[] };
type Payment = { card: NoticeCard; currentPayment?: NoticeCycle | null };
export interface ImportantNotice { id: string; type: string; group: string; title: string; description: string; date: DateValue; amount: number }
import { getCyclePaymentState } from "@/lib/calculations/cardCyclePayments";
import { getDebtAccountState } from "@/lib/calculations/debtAccounts";
import { isSubscriptionChargeResolved } from "@/lib/subscriptionCharges";
import { bankDay, daysUntilBankDate, mexicoDayNumber, todayInMexico } from './financialDates';

export function shouldIncludeSubscriptionInMonth(subscription: Pick<FinancialSubscription, "frequencyMonths" | "startMonth" | "startYear">, year: number, month: number) {
  const frequencyMonths = Number(subscription.frequencyMonths || 1);
  const startMonth = Number(subscription.startMonth || month);
  const startYear = Number(subscription.startYear || year);

  const targetIndex = year * 12 + (month - 1);
  const startIndex = startYear * 12 + (startMonth - 1);

  if (targetIndex < startIndex) return false;

  const diffMonths = targetIndex - startIndex;

  return diffMonths % frequencyMonths === 0;
}

const getDaysDifference = daysUntilBankDate;

function getNoticeTiming(diffDays: number) {
  if (diffDays < 0) {
    return {
      group: "overdue",
      label:
        Math.abs(diffDays) === 1
          ? "Vencido: desde hace 1 día"
          : `Vencido: desde hace ${Math.abs(diffDays)} días`,
    };
  }

  if (diffDays === 0) {
    return {
      group: "today",
      label: "Vence: hoy",
    };
  }

  if (diffDays === 1) {
    return {
      group: "upcoming",
      label: "Vence: mañana",
    };
  }

  return {
    group: "upcoming",
    label: `Vence: en ${diffDays} días`,
  };
}

export function buildDateFromDay(year: number, month: number, day: number) {
  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const safeDay = Math.min(day, maxDay);

  return new Date(Date.UTC(year, month - 1, safeDay, 12));
}

export function buildCardPaymentNotices(payments: Payment[], now: Date) {
  const notices = [];

  for (const item of payments) {
    const card = item.card;
    const cycle = item.currentPayment;

    if (!cycle) continue;
    const payment = getCyclePaymentState(cycle, now);
    if (payment.isSettled) continue;

    const diffDays = getDaysDifference(cycle.dueDate, now);

    if (diffDays > 2) continue;

    const timing = getNoticeTiming(diffDays);

    notices.push({
      id: `card-${cycle.id}`,
      type: "CARD_PAYMENT",
      group: timing.group,
      title:
        timing.group === "overdue"
          ? `Pago vencido de ${card.name}`
          : `Pago de tarjeta: ${card.name}`,
      description: `${timing.label}\n${
        cycle.statementAmount !== null && cycle.statementAmount !== undefined
          ? `Saldo pendiente: ${formatMoneyForNotice(payment.pendingAmount)}`
          : `Pago calculado: ${formatMoneyForNotice(cycle.calculatedAmount)} · Estado de cuenta por confirmar`
      }`,
      date: cycle.dueDate,
      amount: payment.pendingAmount ?? Number(cycle.calculatedAmount ?? 0),
    });
  }

  return notices;
}

function formatMoneyForNotice(value: MoneyValue) {
  const numberValue = Number(value || 0);

  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(numberValue);
}

export function buildCashSubscriptionNotices(subscriptions: NoticeSubscription[], now: Date) {
  const notices = [];

  const date = new Date(mexicoDayNumber(now));
  const currentYear = date.getUTCFullYear();
  const currentMonth = date.getUTCMonth() + 1;

  for (const subscription of subscriptions) {
    if (subscription.paymentMethod !== "CASH") continue;
    if (!subscription.isActive) continue;
    if (isSubscriptionChargeResolved(subscription, `${currentYear}-${String(currentMonth).padStart(2, "0")}`)) continue;

    if (
      !shouldIncludeSubscriptionInMonth(subscription, currentYear, currentMonth)
    ) {
      continue;
    }

    const dueDate = buildDateFromDay(
      currentYear,
      currentMonth,
      Number(subscription.chargeDay),
    );

    const diffDays = getDaysDifference(dueDate, now);

    if (diffDays > 2) continue;

    const alreadyPaid = hasExpenseForSubscriptionFromDate(
      subscription,
      dueDate,
      now,
    );

    if (alreadyPaid) continue;

    const timing = getNoticeTiming(diffDays);

    notices.push({
      id: `subscription-${subscription.id}-${currentYear}-${currentMonth}`,
      type: "CASH_SUBSCRIPTION",
      group: timing.group,
      title:
        timing.group === "overdue"
          ? `Suscripción pendiente: ${subscription.name}`
          : `Suscripción en efectivo: ${subscription.name}`,
      description: `${timing.label}\nPago estimado: ${formatMoneyForNotice(
        subscription.amount,
      )}`,
      date: dueDate,
      amount: Number(subscription.amount || 0),
    });
  }

  return notices;
}

function toUtcDateStr(d: DateValue) {
  return new Date(d).toISOString().slice(0, 10);
}

function hasIncomeForReceivableFromDate(receivable: NoticeReceivable, chargeDate: DateValue, now: Date) {
  const startStr = toUtcDateStr(chargeDate);
  const endStr = todayInMexico(now);

  return (receivable.incomes || []).some((income) => {
    const incomeStr = toUtcDateStr(income.date);
    return incomeStr >= startStr && incomeStr <= endStr;
  });
}

function hasExpenseForSubscriptionFromDate(subscription: NoticeSubscription, chargeDate: DateValue, now: Date) {
  // Start from the 1st of the charge month to catch payments made before the charge day.
  const endStr = todayInMexico(now);
  const monthStartStr = `${endStr.slice(0, 7)}-01`;

  return (subscription.dailyExpenses || []).some((expense) => {
    if (expense.subscriptionCharge) return expense.subscriptionCharge.month === monthStartStr.slice(0, 7);
    const expenseStr = toUtcDateStr(expense.date);
    return expenseStr >= monthStartStr && expenseStr <= endStr;
  });
}

export function buildPayableNotices(payables: NoticePayable[], now: Date) {
  const notices = [];

  for (const payable of payables) {
    if (!payable.expectedDate) continue;
    const expectedDate = new Date(payable.expectedDate);
    if (!Number.isFinite(expectedDate.getTime())) continue;

    // La fecha bancaria conserva su día UTC, comparado con el día de México.
    const dueDate = buildDateFromDay(
      expectedDate.getUTCFullYear(),
      expectedDate.getUTCMonth() + 1,
      expectedDate.getUTCDate(),
    );
    const diffDays = getDaysDifference(dueDate, now);
    if (diffDays > 2) continue;

    const state = getDebtAccountState(payable, payable.dailyExpenses || []);
    if (state.status !== "ACTIVE") continue;

    const timing = getNoticeTiming(diffDays);
    notices.push({
      id: `payable-${payable.id}`,
      type: "PAYABLE",
      group: timing.group,
      title: timing.group === "overdue"
        ? `Pago vencido: ${payable.concept}`
        : `Cuenta por pagar: ${payable.concept}`,
      description: `${timing.label}\nSaldo pendiente: ${formatMoneyForNotice(state.pendingBalance)}${
        payable.person?.name ? `\nAcreedor: ${payable.person.name}` : ""
      }`,
      date: payable.expectedDate,
      amount: state.pendingBalance,
    });
  }

  return notices;
}

export function buildReceivableNotices(receivables: NoticeReceivable[], now: Date) {
  const notices = [];

  const date = new Date(mexicoDayNumber(now));
  const currentYear = date.getUTCFullYear();
  const currentMonth = date.getUTCMonth() + 1;

  for (const receivable of receivables) {
    if (receivable.status !== "ACTIVE") continue;

    const expectedChargeDays = receivable.expectedChargeDays || [];

    if (expectedChargeDays.length === 0) continue;

    const originDate = receivable.originDate
      ? new Date(bankDay(receivable.originDate))
      : null;

    for (const day of expectedChargeDays) {
      const chargeDate = buildDateFromDay(
        currentYear,
        currentMonth,
        Number(day),
      );

      // No generar aviso para fechas anteriores al inicio de la cuenta
      if (originDate && chargeDate < originDate) continue;

      const diffDays = getDaysDifference(chargeDate, now);

      if (diffDays > 2) continue;

      const alreadyPaid = hasIncomeForReceivableFromDate(
        receivable,
        chargeDate,
        now,
      );

      if (alreadyPaid) continue;

      const timing = getNoticeTiming(diffDays);

      notices.push({
        id: `receivable-${receivable.id}-${currentYear}-${currentMonth}-${day}`,
        type: "RECEIVABLE",
        group: timing.group,
        title:
          timing.group === "overdue"
            ? `Cobro pendiente: ${receivable.person?.name || "Persona"}`
            : `Cobro programado: ${receivable.person?.name || "Persona"}`,
        description: `${timing.label}\n${
          receivable.expectedMonthlyPayment
            ? `Pago esperado: ${formatMoneyForNotice(
                receivable.expectedMonthlyPayment,
              )}`
            : `Cuenta: ${receivable.concept}`
        }`,
        date: chargeDate,
        amount: Number(receivable.expectedMonthlyPayment || 0),
      });
    }
  }

  return notices;
}

export function buildCutCycleNotices(cyclesWithAmounts: NoticeCycle[], cards: NoticeCard[], now: Date) {
  const notices = [];
  const cardMap = new Map(cards.map((c) => [c.id, c]));

  for (const cycle of cyclesWithAmounts) {
    if (cycle.isSettled) continue;
    if (cycle.displayStatus === "PAYMENT_PENDING" || cycle.paymentStatus === "PARTIALLY_PAID") continue;
    if (cycle.displayStatus === "OVERDUE") continue;

    const card = cardMap.get(cycle.cardId);
    if (!card) continue;

    const diffDaysToCut = getDaysDifference(cycle.cutDate, now);

    if (cycle.displayStatus === "CUT") {
      const daysSinceCut = -diffDaysToCut;
      const cutAgoLabel =
        daysSinceCut === 0
          ? "hoy"
          : daysSinceCut === 1
            ? "hace 1 día"
            : `hace ${daysSinceCut} días`;

      notices.push({
        id: `cut-cycle-${cycle.id}`,
        type: "CUT_CYCLE",
        group: "cut",
        title: `Tarjeta cortada: ${card.name}`,
        description: `Corte: ${cutAgoLabel}`,
        date: cycle.cutDate,
        amount: Number(cycle.calculatedAmount || 0),
      });
    } else if (
      cycle.displayStatus === "OPEN" &&
      diffDaysToCut > 0 &&
      diffDaysToCut <= 2
    ) {
      const cutLabel =
        diffDaysToCut === 1 ? "mañana" : `en ${diffDaysToCut} días`;
      notices.push({
        id: `cut-cycle-upcoming-${cycle.id}`,
        type: "CUT_CYCLE_UPCOMING",
        group: "cut",
        title: `Corte ${cutLabel}: ${card.name}`,
        description: `Corte: ${cutLabel}`,
        date: cycle.cutDate,
        amount: Number(cycle.calculatedAmount || 0),
      });
    }
  }

  return notices;
}

export function buildDashboardPayments<C extends NoticeCard, T extends NoticeCycle>(cards: C[], cyclesWithAmounts: T[], now: Date) {
  const today = mexicoDayNumber(now);
  // Batch activo: mes más antiguo (por cutDate) que tenga al menos un ciclo sin pagar.
  // Todos los ciclos sin pagar de ese mes se muestran en "Este pago".
  // Solo se avanza al mes actual cuando todos los ciclos del batch anterior están pagados.
  let activeBatchYear: number | null = null;
  let activeBatchMonth: number | null = null;

  for (const cycle of cyclesWithAmounts) {
    const cutDate = new Date(cycle.cutDate);
    if (bankDay(cutDate) > today) continue;
    if (cycle.isSettled) continue;

    if (
      activeBatchYear === null ||
      cutDate.getUTCFullYear() < activeBatchYear ||
      (cutDate.getUTCFullYear() === activeBatchYear &&
        cutDate.getUTCMonth() < activeBatchMonth!)
    ) {
      activeBatchYear = cutDate.getUTCFullYear();
      activeBatchMonth = cutDate.getUTCMonth();
    }
  }

  const hasBatch = activeBatchYear !== null;

  const payments = cards.map((card) => {
    const cyclesForCard = cyclesWithAmounts
      .filter((cycle) => cycle.cardId === card.id)
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

    let currentPayment: T | null = null;
    let anchorIndex = -1;

    if (hasBatch) {
      // Buscar ciclo de esta tarjeta en el batch activo (pagado o no)
      const batchIndex = cyclesForCard.findIndex((cycle) => {
        const cutDate = new Date(cycle.cutDate);
        return (
          cutDate.getUTCFullYear() === activeBatchYear &&
          cutDate.getUTCMonth() === activeBatchMonth &&
          bankDay(cutDate) <= today
        );
      });

      if (batchIndex !== -1) {
        currentPayment = cyclesForCard[batchIndex]!;
        anchorIndex = batchIndex;
      }
    }

    // Si no hay ciclo del batch activo para esta tarjeta, calcular ancla para
    // previousPayment / nextPayment usando el ciclo más reciente cortado.
    if (anchorIndex === -1) {
      for (let i = cyclesForCard.length - 1; i >= 0; i--) {
        if (bankDay(cyclesForCard[i]!.cutDate) <= today) {
          anchorIndex = i;
          break;
        }
      }
      if (anchorIndex === -1) anchorIndex = 0;

      // Solo asignar currentPayment si no hay batch activo (todo pagado o sin cortes)
      if (!hasBatch) {
        currentPayment = cyclesForCard[anchorIndex] || null;
      }
    }

    return {
      card,
      previousPayment: anchorIndex > 0 ? cyclesForCard[anchorIndex - 1] : null,
      currentPayment,
      nextPayment: cyclesForCard[anchorIndex + 1] || null,
    };
  });

  return payments;
}

export function buildImportantNotices({ payments, subscriptions, activeReceivables, payables = [], cyclesWithAmounts, cards, now }: { payments: Payment[]; subscriptions: NoticeSubscription[]; activeReceivables: NoticeReceivable[]; payables?: NoticePayable[]; cyclesWithAmounts: NoticeCycle[]; cards: NoticeCard[]; now: Date }) {
  const priority: Record<string, number> = { overdue: 0, today: 1, upcoming: 2, cut: 3 };
  return [
    ...buildCardPaymentNotices(payments, now),
    ...buildCashSubscriptionNotices(subscriptions, now),
    ...buildReceivableNotices(activeReceivables, now),
    ...buildPayableNotices(payables, now),
    ...buildCutCycleNotices(cyclesWithAmounts, cards, now),
  ].sort((a, b) => priority[a.group]! - priority[b.group]! || new Date(a.date).getTime() - new Date(b.date).getTime());
}
