import type { PrismaClient, Card } from '@prisma/client';
import type { DateValue, MoneyValue } from './calculations/types';
import { isRecord } from './financialJson';
interface Tracking { version: number; day: string; captureId: string; baseExposureCents: string | number; startedAt: string | number }
type TrackingCard = Pick<Card, 'id' | 'userId'> & { balanceTracking?: unknown; usedBalance?: MoneyValue };
type Movements = Awaited<ReturnType<typeof loadBalanceMovements>>;
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";

const bankDay = (value: DateValue | null | undefined) => value ? new Date(value).toISOString().slice(0, 10) : null;
const cents = (value: MoneyValue) => new Prisma.Decimal(value ?? 0).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).mul(100);

export function isBalanceTrackingValid(tracking: unknown): tracking is Tracking {
  return isRecord(tracking) && tracking.version === 1 && typeof tracking.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(tracking.day)
    && typeof tracking.captureId === "string" && (typeof tracking.baseExposureCents === "string" || typeof tracking.baseExposureCents === "number") && /^-?\d+$/.test(String(tracking.baseExposureCents)) && (typeof tracking.startedAt === "string" || typeof tracking.startedAt === "number") && Number.isFinite(new Date(tracking.startedAt).getTime());
}

// Los pagos son acumulados: comparar exposiciones descuenta solo la diferencia.
// Los cargos anteriores al día base ya están incluidos en el saldo del banco.
export function getCardExposureCents(card: TrackingCard & { balanceTracking: Tracking }, movements: Movements, today: string) {
  const start = card.balanceTracking.day;
  const inPeriod = (value: DateValue | null | undefined) => { const day = bankDay(value); return day && day >= start && day <= today; };
  const effective = (value: DateValue | null | undefined) => { const day = bankDay(value); return day && day <= today; };
  const ownCard = (row: { userId: string; cardId: string | null }) => row.userId === card.userId && row.cardId === card.id;
  let total = new Prisma.Decimal(0);
  for (const expense of movements.expenses) {
    if (ownCard(expense) && expense.paymentMethod === "CARD" && inPeriod(expense.date)) total = total.add(cents(expense.amount));
  }
  for (const purchase of movements.purchases) {
    if (ownCard(purchase) && purchase.status !== "CANCELLED" && inPeriod(purchase.purchaseDate)) total = total.add(cents(purchase.totalAmount));
  }
  for (const cycle of movements.cycles) {
    if (!ownCard(cycle)) continue;
    // A03 reconoce el importe acumulado incluso en históricos sin fecha.
    // Completar esa fecha después no debe convertirlo en un segundo pago.
    if (!cycle.paidAt || effective(cycle.paidAt)) total = total.sub(cents(cycle.paidAmount));
    if (!cycle.postCutCreditDate || effective(cycle.postCutCreditDate)) total = total.sub(cents(cycle.postCutCreditAmount));
  }
  for (const credit of movements.credits) {
    if (credit.userId === card.userId && credit.cycle?.cardId === card.id && effective(credit.income?.date)) total = total.sub(cents(credit.amount));
  }
  return total.toFixed(0);
}

export function createBalanceTracking(card: TrackingCard, movements: Movements, today: string, startedAt = new Date().toISOString(), captureId: string = randomUUID()) {
  const tracking = { version: 1, day: today, startedAt, captureId, baseExposureCents: "0" };
  tracking.baseExposureCents = getCardExposureCents({ ...card, balanceTracking: tracking }, movements, today);
  return tracking;
}

export function getTrackedCard<T extends TrackingCard>(card: T, movements: Movements, today: string) {
  if (!isBalanceTrackingValid(card.balanceTracking) || card.usedBalance == null) {
    return { ...card, balanceTrackingStatus: card.balanceTracking ? "INVALID" : "INACTIVE" };
  }
  const exposure = getCardExposureCents({ ...card, balanceTracking: card.balanceTracking }, movements, today);
  const change = new Prisma.Decimal(exposure).sub(card.balanceTracking.baseExposureCents).div(100);
  return {
    ...card,
    bankUsedBalance: String(card.usedBalance),
    usedBalance: new Prisma.Decimal(card.usedBalance).add(change).toFixed(2),
    balanceAdjustment: change.toFixed(2),
    balanceTrackingStatus: "ACTIVE",
    balanceCalculatedAt: new Date().toISOString(),
  };
}

export async function loadBalanceMovements(tx: Prisma.TransactionClient, userId: string, cards: TrackingCard[], today: string) {
  const active = cards.filter((card): card is TrackingCard & { balanceTracking: Tracking } => isBalanceTrackingValid(card.balanceTracking));
  if (!active.length) return { expenses: [], purchases: [], cycles: [], credits: [] };
  const cardId = { in: active.map((card) => card.id) };
  const earliest = active.map((card) => card.balanceTracking.day).sort()[0];
  const period = { gte: new Date(`${earliest}T00:00:00Z`), lt: new Date(new Date(`${today}T00:00:00Z`).getTime() + 86400000) };
  const [expenses, purchases, cycles, credits] = await Promise.all([
    tx.dailyExpense.findMany({ where: { userId, cardId, paymentMethod: "CARD", date: period }, select: { userId: true, cardId: true, paymentMethod: true, date: true, amount: true } }),
    tx.installmentPurchase.findMany({ where: { userId, cardId, purchaseDate: period }, select: { userId: true, cardId: true, purchaseDate: true, totalAmount: true, status: true } }),
    tx.cardCycle.findMany({ where: { userId, cardId }, select: { userId: true, cardId: true, paidAmount: true, paidAt: true, postCutCreditAmount: true, postCutCreditDate: true } }),
    tx.cardCycleCredit.findMany({ where: { userId, cycle: { userId, cardId } }, select: { userId: true, amount: true, cycle: { select: { cardId: true } }, income: { select: { date: true } } } }),
  ]);
  return { expenses, purchases, cycles, credits };
}

// Un snapshot consistente incluye tarjeta y movimientos del mismo instante.
export async function runBalanceSnapshot<T>(db: PrismaClient, operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await db.$transaction(operation, { isolationLevel: "RepeatableRead" }); }
    catch (error) { if (!isRecord(error) || error.code !== "P2034" || attempt >= 7) throw error; }
  }
}
