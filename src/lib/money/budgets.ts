import type { CalculationData } from './types';
import type { PaymentMix } from './persisted';
import { cents } from '@/lib/money/sources';
import { day } from '@/lib/money/dates';

// Reparte centavos enteros sin perderlos, incluso con importes grandes.
export function allocateBudgetCents(total: number, weights: number[]) {
  const sum = weights.reduce((value, weight) => value + BigInt(weight), 0n);
  if (!sum) return weights.map(() => 0);
  const rows = weights.map((weight, index) => {
    const product = BigInt(total) * BigInt(weight);
    return { index, value: Number(product / sum), remainder: product % sum };
  });
  let remaining = total - rows.reduce((value, row) => value + row.value, 0);
  for (const row of [...rows].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1)) {
    if (!remaining) break;
    row.value++; remaining--;
  }
  return rows.map(row => row.value);
}

// Lo adelantado a otra persona mantiene toda su salida real de dinero, pero
// no consume el presupuesto personal. Un adelanto parcial se reparte por
// importe entre los gastos vinculados; no depende de cuándo sea reembolsado.
export function personalExpenseAmounts(data: CalculationData) {
  const result = new Map(data.expenses.map(expense => [expense.id, Math.max(0, cents(expense.amount) - cents(expense.cashContributionAmount))]));
  for (const receivable of data.receivables) {
    const expenses = data.expenses.filter(expense => expense.receivableAccountId === receivable.id).sort((a, b) => a.id.localeCompare(b.id));
    if (!expenses.length) continue;
    const weights = expenses.map(expense => Math.max(0, cents(expense.amount)));
    const total = weights.reduce((sum, value) => sum + value, 0);
    const recovered = allocateBudgetCents(Math.min(total, Math.max(0, cents(receivable.originalAmount))), weights);
    expenses.forEach((expense, index) => result.set(expense.id, Math.min(result.get(expense.id)!, weights[index]! - recovered[index]!)));
  }
  return result;
}

export function budgetExpenses(data: CalculationData, categoryId: string | null) {
  const personal = personalExpenseAmounts(data);
  const linked = new Set(data.routes.filter(route => route.planId && route.key.startsWith('expense:')).map(route => route.key.slice(8)));
  return data.expenses.filter(expense => expense.categoryId === categoryId && !expense.subscriptionId && !expense.payableAccountId && !linked.has(expense.id))
    .map(expense => ({ ...expense, personalCents: personal.get(expense.id) || 0 })).filter(expense => expense.personalCents > 0);
}

export function buildBudgetPaymentMix(data: CalculationData, categoryId: string | null | undefined, referenceMonths: string[]) {
  const expenses = budgetExpenses(data, categoryId ?? null).filter(expense => referenceMonths.includes(day(expense.date).slice(0, 7)));
  let cashWeight = 0;
  const cardWeights = new Map<string, number>();
  for (const expense of expenses) {
    if (expense.paymentMethod === 'CARD') {
      if (!expense.cardId || !data.cards.some(card => card.id === expense.cardId)) throw new Error('Hay gastos de crédito sin tarjeta en el historial seleccionado.');
      cardWeights.set(expense.cardId, (cardWeights.get(expense.cardId) || 0) + expense.personalCents);
    } else cashWeight += expense.personalCents;
  }
  const cards = [...cardWeights].sort(([a], [b]) => a.localeCompare(b)).map(([cardId, weight]) => ({ cardId, weight }));
  if (!cashWeight && !cards.length) throw new Error('No hay gastos personales de esta categoría en los meses seleccionados.');
  return { version: 1, referenceMonths: [...new Set(referenceMonths)].sort(), cashWeight, cards, sampleCount: expenses.length };
}

export function budgetPaymentParts(value: number, mix: PaymentMix) {
  const weights = [mix.cashWeight, ...mix.cards.map(card => card.weight)];
  const values = allocateBudgetCents(value, weights);
  return [{ cardId: null, cents: values[0]! }, ...mix.cards.map((card, index) => ({ cardId: card.cardId, cents: values[index + 1]! }))].filter(part => part.cents);
}
