import { Prisma } from "@prisma/client";
import { captureParsers } from "@/lib/captureParsers";

// Presentation buckets only. They never change interpretation or posting rules.
const refundKeys = captureParsers.filter(row => row.refundOnly).map(row => row.key);
const paymentKeys = captureParsers.filter(row => row.paymentOnly).map(row => row.key);
const expenseKeys = captureParsers.filter(row => !row.refundOnly && !row.paymentOnly && row.key !== "bbva.account-charge.es.v1").map(row => row.key);
const financialKeys = [...refundKeys, ...paymentKeys, ...expenseKeys];
const unclassified = { OR: [{ parserKey: null }, { parserKey: { notIn: financialKeys } }] };
const resolvedExpense = { OR: [{ expenseId: { not: null } }, { installmentPurchaseId: { not: null } }, { AND: [{ correction: { not: Prisma.DbNull } }, { correction: { not: Prisma.JsonNull } }] }] };
const expense = { OR: [{ parserKey: { in: expenseKeys } }, { AND: [unclassified, resolvedExpense] }] };
const other = { AND: [unclassified, { expenseId: null, installmentPurchaseId: null, OR: [{ correction: { equals: Prisma.DbNull } }, { correction: { equals: Prisma.JsonNull } }] }] };

export const captureKinds = ["PENDING", "EXPENSE", "PAYMENT", "REFUND", "OTHER"];
export function captureKindWhere(kind) {
  if (kind === "REFUND") return { parserKey: { in: refundKeys } };
  if (kind === "PAYMENT") return { parserKey: { in: paymentKeys } };
  if (kind === "EXPENSE") return expense;
  if (kind === "OTHER") return other;
  if (kind === "PENDING") return { AND: [{ status: { in: ["REVIEW", "OBSERVED"] } }, { OR: [expense, { parserKey: { in: [...paymentKeys, ...refundKeys] } }] }] };
  return {};
}

export function captureMovementKind(row) {
  if (refundKeys.includes(row.parserKey)) return "REFUND";
  if (paymentKeys.includes(row.parserKey)) return "PAYMENT";
  if (expenseKeys.includes(row.parserKey) || row.expenseId || row.installmentPurchaseId || row.correction) return "EXPENSE";
  return "OTHER";
}
