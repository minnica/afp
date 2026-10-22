import { buildSubscriptionCharges, getSubscriptionReceipts, subscriptionChargeDate, validChargeDay, validChargeMonth } from "./subscriptionCharges";

export class SubscriptionChargeError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export const subscriptionChargeInclude = {
  charges: true,
  dailyExpenses: { select: { id: true, date: true, amount: true, paymentMethod: true,
    card: { select: { name: true } }, subscriptionCharge: { select: { month: true } } } },
  card: { select: { name: true } },
  category: { select: { name: true } },
};

export async function loadSubscriptionCharges(db, userId, month, today) {
  const [subscriptions, cycles] = await Promise.all([
    db.subscription.findMany({ where: { userId }, include: subscriptionChargeInclude }),
    db.cardCycle.findMany({ where: { userId },
      select: { cardId: true, year: true, month: true, usageReconciliation: true } }),
  ]);
  return buildSubscriptionCharges({ subscriptions, cycles, month, today });
}

// Todas las decisiones y altas manuales vinculadas comparten el mismo bloqueo.
// La transacción crea el gasto y su referencia mensual como una sola operación.
export async function applySubscriptionCharge(tx, userId, input) {
  const { subscriptionId, month, action, today } = input;
  if (typeof subscriptionId !== "string" || !validChargeMonth(month) || !validChargeDay(today)
    || !["confirm", "skip", "restore"].includes(action)) throw new SubscriptionChargeError("El cobro o la acción no son válidos.");
  const rows = await tx.$queryRaw`SELECT "id" FROM "subscriptions" WHERE "id" = ${subscriptionId} AND "userId" = ${userId} FOR UPDATE`;
  if (!rows.length) throw new SubscriptionChargeError("No se encontró la suscripción.", 404);
  const subscription = await tx.subscription.findUnique({ where: { id: subscriptionId }, include: subscriptionChargeInclude });
  const identity = { subscriptionId, month };
  const decision = subscription.charges.find(charge => charge.month === month);
  const recorded = subscription.dailyExpenses.filter(expense => expense.id === decision?.expenseId
    || (expense.subscriptionCharge ? expense.subscriptionCharge.month === month : expense.date.toISOString().startsWith(month)));
  if (action === "confirm" && (decision?.expenseId || recorded.length)) {
    // Un reintento después de una respuesta perdida devuelve el gasto existente.
    return { expenseId: decision?.expenseId || recorded[0].id, alreadyConfirmed: true };
  }
  if (recorded.length || decision?.expenseId) throw new SubscriptionChargeError("Este cobro ya está registrado. Revisa el gasto antes de omitirlo.", 409);
  if (action === "restore") {
    await tx.subscriptionCharge.deleteMany({ where: { ...identity, userId, status: "SKIPPED" } });
    return { restored: true };
  }
  const scheduledDate = subscriptionChargeDate(subscription, month);
  if (!scheduledDate || scheduledDate > today) throw new SubscriptionChargeError("Este cobro todavía no corresponde o la suscripción estaba desactivada.");
  const cycles = await tx.cardCycle.findMany({ where: { userId, cardId: subscription.cardId || "" },
    select: { cardId: true, year: true, month: true, usageReconciliation: true } });
  if (getSubscriptionReceipts(subscription, month, cycles).length) {
    throw new SubscriptionChargeError("El estado de cuenta ya confirma este cobro. Actualiza la lista para consultarlo.", 409);
  }
  if (action === "skip") {
    await tx.subscriptionCharge.upsert({ where: { subscriptionId_month: identity },
      create: { ...identity, userId, status: "SKIPPED" }, update: { status: "SKIPPED", expenseId: null } });
    return { skipped: true };
  }
  if (decision?.status === "SKIPPED") throw new SubscriptionChargeError("Restaura el cobro omitido antes de confirmarlo.", 409);
  const date = input.date ?? scheduledDate;
  const amount = input.amount ?? String(subscription.amount);
  if (!validChargeDay(date) || date > today) throw new SubscriptionChargeError("La fecha del cobro debe ser válida y no posterior a hoy.");
  if (!["number", "string"].includes(typeof amount) || !/^\d+(?:\.\d{1,2})?$/.test(String(amount))
    || Number(amount) <= 0 || !Number.isSafeInteger(Math.round(Number(amount) * 100))) throw new SubscriptionChargeError("Ingresa un importe positivo con hasta dos decimales.");
  const extra = input.expenseData || {};
  const paymentMethod = input.paymentMethod !== undefined ? input.paymentMethod : extra.paymentMethod ?? subscription.paymentMethod;
  if (!["CASH", "CARD"].includes(paymentMethod)) throw new SubscriptionChargeError("Selecciona un método de pago válido.");
  const requestedCardId = input.cardId !== undefined ? input.cardId : extra.cardId ?? subscription.cardId;
  if (requestedCardId != null && typeof requestedCardId !== "string") throw new SubscriptionChargeError("Selecciona una tarjeta válida.");
  const cardId = paymentMethod === "CARD" ? requestedCardId : null;
  const categoryId = extra.categoryId ?? subscription.categoryId;
  if (!await tx.category.findFirst({ where: { id: categoryId, userId } })) throw new SubscriptionChargeError("La categoría ya no está disponible.");
  if (paymentMethod === "CARD" && (!cardId || !await tx.card.findFirst({ where: { id: cardId, userId } }))) {
    throw new SubscriptionChargeError("Selecciona una tarjeta disponible para este cobro.");
  }
  for (const [field, model] of [["personId", "person"], ["receivableAccountId", "receivableAccount"], ["payableAccountId", "payableAccount"]]) {
    if (extra[field] && !await tx[model].findFirst({ where: { id: extra[field], userId } })) {
      throw new SubscriptionChargeError("La persona o cuenta vinculada no está disponible.");
    }
  }
  if (input.createReceivable && extra.personId) {
    const receivable = await tx.receivableAccount.create({ data: {
      userId, personId: extra.personId, concept: extra.concept || subscription.name,
      originalAmount: String(amount), originDate: new Date(`${date}T12:00:00.000Z`), status: "ACTIVE", originType: "DAILY_EXPENSE",
    } });
    extra.receivableAccountId = receivable.id;
  }
  const expense = await tx.dailyExpense.create({ data: {
    ...extra, userId, subscriptionId, date: new Date(`${date}T12:00:00.000Z`), amount: String(amount),
    paymentMethod, cardId, categoryId, concept: extra.concept || subscription.name,
  } });
  await tx.subscriptionCharge.upsert({ where: { subscriptionId_month: identity },
    create: { ...identity, userId, status: "CONFIRMED", expenseId: expense.id },
    update: { status: "CONFIRMED", expenseId: expense.id } });
  return { expenseId: expense.id, alreadyConfirmed: false };
}
