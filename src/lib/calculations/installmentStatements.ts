import { jsonRecords } from '../financialJson';
export interface InstallmentStatement extends Record<string, unknown> { year: number; month: number; paymentNumber: number; amount: unknown; remainingBalance: unknown }
type Purchase = { months: number; statementReconciliations?: unknown };
type Cycle = { year: number; month: number };
// Referencias verificadas por compra y mes de corte. La fecha de compra se
// conserva: una parcialidad bancaria puede empezar en un corte posterior.
export function getInstallmentStatements(purchase: Purchase) {
  const records = purchase.statementReconciliations;
  if (!Array.isArray(records)) return [];

  return jsonRecords(records)
    .filter((record): record is InstallmentStatement => {
      if (!record || typeof record !== "object") return false;
      return (
        typeof record.year === "number" && Number.isInteger(record.year) &&
        record.year >= 1900 &&
        typeof record.month === "number" && Number.isInteger(record.month) &&
        record.month >= 1 &&
        record.month <= 12 &&
        typeof record.paymentNumber === "number" && Number.isInteger(record.paymentNumber) &&
        record.paymentNumber >= 1 &&
        record.paymentNumber <= Number(purchase.months) &&
        record.amount !== null &&
        record.amount !== "" &&
        Number.isFinite(Number(record.amount)) &&
        Number(record.amount) > 0 &&
        record.remainingBalance !== null &&
        record.remainingBalance !== "" &&
        Number.isFinite(Number(record.remainingBalance)) &&
        Number(record.remainingBalance) >= 0
      );
    })
    .sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month));
}

export function getLatestInstallmentStatement(purchase: Purchase) {
  return getInstallmentStatements(purchase).at(-1) || null;
}

export function getInstallmentStatementForCycle(purchase: Purchase, cycle: Cycle) {
  return (
    getInstallmentStatements(purchase).find(
      (record) => record.year === cycle.year && record.month === cycle.month,
    ) || null
  );
}

export function getStatementCycleNumber(purchase: Purchase, cycle: Cycle) {
  const statements = getInstallmentStatements(purchase);
  if (!statements.length) return null;
  const targetIndex = cycle.year * 12 + cycle.month - 1;
  const reference =
    statements.findLast(
      (record) => record.year * 12 + record.month - 1 <= targetIndex,
    ) || statements[0]!;
  const referenceIndex = reference.year * 12 + reference.month - 1;
  return reference.paymentNumber + targetIndex - referenceIndex;
}
