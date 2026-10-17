import { Prisma } from "@prisma/client";

// Redondear cada partida a centavos también cubre datos históricos con más
// decimales, sin que residuos de punto flotante determinen la liquidación.
export function getDebtAccountState(account, payments) {
  const cents = value => new Prisma.Decimal(value || 0).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).mul(100);
  const principalCents = cents(account.originalAmount);
  const paidCents = payments.reduce((sum, payment) => sum.add(cents(payment.amount)), new Prisma.Decimal(0));
  const balanceCents = principalCents.sub(paidCents);
  return {
    paidAmount: paidCents.div(100).toNumber(),
    // Se conserva el saldo firmado del contrato anterior; negativo = excedente.
    pendingBalance: balanceCents.div(100).toNumber(),
    excessAmount: balanceCents.isNegative() ? balanceCents.neg().div(100).toNumber() : 0,
    status: account.status === "CANCELLED" ? "CANCELLED" : balanceCents.lte(0) ? "PAID_OFF" : "ACTIVE",
  };
}
