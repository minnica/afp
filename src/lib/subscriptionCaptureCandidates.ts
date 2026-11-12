import { Prisma, type PrismaClient, type Subscription } from '@prisma/client';
import { effectiveCapture } from './captureReview';
import { normalizeMerchant } from './captureParsers';
import { captureHash } from './captureProtocol';
import { moneyInputSchema } from './financialValidation';

export type ChargePayment = { date: string; amount: string | number; paymentMethod: 'CASH' | 'CARD'; cardId: string | null };

// Coincidencias para revisión personal, nunca prueba suficiente de identidad.
export async function subscriptionCaptureCandidates(db: PrismaClient | Prisma.TransactionClient, userId: string,
  subscription: Pick<Subscription, 'id' | 'cardId' | 'paymentMethod'>, payment: ChargePayment) {
  if (payment.paymentMethod !== 'CARD' || !payment.cardId) return { candidates: [], candidateKey: captureHash('[]') };
  const day = new Date(`${payment.date}T00:00:00Z`).getTime();
  const expenses = await db.dailyExpense.findMany({ where: {
    userId, paymentMethod: 'CARD', cardId: payment.cardId, subscriptionId: null, subscriptionCharge: null,
    date: { gte: new Date(day - 3 * 86400000), lt: new Date(day + 4 * 86400000) },
    captureMovements: { some: { userId, status: { in: ['REGISTERED', 'LINKED'] } } },
  }, include: { card: { select: { name: true } }, captureMovements: {
    where: { userId, status: { in: ['REGISTERED', 'LINKED'] } }, select: { proposal: true, correction: true },
  } }, orderBy: [{ date: 'asc' }, { id: 'asc' }] });
  const rules = await db.captureMerchantRule.findMany({ where: { userId, cardId: payment.cardId } });
  const candidates = expenses.flatMap(expense => {
    const proposals = expense.captureMovements.map(effectiveCapture);
    const merchants = [...new Set(proposals.map(p => normalizeMerchant(p.merchant)).filter(Boolean))];
    const knownSubscription = rules.some(rule => rule.subscriptionId === subscription.id && merchants.includes(rule.merchant));
    if (!expense.amount.equals(payment.amount) && !knownSubscription) return [];
    const date = expense.date.toISOString().slice(0, 10);
    const merchant = merchants.length === 1 ? merchants[0]! : null;
    const rule = rules.find(row => row.merchant === merchant);
    const canLink = expense.refundOriginalAmount === null && expense.amount.gt(0) && !expense.personId
      && !expense.receivableAccountId && !expense.payableAccountId && expense.cashContributionAmount.isZero();
    const canRemember = canLink && Boolean(merchant && merchant.length <= 200) && subscription.paymentMethod === 'CARD' && subscription.cardId === expense.cardId
      && (!rule?.subscriptionId || rule.subscriptionId === subscription.id)
      && expense.captureMovements.every(movement => !movement.correction)
      && proposals.every(p => p.currency === 'MXN' && p.cardId === expense.cardId && p.date === date
        && p.amount && moneyInputSchema.safeParse(p.amount).success && new Prisma.Decimal(p.amount).equals(expense.amount));
    return [{ expenseId: expense.id, concept: expense.concept, date, amount: Number(expense.amount),
      cardName: expense.card?.name || 'Tarjeta', merchant, canLink, canRemember, updatedAt: expense.updatedAt.toISOString() }];
  });
  return { candidates, candidateKey: captureHash(JSON.stringify({ subscriptionId: subscription.id, payment, candidates })) };
}
