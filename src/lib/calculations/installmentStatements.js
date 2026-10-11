// Referencias verificadas por compra y mes de corte. La fecha de compra se
// conserva: una parcialidad bancaria puede empezar en un corte posterior.
export function getInstallmentStatements(purchase) {
  const records = purchase.statementReconciliations;
  if (!Array.isArray(records)) return [];

  return records
    .filter((record) => {
      if (!record || typeof record !== "object") return false;
      return (
        Number.isInteger(record.year) &&
        record.year >= 1900 &&
        Number.isInteger(record.month) &&
        record.month >= 1 &&
        record.month <= 12 &&
        Number.isInteger(record.paymentNumber) &&
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

export function getLatestInstallmentStatement(purchase) {
  return getInstallmentStatements(purchase).at(-1) || null;
}

export function getInstallmentStatementForCycle(purchase, cycle) {
  return (
    getInstallmentStatements(purchase).find(
      (record) => record.year === cycle.year && record.month === cycle.month,
    ) || null
  );
}

export function getStatementCycleNumber(purchase, cycle) {
  const statements = getInstallmentStatements(purchase);
  if (!statements.length) return null;
  const targetIndex = cycle.year * 12 + cycle.month - 1;
  const reference =
    statements.findLast(
      (record) => record.year * 12 + record.month - 1 <= targetIndex,
    ) || statements[0];
  const referenceIndex = reference.year * 12 + reference.month - 1;
  return reference.paymentNumber + targetIndex - referenceIndex;
}
