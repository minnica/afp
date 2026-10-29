import type { MoneyValue, DateValue } from './calculations/types';
import { z } from "zod";
import { isCalendarDay, moneyInputSchema } from './financialValidation';

export function getBalanceToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function moneyField({ signed = false } = {}) {
  return moneyInputSchema.transform(Number)
    .refine(value => signed || value >= 0, "Ingresa un importe de cero o mayor, con hasta dos decimales.");
}

export function creditBalanceSchema(today = getBalanceToday()) {
  return z.object({
    creditLimit: moneyField(),
    usedBalance: moneyField({ signed: true }),
    balanceAsOf: z.string().refine((value) => {
      return isCalendarDay(value) && value >= "1900-01-01" && value <= today;
    }, "Elige una fecha válida que no sea futura."),
  });
}

// La ausencia de una captura no equivale a una tarjeta sin deuda.
export function getCardBalance(card: { creditLimit?: MoneyValue; usedBalance?: MoneyValue; balanceAsOf?: DateValue | null; balanceTrackingStatus?: string }) {
  const hasBalance = card.creditLimit != null && card.usedBalance != null && Boolean(card.balanceAsOf);
  if (!hasBalance) return { hasBalance: false as const };
  const limitCents = Math.round(Number(card.creditLimit) * 100);
  const usedCents = Math.round(Number(card.usedBalance) * 100);
  if (!Number.isSafeInteger(limitCents) || limitCents < 0 || !Number.isSafeInteger(usedCents)) return { hasBalance: false as const };
  return {
    hasBalance: true as const,
    creditLimit: limitCents / 100,
    usedBalance: usedCents / 100,
    debt: Math.max(usedCents, 0) / 100,
    creditBalance: Math.max(-usedCents, 0) / 100,
    availableCredit: Math.max(limitCents - usedCents, 0) / 100,
    overLimit: Math.max(usedCents - limitCents, 0) / 100,
    utilization: limitCents > 0 ? Math.max(usedCents, 0) / limitCents * 100 : null,
    balanceAsOf: String(card.balanceAsOf instanceof Date ? card.balanceAsOf.toISOString() : card.balanceAsOf).slice(0, 10),
    automatic: card.balanceTrackingStatus === "ACTIVE",
  };
}

export function summarizeCardBalances(cards: Parameters<typeof getCardBalance>[0][]) {
  const balances = cards.map(getCardBalance).filter((balance) => balance.hasBalance);
  const total = (key: "debt" | "creditLimit" | "availableCredit" | "creditBalance") => balances.length ? balances.reduce((sum, balance) => sum + Math.round(balance[key] * 100), 0) / 100 : null;
  const dates = balances.map((balance) => balance.balanceAsOf).sort();
  return {
    totalCards: cards.length,
    capturedCards: balances.length,
    missingCards: cards.length - balances.length,
    automaticCards: balances.filter((balance) => balance.automatic).length,
    debt: total("debt"),
    creditLimit: total("creditLimit"),
    availableCredit: total("availableCredit"),
    creditBalance: total("creditBalance"),
    oldestDate: dates[0] || null,
    newestDate: dates.at(-1) || null,
  };
}
