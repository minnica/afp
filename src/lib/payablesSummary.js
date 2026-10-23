// Los saldos de la API ya están conciliados y redondeados a centavos.
// Un reembolso pendiente compensa la deuda neta, nunca el saldo del banco.
export function getPayablesSummary(payables) {
  const cents = (value) => Math.round(Number(value || 0) * 100);
  let loanCents = 0;
  let otherCents = 0;
  let originalCents = 0;
  let paidCents = 0;
  const reimbursements = new Map();

  for (const payable of payables) {
    if (payable.status === "CANCELLED") continue;

    originalCents += cents(payable.originalAmount);
    paidCents += cents(payable.paidAmount);
    const pendingCents = Math.max(0, cents(payable.pendingBalance));
    if (payable.accountType === "LOAN") loanCents += pendingCents;
    else otherCents += pendingCents;

    const account = payable.reimbursementReceivable;
    if (payable.accountType !== "LOAN" || !account || account.status === "CANCELLED") continue;
    const reimbursementCents = Math.max(0, cents(account.pendingBalance));
    // La misma cuenta puede estar vinculada a más de un préstamo.
    // Sigue siendo cobrable aunque el préstamo ya esté liquidado.
    if (reimbursementCents > 0 && !reimbursements.has(account.id)) {
      reimbursements.set(account.id, {
        id: account.id,
        name: account.person?.name || "Persona sin nombre",
        pendingBalance: reimbursementCents / 100,
      });
    }
  }

  const pendingCents = loanCents + otherCents;
  const reimbursementCents = [...reimbursements.values()].reduce(
    (sum, account) => sum + cents(account.pendingBalance), 0,
  );

  return {
    original: originalCents / 100,
    paid: paidCents / 100,
    pending: pendingCents / 100,
    loans: loanCents / 100,
    other: otherCents / 100,
    reimbursements: [...reimbursements.values()],
    toRecover: reimbursementCents / 100,
    own: Math.max(0, pendingCents - reimbursementCents) / 100,
    recoverySurplus: Math.max(0, reimbursementCents - pendingCents) / 100,
  };
}
