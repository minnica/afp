import { getDebtAccountState } from "@/lib/calculations/debtAccounts";

// Todas las mutaciones de abonos/principal toman este bloqueo ANTES de leer.
// Serializar por propietario también cubre traslados entre cuentas y dos
// ediciones del mismo abono. No bloquea las operaciones de otros usuarios.
// Solo usar dentro de una transacción Prisma (aislamiento ReadCommitted).
export async function lockDebtAccounts(tx, userId) {
  const key = `afp:debt-accounts:${userId}`;
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

export async function runDebtAccountOperation(db, userId, operation) {
  return db.$transaction(async tx => {
    await lockDebtAccounts(tx, userId);
    return operation(tx);
  }, { isolationLevel: "ReadCommitted" });
}

export async function refreshDebtAccount(tx, userId, kind, id) {
  if (!id) return;
  const model = kind === "payable" ? "payableAccount" : "receivableAccount";
  const movement = kind === "payable" ? "dailyExpense" : "income";
  const relation = kind === "payable" ? "payableAccountId" : "receivableAccountId";
  const account = await tx[model].findUnique({ where: { id, userId } });
  if (!account) return;
  const payments = await tx[movement].findMany({
    where: { [relation]: id, userId },
    select: { amount: true, ...(kind === "payable" ? { loanPrincipalAmount: true } : {}) },
  });
  const state = getDebtAccountState(account, payments);
  if (account.status !== state.status) {
    await tx[model].update({ where: { id, userId }, data: { status: state.status } });
  }
  return state;
}
