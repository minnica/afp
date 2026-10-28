import type { MoneyTransactionRunner } from './money/service';
import type { Prisma } from '@prisma/client';
import { getDebtAccountState } from "@/lib/calculations/debtAccounts";

// Todas las mutaciones de abonos/principal toman este bloqueo ANTES de leer.
// Serializar por propietario también cubre traslados entre cuentas y dos
// ediciones del mismo abono. No bloquea las operaciones de otros usuarios.
// Solo usar dentro de una transacción Prisma (aislamiento ReadCommitted).
export async function lockDebtAccounts(tx: Prisma.TransactionClient, userId: string) {
  const key = `afp:debt-accounts:${userId}`;
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

export async function runDebtAccountOperation<T>(db: MoneyTransactionRunner, userId: string, operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return db.$transaction(async tx => {
    await lockDebtAccounts(tx, userId);
    return operation(tx);
  }, { isolationLevel: "ReadCommitted" });
}

export async function refreshDebtAccount(tx: Prisma.TransactionClient, userId: string, kind: "payable" | "receivable", id: string | null | undefined) {
  if (!id) return;
  const account = await (kind === "payable" ? tx.payableAccount.findUnique({ where: { id, userId } }) : tx.receivableAccount.findUnique({ where: { id, userId } }));
  if (!account) return;
  const payments = await (kind === "payable" ? tx.dailyExpense.findMany({ where: { payableAccountId: id, userId }, select: { amount: true, loanPrincipalAmount: true } }) : tx.income.findMany({ where: { receivableAccountId: id, userId }, select: { amount: true } }));
  const state = getDebtAccountState(account, payments);
  if (account.status !== state.status) {
    if (kind === "payable") await tx.payableAccount.update({ where: { id, userId }, data: { status: state.status } });
    else await tx.receivableAccount.update({ where: { id, userId }, data: { status: state.status } });
  }
  return state;
}
