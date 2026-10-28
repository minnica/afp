import type { Prisma } from '@prisma/client';
import type { CreditCycle } from './types';
// La aplicación al corte es independiente del importe completo del ingreso.
export const cycleCreditSelect = {
  id: true,
  userId: true,
  cycleId: true,
  incomeId: true,
  amount: true,
  notes: true,
  income: {
    select: {
      id: true,
      userId: true,
      concept: true,
      date: true,
      amount: true,
    },
  },
} satisfies Prisma.CardCycleCreditSelect;

export function getCycleCreditAmounts(cycle: CreditCycle, grossCalculatedAmount: number) {
  const includedCredits = [];
  const seenIncomes = new Set();

  for (const credit of cycle.credits || []) {
    const amount = Number(credit.amount);
    const incomeAmount = Number(credit.income?.amount);
    if (
      credit.userId !== cycle.userId ||
      credit.cycleId !== cycle.id ||
      credit.incomeId !== credit.income?.id ||
      credit.income?.userId !== cycle.userId ||
      seenIncomes.has(credit.incomeId) ||
      !Number.isFinite(amount) || amount <= 0 ||
      !Number.isFinite(incomeAmount) || amount > incomeAmount ||
      Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001
    ) {
      throw new Error("Bonificación de corte inválida o duplicada.");
    }
    seenIncomes.add(credit.incomeId);
    includedCredits.push({
      id: credit.id,
      incomeId: credit.incomeId,
      concept: credit.income.concept,
      date: credit.income.date,
      amount,
      incomeAmount,
      notes: credit.notes,
    });
  }

  const creditsCents = includedCredits.reduce(
    (sum, credit) => sum + Math.round(credit.amount * 100), 0,
  );
  const grossCents = Math.round(grossCalculatedAmount * 100);
  if (creditsCents > grossCents && includedCredits.length > 0) {
    throw new Error("Las bonificaciones aplicadas exceden los cargos del corte.");
  }

  return {
    grossCalculatedAmount,
    creditsAmount: creditsCents / 100,
    // Sin bonificaciones se conserva el cálculo anterior, incluidas sus fracciones.
    calculatedAmount: includedCredits.length > 0
      ? (grossCents - creditsCents) / 100
      : grossCalculatedAmount,
    includedCredits,
  };
}
