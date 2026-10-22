import { z } from "zod";

const MAX_AMOUNT = 9999999999.99;

export function getBalanceToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function moneyField({ signed = false } = {}) {
  return z.union([z.string(), z.number()])
    .refine((value) => (signed ? /^-?\d+(?:\.\d{1,2})?$/ : /^\d+(?:\.\d{1,2})?$/).test(String(value).trim()), {
      message: signed ? "Ingresa un importe con hasta dos decimales." : "Ingresa un importe de cero o mayor, con hasta dos decimales.",
    })
    .transform(Number)
    .refine((value) => Number.isFinite(value) && Math.abs(value) <= MAX_AMOUNT, "El importe es demasiado grande.");
}

export function creditBalanceSchema(today = getBalanceToday()) {
  return z.object({
    creditLimit: moneyField(),
    usedBalance: moneyField({ signed: true }),
    balanceAsOf: z.string().refine((value) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1900-01-01" || value > today) return false;
      const date = new Date(`${value}T00:00:00.000Z`);
      return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
    }, "Elige una fecha válida que no sea futura."),
  });
}

// La ausencia de una captura no equivale a una tarjeta sin deuda.
export function getCardBalance(card) {
  const hasBalance = card.creditLimit != null && card.usedBalance != null && Boolean(card.balanceAsOf);
  if (!hasBalance) return { hasBalance: false };
  const limitCents = Math.round(Number(card.creditLimit) * 100);
  const usedCents = Math.round(Number(card.usedBalance) * 100);
  if (!Number.isSafeInteger(limitCents) || limitCents < 0 || !Number.isSafeInteger(usedCents)) return { hasBalance: false };
  return {
    hasBalance: true,
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

export function summarizeCardBalances(cards) {
  const balances = cards.map(getCardBalance).filter((balance) => balance.hasBalance);
  const total = (key) => balances.length ? balances.reduce((sum, balance) => sum + Math.round(balance[key] * 100), 0) / 100 : null;
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
