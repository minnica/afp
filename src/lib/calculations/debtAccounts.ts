import type { DebtAccount, DebtPayment, MoneyValue } from './types';
import { Prisma } from "@prisma/client";

// Redondear cada partida a centavos también cubre datos históricos con más
// decimales, sin que residuos de punto flotante determinen la liquidación.
export function getDebtAccountState(account: DebtAccount, payments: readonly DebtPayment[]) {
  const cents = (value: MoneyValue) => new Prisma.Decimal(value || 0).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).mul(100);
  const principalCents = cents(account.originalAmount);
  const isLoan = account.accountType === "LOAN";
  // El saldo conciliado ya incluye los descuentos de nómina anteriores.
  // Ni sus intereses ni los reembolsos de otra persona amortizan capital otra vez.
  const paidCents = payments.reduce((sum, payment) => sum.add(cents(
    isLoan ? payment.loanPrincipalAmount : payment.amount,
  )), new Prisma.Decimal(0));
  const balanceCents = isLoan && account.currentBalance != null
    ? cents(account.currentBalance)
    : principalCents.add(cents(account.balanceAdjustment)).sub(paidCents);
  return {
    // Una conciliación no es dinero recibido ni debe cambiar el total de abonos.
    paidAmount: (isLoan ? principalCents.sub(balanceCents) : paidCents).div(100).toNumber(),
    // Se conserva el saldo firmado del contrato anterior; negativo = excedente.
    pendingBalance: balanceCents.div(100).toNumber(),
    excessAmount: balanceCents.isNegative() ? balanceCents.neg().div(100).toNumber() : 0,
    status: account.status === "CANCELLED" ? "CANCELLED" as const : balanceCents.lte(0) ? "PAID_OFF" as const : "ACTIVE" as const,
  };
}
