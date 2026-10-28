import type { MoneyValue } from './calculations/types';
// El cargo se conserva completo; las aportaciones recibidas reducen solo el gasto personal.
export function expenseCents(value: unknown) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100);
}

export function getPersonalExpenseAmount(expense: { amount: MoneyValue; cashContributionAmount?: MoneyValue }) {
  return (expenseCents(expense.amount) - expenseCents(expense.cashContributionAmount)) / 100;
}

export function sumPersonalExpenses(expenses: { amount: MoneyValue; cashContributionAmount?: MoneyValue }[]) {
  return expenses.reduce((sum, expense) => sum + expenseCents(expense.amount)
    - expenseCents(expense.cashContributionAmount), 0) / 100;
}

export function getCashContributionError({ amount, cashContributionAmount = 0, createReceivable, receivableAccountId, payableAccountId }: { amount?: unknown; cashContributionAmount?: unknown; createReceivable?: unknown; receivableAccountId?: unknown; payableAccountId?: unknown }) {
  if (!["number", "string"].includes(typeof cashContributionAmount)
    || !/^\d+(?:\.\d{1,2})?$/.test(String(cashContributionAmount))
    || !Number.isSafeInteger(expenseCents(cashContributionAmount))) {
    return "La aportación debe ser un monto de cero o más, con hasta dos decimales.";
  }
  if (Number(cashContributionAmount) === 0) return null;
  if (!["number", "string"].includes(typeof amount)
    || !/^\d+(?:\.\d{1,2})?$/.test(String(amount))
    || !Number.isSafeInteger(expenseCents(amount)) || Number(amount) <= 0) {
    return "El total pagado debe ser positivo y tener hasta dos decimales.";
  }
  if (expenseCents(cashContributionAmount) > expenseCents(amount)) {
    return "La aportación no puede superar el total pagado.";
  }
  if (createReceivable || receivableAccountId || payableAccountId) {
    return "La aportación ya recibida se registra en un gasto sin cuentas por cobrar o pagar vinculadas.";
  }
  return null;
}
