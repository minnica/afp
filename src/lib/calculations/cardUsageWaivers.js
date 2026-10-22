import { isSubscriptionChargeResolved } from "../subscriptionCharges";

// Reglas por producto, nunca inferidas del nombre editable de la tarjeta.
export const CARD_USAGE_PRODUCTS = {
  HSBC_ZERO: {
    product: "HSBC Zero", minimumAmount: 300,
    sourceUrl: "https://www.hsbc.com.mx/tarjetas-de-credito/productos/zero/",
  },
  BANAMEX_JOY: {
    product: "Joy Banamex", minimumAmount: 300,
    sourceUrl: "https://www.banamex.com/es/personas/tarjetas-credito/tarjeta-de-credito-sin-anualidad-joy-ab/index.html",
  },
  SANTANDER_LIKEU: {
    product: "Santander LikeU", minimumAmount: 200,
    sourceUrl: "https://www.santander.com.mx/personas/credito-y-financiamiento/tarjetas-de-credito/likeu",
  },
};

function usageDay(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

function isStatementDay(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && usageDay(value) === value;
}

function usageInRange(value, start, end) {
  const date = usageDay(value);
  return date !== null && date >= usageDay(start) && date <= usageDay(end);
}

function usageMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function usageSum(items) {
  return items.reduce((sum, item) => sum + Math.round(Number(item.amount) * 100), 0) / 100;
}

function normalizeUsageText(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
}

export function getUsageExclusion(expense) {
  // La descripción bancaria de la nota conserva la clasificación al renombrar el gasto.
  const original = String(expense.notes || "").match(/concepto bancario(?: original)?\s*:\s*([^;\n]+)/i)?.[1];
  const concept = normalizeUsageText(original || expense.concept);
  if ((original && /^COMISION(?:ES)?\b/.test(concept)) || /^(?:IVA\b.*(?:COMISION|INTERES)|COMISION(?:ES)?\b.*(?:ADMINISTRACION|TARJETA|INACTIVIDAD|PAGO TARDIO|PENALIZACION|BANCARIA|HSBC|BANAMEX|SANTANDER)|ADMINISTRACION (?:DE )?(?:LA )?TARJETA\b|PENALIZACION (?:POR )?(?:PAGO TARDIO|INACTIVIDAD)|INTERESES?(?:\s+(?:HSBC|BANAMEX|SANTANDER|ORDINARIOS|MORATORIOS)|$)|ANUALIDAD\b|GASTOS DE COBRANZA\b)/.test(concept)) {
    return "Comisión, interés o impuesto bancario";
  }
  return null;
}

function verifiedUsageStatement(cycle) {
  const evidence = cycle.usageReconciliation;
  if (!evidence || evidence.version !== 1 || typeof evidence.source !== "string" || !evidence.source.trim() || !/^[a-f0-9]{64}$/.test(evidence.sourceSha256 || "")) return null;
  const start = evidence.startDate;
  const cut = evidence.cutDate;
  if (!isStatementDay(start) || !isStatementDay(cut) || start > cut || Number(cut.slice(0, 4)) !== cycle.year || Number(cut.slice(5, 7)) !== cycle.month) return null;
  return evidence;
}

function usagePeriod(cycle) {
  const evidence = verifiedUsageStatement(cycle);
  const start = evidence?.startDate || usageDay(cycle.startDate);
  const cut = evidence?.cutDate || usageDay(cycle.cutDate);
  if (!cycle.startDate || !cycle.cutDate || !start || !cut || start > cut) return null;
  return { start, cut, verified: Boolean(evidence) };
}

// Turbo exige una compra cada 30 días, independientemente del corte de crédito.
// AFP solo observa los movimientos de crédito registrados, no la activación en Nu.
function buildNuTurboUsage({ card, cyclesWithAmounts, expenses, subscriptions, purchases, now }) {
  const today = usageDay(now);
  const entries = [];
  const cardExpenses = expenses.filter((expense) => expense.cardId === card.id && expense.paymentMethod === "CARD");
  const statements = cyclesWithAmounts.filter((cycle) => cycle.cardId === card.id)
    .map(verifiedUsageStatement).filter(Boolean);
  const excludedIds = new Set(statements.flatMap((statement) => statement.excludedExpenseIds || []));
  const isPurchase = (entry) => !getUsageExclusion(entry)
    && !/^(?:IVA\b|COMISION(?:ES)?\b|INTERESES?\b|(?:RETIRO|DISPOSICION)\b.*EFECTIVO)/.test(normalizeUsageText(entry.concept));
  const add = (entry) => {
    const date = entry.date && usageDay(entry.date);
    if (!date || date > today || !Number.isFinite(Number(entry.amount)) || Number(entry.amount) <= 0) return;
    entries.push({ ...entry, date, amount: usageMoney(entry.amount) });
  };
  for (const expense of cardExpenses) {
    if (expense.reconciliationStatus === "PENDING" || excludedIds.has(expense.id) || !isPurchase(expense)) continue;
    add({ id: `expense:${expense.id}`, concept: expense.concept, amount: expense.amount, date: expense.date });
  }
  // Un comprobante verificado cuenta una vez; el calendario de suscripciones no cuenta.
  const seenReceipts = new Set();
  for (const statement of statements) {
    for (const receipt of Array.isArray(statement.subscriptionCharges) ? statement.subscriptionCharges : []) {
      if (!receipt || typeof receipt.subscriptionId !== "string" || !receipt.subscriptionId.trim()
        || !isStatementDay(receipt.date) || !usageInRange(receipt.date, statement.startDate, statement.cutDate)) continue;
      const key = `${receipt.subscriptionId}:${receipt.date}:${usageMoney(receipt.amount)}`;
      if (seenReceipts.has(key)) continue;
      seenReceipts.add(key);
      const recorded = cardExpenses.some((expense) => expense.subscriptionId === receipt.subscriptionId
        && usageDay(expense.date)?.slice(0, 7) === receipt.date.slice(0, 7));
      if (recorded) continue;
      const concept = receipt.name || subscriptions.find((subscription) => subscription.id === receipt.subscriptionId)?.name || "Suscripción";
      if (isPurchase({ concept })) add({ id: `receipt:${key}`, concept, amount: receipt.amount, date: receipt.date });
    }
  }
  for (const purchase of purchases) {
    if (purchase.cardId !== card.id || purchase.status === "CANCELLED" || purchase.reconciliationStatus === "PENDING" || !isPurchase(purchase)) continue;
    add({ id: `purchase:${purchase.id}`, concept: purchase.concept, amount: purchase.totalAmount, date: purchase.purchaseDate });
  }
  entries.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const lastPurchase = entries[0] || null;
  const deadline = lastPurchase ? new Date(`${lastPurchase.date}T12:00:00Z`) : null;
  if (deadline) deadline.setUTCDate(deadline.getUTCDate() + 30);
  const renewBy = deadline ? usageDay(deadline) : null;
  const daysRemaining = renewBy ? Math.round((new Date(`${renewBy}T12:00:00Z`) - new Date(`${today}T12:00:00Z`)) / 86400000) : null;
  const status = daysRemaining === null || daysRemaining < 0 ? "NOT_MET" : daysRemaining === 0 ? "DUE_TODAY" : "MET";
  const windowStart = new Date(`${today}T12:00:00Z`);
  windowStart.setUTCDate(windowStart.getUTCDate() - 30);
  const recentPurchases = entries.filter((entry) => entry.date >= usageDay(windowStart));
  return {
    card, product: "Cajita Turbo", requirementType: "PURCHASE_FREQUENCY",
    ruleSourceUrl: "https://blog.nu.com.mx/productos-nu/cuenta-nu/cajitas-nu-preguntas-respuestas/",
    requiredPurchases: 1, requirementDays: 30, minimumAmount: null,
    status, isExempt: status !== "NOT_MET", lastPurchase, renewBy, daysRemaining,
    purchaseCount: recentPurchases.length, recentPurchases,
  };
}

// El período vigente depende de sus fechas bancarias, no del mes ni del pago.
export function buildCurrentCardUsageWaivers(args) {
  const now = args.now || new Date();
  const today = usageDay(now);
  return args.cards.flatMap((card) => {
    if (card.usagePolicy?.productKey === "NU") return [buildNuTurboUsage({ ...args, card, now })];
    if (!CARD_USAGE_PRODUCTS[card.usagePolicy?.productKey]) return [];
    const candidates = args.cyclesWithAmounts
      .filter((cycle) => cycle.cardId === card.id)
      .map((cycle) => ({ cycle, period: usagePeriod(cycle) }))
      .filter(({ period }) => period && period.start <= today && today <= period.cut)
      .sort((a, b) => Number(b.period.verified) - Number(a.period.verified)
        || b.period.start.localeCompare(a.period.start)
        || a.period.cut.localeCompare(b.period.cut));
    const selected = candidates[0]?.cycle;
    const [item] = buildCardUsageWaivers({
      ...args, now, cards: [card], cyclesWithAmounts: selected ? [selected] : [],
      year: selected?.year ?? now.getUTCFullYear(),
      month: selected?.month ?? now.getUTCMonth() + 1,
    });
    // No se acredita una meta cuando dos períodos compiten por los movimientos.
    return [{ ...item, periodSelectionPending: candidates.length > 1,
      ...(candidates.length > 1 ? { isExempt: false, status: "PERIOD_REVIEW" } : {}),
    }];
  });
}

export function buildCardUsageWaiverHistory(args) {
  const now = args.now || new Date();
  const today = usageDay(now);
  const cards = new Map(args.cards.map((card) => [card.id, card]));
  return args.cyclesWithAmounts.flatMap((cycle) => {
    const card = cards.get(cycle.cardId);
    const period = usagePeriod(cycle);
    if (!card || !CARD_USAGE_PRODUCTS[card.usagePolicy?.productKey] || !period || period.cut >= today) return [];
    return buildCardUsageWaivers({
      ...args, now, cards: [card], cyclesWithAmounts: [cycle],
      year: cycle.year, month: cycle.month,
    });
  });
}

function usageScheduledCharges(subscription, cycle) {
  const start = new Date(cycle.startDate);
  const end = new Date(cycle.cutDate);
  const firstMonth = Number(subscription.startYear || cycle.year) * 12 + Number(subscription.startMonth || cycle.month) - 1;
  const dates = [];
  for (let index = start.getUTCFullYear() * 12 + start.getUTCMonth(); index <= end.getUTCFullYear() * 12 + end.getUTCMonth(); index++) {
    if (index < firstMonth || (index - firstMonth) % Math.max(1, Number(subscription.frequencyMonths || 1)) !== 0) continue;
    const year = Math.floor(index / 12);
    const month = index % 12;
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const date = new Date(Date.UTC(year, month, Math.min(Number(subscription.chargeDay), lastDay), 12));
    if (isSubscriptionChargeResolved(subscription, usageDay(date).slice(0, 7))) continue;
    if (!usageInRange(date, cycle.startDate, cycle.cutDate)) continue;
    if (!subscription.isActive && (!subscription.deactivatedAt || usageDay(date) > usageDay(subscription.deactivatedAt))) continue;
    dates.push(date.toISOString());
  }
  return dates;
}

export function buildCardUsageWaivers({ cards, cyclesWithAmounts, expenses, subscriptions, purchases, year, month, now = new Date() }) {
  const today = usageDay(now);
  return cards.flatMap((card) => {
    const rule = CARD_USAGE_PRODUCTS[card.usagePolicy?.productKey];
    if (!rule) return [];
    const storedCycle = cyclesWithAmounts.find((cycle) => cycle.cardId === card.id && cycle.year === year && cycle.month === month);
    const evidence = storedCycle && verifiedUsageStatement(storedCycle);
    const cycle = storedCycle && { ...storedCycle,
      startDate: evidence ? `${evidence.startDate}T12:00:00.000Z` : storedCycle.startDate,
      cutDate: evidence ? `${evidence.cutDate}T12:00:00.000Z` : storedCycle.cutDate,
    };
    const daily = [];
    const excluded = [];
    const confirmedSubscriptions = [];
    const projected = [];
    const newPurchases = [];
    let confirmationPending = false;
    const cardExpenses = expenses.filter((item) => item.cardId === card.id && item.paymentMethod !== "CASH");
    if (cycle) {
      for (const expense of cardExpenses) {
        if (!usageInRange(expense.date, cycle.startDate, cycle.cutDate)) continue;
        const item = { id: expense.id, concept: expense.concept, amount: usageMoney(expense.amount), date: expense.date, categoryName: expense.category?.name || null };
        const reason = Array.isArray(evidence?.excludedExpenseIds) && evidence.excludedExpenseIds.includes(expense.id)
          ? "Comisión, interés o impuesto bancario verificado"
          : getUsageExclusion(expense);
        if (reason) excluded.push({ ...item, reason });
        else if (expense.reconciliationStatus === "PENDING") projected.push({ ...item, reason: "Captura automática por conciliar" });
        else if (usageDay(expense.date) > today) projected.push({ ...item, reason: "Gasto con fecha futura" });
        else daily.push(item);
      }

      // Evidencia del estado: importe y fecha reales, incluso si la suscripción cambió después.
      const receipts = (Array.isArray(evidence?.subscriptionCharges) ? evidence.subscriptionCharges : []).filter((receipt) => (
        receipt && typeof receipt.subscriptionId === "string" && receipt.subscriptionId.trim() &&
        ["number", "string"].includes(typeof receipt.amount) && /^\d+(?:\.\d{1,2})?$/.test(String(receipt.amount)) &&
        Number.isFinite(Number(receipt.amount)) && Number(receipt.amount) > 0 &&
        isStatementDay(receipt.date) && usageInRange(receipt.date, cycle.startDate, cycle.cutDate)
      ));
      const receiptKey = (subscriptionId, date) => `${subscriptionId}:${usageDay(date)?.slice(0, 7)}`;
      const reviewReasons = new Map();
      const reviewExpenseIds = new Map();
      for (const key of new Set(receipts.map((receipt) => receiptKey(receipt.subscriptionId, receipt.date)))) {
        const groupReceipts = receipts.filter((receipt) => receiptKey(receipt.subscriptionId, receipt.date) === key);
        const groupExpenses = cardExpenses.filter((expense) => expense.subscriptionId &&
          receiptKey(expense.subscriptionId, expense.date) === key && usageInRange(expense.date, cycle.startDate, cycle.cutDate));
        if (!groupExpenses.length) continue;
        const unmatched = groupExpenses.map((expense) => Math.round(Number(expense.amount) * 100));
        let exactMatches = 0;
        for (const receipt of groupReceipts) {
          const index = unmatched.indexOf(Math.round(Number(receipt.amount) * 100));
          if (index < 0) continue;
          unmatched.splice(index, 1);
          exactMatches++;
        }
        if (exactMatches === Math.min(groupExpenses.length, groupReceipts.length)) continue;
        const amounts = (items) => items.map((item) => `$${usageMoney(item.amount).toFixed(2)}`).join(", ");
        const reason = `Importe distinto al estado: gasto ${amounts(groupExpenses)}, comprobante ${amounts(groupReceipts)}; requiere conciliación`;
        reviewReasons.set(key, reason);
        for (const expense of groupExpenses) reviewExpenseIds.set(expense.id, reason);
        confirmationPending = true;
      }
      // Una discrepancia conserva los importes originales, pero no acredita consumo confirmado.
      for (let index = daily.length - 1; index >= 0; index--) {
        const reason = reviewExpenseIds.get(daily[index].id);
        if (reason) projected.push({ ...daily.splice(index, 1)[0], reason });
      }
      for (const item of projected) {
        const reason = reviewExpenseIds.get(item.id);
        if (reason) item.reason = reason;
      }
      const matchedExpenseIds = new Set();
      const matchedReceipts = new Set();
      // Reservar primero coincidencias exactas evita emparejar otro cargo del mismo mes.
      for (const exactOnly of [true, false]) {
        for (const [index, receipt] of receipts.entries()) {
          if (matchedReceipts.has(index)) continue;
          const recorded = cardExpenses.find((expense) => !matchedExpenseIds.has(expense.id) &&
            expense.subscriptionId === receipt.subscriptionId &&
            usageDay(expense.date)?.slice(0, 7) === usageDay(receipt.date)?.slice(0, 7) &&
            usageInRange(expense.date, cycle.startDate, cycle.cutDate) &&
            (!exactOnly || usageMoney(expense.amount) === usageMoney(receipt.amount)));
          if (recorded) {
            matchedExpenseIds.add(recorded.id);
            matchedReceipts.add(index);
          }
        }
      }
      for (const [index, receipt] of receipts.entries()) {
        if (matchedReceipts.has(index)) continue;
        const item = { id: `${receipt.subscriptionId}-${receipt.date}-${receipts.indexOf(receipt)}`, name: typeof receipt.name === "string" ? receipt.name : "Suscripción", amount: usageMoney(receipt.amount), chargeDate: `${usageDay(receipt.date)}T12:00:00.000Z`, source: evidence.source };
        const reviewReason = reviewReasons.get(receiptKey(receipt.subscriptionId, receipt.date));
        if (reviewReason) projected.push({ ...item, reason: reviewReason });
        else if (usageDay(receipt.date) <= today) confirmedSubscriptions.push(item);
        else projected.push({ ...item, subscriptionProjection: "upcoming", reason: "Cargo con fecha futura" });
      }

      for (const subscription of subscriptions.filter((item) => item.cardId === card.id && item.paymentMethod === "CARD")) {
        for (const chargeDate of usageScheduledCharges(subscription, cycle)) {
          const monthKey = usageDay(chargeDate).slice(0, 7);
          const recorded = cardExpenses.some((expense) => expense.subscriptionId === subscription.id
            && (expense.subscriptionCharge?.month || usageDay(expense.date)?.slice(0, 7)) === monthKey);
          const confirmed = receipts.some((receipt) => receipt.subscriptionId === subscription.id && usageDay(receipt.date).slice(0, 7) === monthKey);
          // Un estado ya revisado es la fuente de verdad sobre los cargos de ese corte.
          if (recorded || confirmed || evidence) continue;
          projected.push({ id: `${subscription.id}-${chargeDate}`, name: subscription.name, amount: usageMoney(subscription.amount), chargeDate, categoryName: subscription.category?.name || null,
            subscriptionProjection: usageDay(chargeDate) > today ? "upcoming" : "unconfirmed",
            reason: usageDay(chargeDate) > today ? "Suscripción programada" : "Cargo estimado por confirmar" });
        }
      }

      for (const purchase of purchases.filter((item) => item.cardId === card.id && item.status !== "CANCELLED")) {
        if (!usageInRange(purchase.purchaseDate, cycle.startDate, cycle.cutDate)) continue;
        const item = { id: purchase.id, concept: purchase.concept, amount: usageMoney(purchase.totalAmount), purchaseDate: purchase.purchaseDate, months: purchase.months, categoryName: purchase.category?.name || null };
        if (purchase.reconciliationStatus === "PENDING") projected.push({ ...item, reason: "Compra a meses por conciliar" });
        else if (usageDay(purchase.purchaseDate) > today) projected.push({ ...item, reason: "Compra con fecha futura" });
        else newPurchases.push(item);
      }
    }
    // Una compra nueva cuenta una vez; las cuotas de compras de ciclos anteriores no se suman.
    const dailyExpensesAmount = usageSum(daily);
    const subscriptionsAmount = usageSum(confirmedSubscriptions);
    const installmentPurchasesAmount = usageSum(newPurchases);
    const eligibleSpend = usageMoney(dailyExpensesAmount + subscriptionsAmount + installmentPurchasesAmount);
    const projectedAmount = usageSum(projected);
    const upcomingSubscriptions = projected.filter((item) => item.subscriptionProjection === "upcoming");
    const unconfirmedSubscriptions = projected.filter((item) => item.subscriptionProjection === "unconfirmed");
    const remainingAmount = usageMoney(Math.max(rule.minimumAmount - eligibleSpend, 0));
    const isFuture = Boolean(cycle && usageDay(cycle.startDate) > today);
    const isClosed = Boolean(cycle && usageDay(cycle.cutDate) < today);
    const isExempt = Boolean(cycle && !isFuture && !confirmationPending && eligibleSpend >= rule.minimumAmount);
    return [{ card, applies: true, bank: rule.product, product: rule.product, ruleSourceUrl: rule.sourceUrl,
      policyVerifiedAt: card.usagePolicy.verifiedAt, minimumAmount: rule.minimumAmount,
      eligibleSpend, remainingAmount, progress: Math.min(eligibleSpend / rule.minimumAmount * 100, 100), isExempt, confirmationPending,
      projectedAmount, projectedTotal: usageMoney(eligibleSpend + projectedAmount),
      subscriptionForecast: {
        upcomingCount: upcomingSubscriptions.length, upcomingAmount: usageSum(upcomingSubscriptions),
        unconfirmedCount: unconfirmedSubscriptions.length, unconfirmedAmount: usageSum(unconfirmedSubscriptions),
      },
      status: !cycle ? "NO_CYCLE" : isFuture ? "FUTURE" : isExempt ? "MET" : confirmationPending || projectedAmount > 0 ? "UNCONFIRMED" : isClosed ? "NOT_MET" : "IN_PROGRESS",
      periodVerified: Boolean(evidence), statementSource: evidence?.source || null,
      selectedCycle: cycle ? { id: cycle.id, startDate: cycle.startDate, cutDate: cycle.cutDate, dueDate: cycle.dueDate, month, year, displayStatus: cycle.displayStatus } : null,
      breakdown: { dailyExpensesAmount, subscriptionsAmount, installmentPurchasesAmount,
        includedDailyExpenses: daily, includedSubscriptions: confirmedSubscriptions, includedInstallmentPurchases: newPurchases,
        excludedExpenses: excluded, excludedAmount: usageSum(excluded), projectedCharges: projected },
    }];
  });
}
