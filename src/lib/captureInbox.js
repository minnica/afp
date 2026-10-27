import { Prisma } from "@prisma/client";
import { captureParsers } from "@/lib/captureParsers";

// Presentation buckets only. They never change interpretation or posting rules.
const refundKeys = captureParsers.filter(row => row.refundOnly).map(row => row.key);
const paymentKeys = captureParsers.filter(row => row.paymentOnly).map(row => row.key);
const moneyKeys = captureParsers.filter(row => row.moneyOnly).map(row => row.key);
const money = { OR: [{ parserKey: { in: moneyKeys } }, { moneyPosting: { is: { kind: { in: ["TRANSFER", "WITHDRAWAL"] } } } }] };
const expenseKeys = captureParsers.filter(row => !row.moneyOnly && !row.refundOnly && !row.paymentOnly && row.key !== "bbva.account-charge.es.v1").map(row => row.key);
const financialKeys = [...moneyKeys, ...refundKeys, ...paymentKeys, ...expenseKeys];
const unclassified = { OR: [{ parserKey: null }, { parserKey: { notIn: financialKeys } }] };
const resolvedExpense = { OR: [{ originalExpenseId: { not: null } }, { moneyPosting: { is: { kind: "DEBIT_EXPENSE" } } },{ expenseId: { not: null } }, { installmentPurchaseId: { not: null } }, { AND: [{ correction: { not: Prisma.DbNull } }, { correction: { not: Prisma.JsonNull } }] }] };
const expense = { AND: [
  { OR: [{ moneyPosting: null }, { moneyPosting: { is: { kind: "DEBIT_EXPENSE" } } }] },
  { OR: [{ parserKey: { in: expenseKeys } }, { AND: [unclassified, resolvedExpense] }] },
] };
const other = { AND: [unclassified, { moneyPosting: null }, { expenseId: null, installmentPurchaseId: null, OR: [{ correction: { equals: Prisma.DbNull } }, { correction: { equals: Prisma.JsonNull } }] }] };

export const captureKinds = ["PENDING", "EXPENSE", "PAYMENT", "REFUND", "MONEY", "OTHER"];
export function captureKindWhere(kind) {
  if (kind === "MONEY") return money;
  if (kind === "REFUND") return { parserKey: { in: refundKeys } };
  if (kind === "PAYMENT") return { OR: [{ parserKey: { in: paymentKeys } }, { moneyPosting: { is: { kind: "CARD_PAYMENT" } } }] };
  if (kind === "EXPENSE") return expense;
  if (kind === "OTHER") return other;
  if (kind === "PENDING") return { AND: [{ status: { in: ["REVIEW", "OBSERVED"] } }, { OR: [expense, money, { parserKey: { in: [...paymentKeys, ...refundKeys] } }] }] };
  return {};
}

export function captureMovementKind(row) {
  if (row.proposal?.moneyKind === "CARD_PAYMENT") return "PAYMENT";
  if (moneyKeys.includes(row.parserKey) || ["TRANSFER", "WITHDRAWAL"].includes(row.proposal?.moneyKind)) return "MONEY";
  if (row.proposal?.moneyKind === "DEBIT_EXPENSE") return "EXPENSE";
  if (refundKeys.includes(row.parserKey)) return "REFUND";
  if (paymentKeys.includes(row.parserKey)) return "PAYMENT";
  if (expenseKeys.includes(row.parserKey) || row.expenseId || row.installmentPurchaseId || row.correction) return "EXPENSE";
  return "OTHER";
}
