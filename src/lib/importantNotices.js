import { getCyclePaymentState } from "@/lib/calculations/cardCyclePayments";
import { isSubscriptionChargeResolved } from "@/lib/subscriptionCharges";

export function shouldIncludeSubscriptionInMonth(subscription, year, month) {
  const frequencyMonths = Number(subscription.frequencyMonths || 1);
  const startMonth = Number(subscription.startMonth || month);
  const startYear = Number(subscription.startYear || year);

  const targetIndex = year * 12 + (month - 1);
  const startIndex = startYear * 12 + (startMonth - 1);

  if (targetIndex < startIndex) return false;

  const diffMonths = targetIndex - startIndex;

  return diffMonths % frequencyMonths === 0;
}

function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getDaysDifference(targetDate, baseDate) {
  const target = startOfLocalDay(new Date(targetDate));
  const base = startOfLocalDay(new Date(baseDate));

  return Math.round((target.getTime() - base.getTime()) / 86400000);
}

function getNoticeTiming(diffDays) {
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

export function buildDateFromDay(year, month, day) {
  const maxDay = new Date(year, month, 0).getDate();
  const safeDay = Math.min(day, maxDay);

  return new Date(year, month - 1, safeDay, 12, 0, 0);
}

export function buildCardPaymentNotices(payments, now) {
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

function formatMoneyForNotice(value) {
  const numberValue = Number(value || 0);

  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(numberValue);
}

export function buildCashSubscriptionNotices(subscriptions, now) {
  const notices = [];

  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

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

function toUtcDateStr(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function hasIncomeForReceivableFromDate(receivable, chargeDate, now) {
  const startStr = toUtcDateStr(chargeDate);
  const endStr = toUtcDateStr(now);

  return (receivable.incomes || []).some((income) => {
    const incomeStr = toUtcDateStr(income.date);
    return incomeStr >= startStr && incomeStr <= endStr;
  });
}

function hasExpenseForSubscriptionFromDate(subscription, chargeDate, now) {
  // Start from the 1st of the charge month to catch payments made before the charge day.
  const n = new Date(now);
  const monthStartStr = `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const endStr = toUtcDateStr(now);

  return (subscription.dailyExpenses || []).some((expense) => {
    if (expense.subscriptionCharge) return expense.subscriptionCharge.month === monthStartStr.slice(0, 7);
    const expenseStr = toUtcDateStr(expense.date);
    return expenseStr >= monthStartStr && expenseStr <= endStr;
  });
}

export function buildReceivableNotices(receivables, now) {
  const notices = [];

  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  for (const receivable of receivables) {
    if (receivable.status !== "ACTIVE") continue;

    const expectedChargeDays = receivable.expectedChargeDays || [];

    if (expectedChargeDays.length === 0) continue;

    const originDate = receivable.originDate
      ? startOfLocalDay(new Date(receivable.originDate))
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

export function buildCutCycleNotices(cyclesWithAmounts, cards, now) {
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
      const daysSinceCut = getDaysDifference(now, cycle.cutDate);
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

export function buildDashboardPayments(cards, cyclesWithAmounts, now) {
  // Batch activo: mes más antiguo (por cutDate) que tenga al menos un ciclo sin pagar.
  // Todos los ciclos sin pagar de ese mes se muestran en "Este pago".
  // Solo se avanza al mes actual cuando todos los ciclos del batch anterior están pagados.
  let activeBatchYear = null;
  let activeBatchMonth = null;

  for (const cycle of cyclesWithAmounts) {
    const cutDate = new Date(cycle.cutDate);
    if (cutDate > now) continue;
    if (cycle.isSettled) continue;

    if (
      activeBatchYear === null ||
      cutDate.getUTCFullYear() < activeBatchYear ||
      (cutDate.getUTCFullYear() === activeBatchYear &&
        cutDate.getUTCMonth() < activeBatchMonth)
    ) {
      activeBatchYear = cutDate.getUTCFullYear();
      activeBatchMonth = cutDate.getUTCMonth();
    }
  }

  const hasBatch = activeBatchYear !== null;

  const payments = cards.map((card) => {
    const cyclesForCard = cyclesWithAmounts
      .filter((cycle) => cycle.cardId === card.id)
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

    let currentPayment = null;
    let anchorIndex = -1;

    if (hasBatch) {
      // Buscar ciclo de esta tarjeta en el batch activo (pagado o no)
      const batchIndex = cyclesForCard.findIndex((cycle) => {
        const cutDate = new Date(cycle.cutDate);
        return (
          cutDate.getUTCFullYear() === activeBatchYear &&
          cutDate.getUTCMonth() === activeBatchMonth &&
          cutDate <= now
        );
      });

      if (batchIndex !== -1) {
        currentPayment = cyclesForCard[batchIndex];
        anchorIndex = batchIndex;
      }
    }

    // Si no hay ciclo del batch activo para esta tarjeta, calcular ancla para
    // previousPayment / nextPayment usando el ciclo más reciente cortado.
    if (anchorIndex === -1) {
      for (let i = cyclesForCard.length - 1; i >= 0; i--) {
        if (new Date(cyclesForCard[i].cutDate) <= now) {
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

export function buildImportantNotices({ payments, subscriptions, activeReceivables, cyclesWithAmounts, cards, now }) {
  const priority = { overdue: 0, today: 1, upcoming: 2, cut: 3 };
  return [
    ...buildCardPaymentNotices(payments, now),
    ...buildCashSubscriptionNotices(subscriptions, now),
    ...buildReceivableNotices(activeReceivables, now),
    ...buildCutCycleNotices(cyclesWithAmounts, cards, now),
  ].sort((a, b) => priority[a.group] - priority[b.group] || new Date(a.date) - new Date(b.date));
}
