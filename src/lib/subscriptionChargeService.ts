import type { Prisma, PrismaClient } from '@prisma/client';
import type { FinancialInput } from './financialContracts';
import { moneyInputSchema } from './financialValidation';
import { lockDebtAccounts } from './debtAccountService';
import { subscriptionCaptureCandidates, type ChargePayment } from './subscriptionCaptureCandidates';
export type SubscriptionChargeInput = Partial<Pick<FinancialInput, 'subscriptionId' | 'month' | 'action' | 'today' | 'date' | 'amount' | 'paymentMethod' | 'cardId' | 'createReceivable' | 'expenseId' | 'rememberMerchant' | 'confirmDistinctCapture' | 'expectedCandidates'>> & { expenseData?: Partial<Omit<Prisma.DailyExpenseUncheckedCreateInput, 'userId' | 'date' | 'amount' | 'categoryId' | 'concept'>> & { categoryId?: string; concept?: string } };
export type SubscriptionChargeResult = { expenseId: string; alreadyConfirmed: boolean; linkedExisting?: boolean; restored?: never; skipped?: never } | { restored: true; expenseId?: never; alreadyConfirmed?: never; skipped?: never } | { skipped: true; expenseId?: never; alreadyConfirmed?: never; restored?: never };
import { buildSubscriptionCharges, getSubscriptionReceipts, subscriptionChargeDate, validChargeDay, validChargeMonth } from "./subscriptionCharges";

export class SubscriptionChargeError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

export const subscriptionChargeInclude = {
  charges: true,
  dailyExpenses: { select: { id: true, date: true, amount: true, paymentMethod: true,
    card: { select: { name: true } }, subscriptionCharge: { select: { month: true } } } },
  card: { select: { name: true } },
  category: { select: { name: true } },
} satisfies Prisma.SubscriptionInclude;

export async function loadSubscriptionCharges(db: PrismaClient | Prisma.TransactionClient, userId: string, month: string, today: string) {
  const [subscriptions, cycles] = await Promise.all([
    db.subscription.findMany({ where: { userId }, include: subscriptionChargeInclude }),
    db.cardCycle.findMany({ where: { userId },
      select: { cardId: true, year: true, month: true, usageReconciliation: true } }),
  ]);
  return buildSubscriptionCharges({ subscriptions, cycles, month, today });
}

function chargePayment(subscription: { amount: unknown; paymentMethod: string; cardId: string | null }, scheduledDate: string, input: SubscriptionChargeInput): ChargePayment {
  const date = input.date ?? scheduledDate;
  const amount = input.amount ?? String(subscription.amount);
  if (!validChargeDay(date) || date > input.today!) throw new SubscriptionChargeError("La fecha del cobro debe ser válida y no posterior a hoy.");
  if (!moneyInputSchema.safeParse(amount).success || Number(amount) <= 0) throw new SubscriptionChargeError("Ingresa un importe positivo con hasta dos decimales y no mayor a $9,999,999,999.99.");
  const paymentMethod = input.paymentMethod !== undefined ? input.paymentMethod : input.expenseData?.paymentMethod ?? subscription.paymentMethod;
  if (paymentMethod !== 'CASH' && paymentMethod !== 'CARD') throw new SubscriptionChargeError("Selecciona un método de pago válido.");
  const requestedCardId = input.cardId !== undefined ? input.cardId : input.expenseData?.cardId ?? subscription.cardId;
  if (requestedCardId != null && typeof requestedCardId !== "string") throw new SubscriptionChargeError("Selecciona una tarjeta válida.");
  return { date, amount: String(amount), paymentMethod, cardId: paymentMethod === 'CARD' ? requestedCardId || null : null };
}

export async function previewSubscriptionCharge(db: PrismaClient | Prisma.TransactionClient, userId: string, input: SubscriptionChargeInput) {
  if (typeof input.subscriptionId !== 'string' || !validChargeMonth(input.month) || !validChargeDay(input.today)) {
    throw new SubscriptionChargeError('El cobro o la fecha no son válidos.');
  }
  const subscription = await db.subscription.findFirst({ where: { id: input.subscriptionId, userId } });
  if (!subscription) throw new SubscriptionChargeError('No se encontró la suscripción.', 404);
  const date = subscriptionChargeDate(subscription, input.month);
  if (!date || date > input.today) throw new SubscriptionChargeError('Este cobro todavía no corresponde o la suscripción estaba desactivada.');
  return subscriptionCaptureCandidates(db, userId, subscription, chargePayment(subscription, date, input));
}

// Todas las decisiones y altas manuales vinculadas comparten el mismo bloqueo.
// La transacción crea el gasto y su referencia mensual como una sola operación.
export async function applySubscriptionCharge(tx: Prisma.TransactionClient, userId: string, input: SubscriptionChargeInput): Promise<SubscriptionChargeResult> {
  const { subscriptionId, month, action, today } = input;
  if (typeof subscriptionId !== "string" || !validChargeMonth(month) || !validChargeDay(today)
    || !["confirm", "link", "skip", "restore"].includes(action ?? "")) throw new SubscriptionChargeError("El cobro o la acción no son válidos.");
  if (action === 'link' && (typeof input.expenseId !== 'string' || !input.expenseId)) throw new SubscriptionChargeError('Selecciona un gasto capturado.');
  // Antes del bloqueo de la suscripción, igual que captura y edición de gastos.
  await lockDebtAccounts(tx, userId);
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "subscriptions" WHERE "id" = ${subscriptionId} AND "userId" = ${userId} FOR UPDATE`;
  if (!rows.length) throw new SubscriptionChargeError("No se encontró la suscripción.", 404);
  const subscription = await tx.subscription.findUnique({ where: { id: subscriptionId }, include: subscriptionChargeInclude });
  if (!subscription) throw new SubscriptionChargeError("No se encontró la suscripción.", 404);
  const identity = { subscriptionId, month };
  const decision = subscription.charges.find(charge => charge.month === month);
  const recorded = subscription.dailyExpenses.filter(expense => expense.id === decision?.expenseId
    || (expense.subscriptionCharge ? expense.subscriptionCharge.month === month : expense.date.toISOString().startsWith(month)));
  if ((action === "confirm" || action === 'link') && (decision?.expenseId || recorded.length)) {
    if (action === 'link' && input.expenseId !== (decision?.expenseId || recorded[0]!.id)) {
      throw new SubscriptionChargeError('Este cobro ya se confirmó con otro gasto. Actualiza la lista.', 409);
    }
    // Un reintento después de una respuesta perdida devuelve el gasto existente.
    return { expenseId: decision?.expenseId || recorded[0]!.id, alreadyConfirmed: true };
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
  const payment = chargePayment(subscription, scheduledDate, input);
  const { date, amount, paymentMethod, cardId } = payment;
  const extra: NonNullable<SubscriptionChargeInput["expenseData"]> = input.expenseData || {};
  const categoryId = extra.categoryId ?? subscription.categoryId;
  if (!await tx.category.findFirst({ where: { id: categoryId, userId } })) throw new SubscriptionChargeError("La categoría ya no está disponible.");
  if (paymentMethod === "CARD" && (!cardId || !await tx.card.findFirst({ where: { id: cardId, userId } }))) {
    throw new SubscriptionChargeError("Selecciona una tarjeta disponible para este cobro.");
  }
  const review = await subscriptionCaptureCandidates(tx, userId, subscription, payment);
  if (action === 'link') {
    const candidate = review.candidates.find(row => row.expenseId === input.expenseId);
    if (!candidate?.canLink || input.expectedCandidates !== review.candidateKey) {
      throw new SubscriptionChargeError('El gasto cambió, ya está vinculado o no es compatible. Revisa de nuevo las capturas.', 409);
    }
    if (input.rememberMerchant === true) {
      if (!candidate.canRemember || !candidate.merchant) throw new SubscriptionChargeError('El comercio necesita una regla revisada en Registro automático → Ajustes.', 409);
      const ruleIdentity = { userId, cardId: cardId!, merchant: candidate.merchant };
      await tx.captureMerchantRule.upsert({ where: { userId_cardId_merchant: ruleIdentity },
        create: { ...ruleIdentity, categoryId: subscription.categoryId, subscriptionId }, update: { subscriptionId } });
    }
    // Conserva importe, fecha, concepto, categoría, notas, conciliación y evidencia.
    await tx.dailyExpense.update({ where: { id: candidate.expenseId, userId }, data: { subscriptionId } });
    await tx.subscriptionCharge.upsert({ where: { subscriptionId_month: identity },
      create: { ...identity, userId, status: 'CONFIRMED', expenseId: candidate.expenseId },
      update: { status: 'CONFIRMED', expenseId: candidate.expenseId } });
    return { expenseId: candidate.expenseId, alreadyConfirmed: false, linkedExisting: true };
  }
  if (review.candidates.length && !(input.confirmDistinctCapture === true && input.expectedCandidates === review.candidateKey)) {
    throw new SubscriptionChargeError('Ya hay gastos capturados que podrían ser este cobro. Revísalos y vincula el correcto antes de crear otro.', 409);
  }
  for (const [field, model] of [["personId", "person"], ["receivableAccountId", "receivableAccount"], ["payableAccountId", "payableAccount"]] as const) {
    if (extra[field] && !await (model === "person" ? tx.person.findFirst({ where: { id: extra[field], userId } }) : model === "receivableAccount" ? tx.receivableAccount.findFirst({ where: { id: extra[field], userId } }) : tx.payableAccount.findFirst({ where: { id: extra[field], userId } }))) {
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
    paymentMethod: paymentMethod as "CASH" | "CARD", cardId, categoryId, concept: extra.concept || subscription.name,
  } });
  await tx.subscriptionCharge.upsert({ where: { subscriptionId_month: identity },
    create: { ...identity, userId, status: "CONFIRMED", expenseId: expense.id },
    update: { status: "CONFIRMED", expenseId: expense.id } });
  return { expenseId: expense.id, alreadyConfirmed: false };
}
