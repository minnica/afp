import type { Prisma } from "@prisma/client";
import { getDebtAccountState } from "@/lib/calculations/debtAccounts";

export const receivableSelect = {
  id: true,
  userId: true,
  personId: true,
  concept: true,
  originalAmount: true,
  balanceAdjustment: true,
  balanceAdjustmentNotes: true,
  originDate: true,
  expectedMonthlyPayment: true,
  expectedChargeDays: true,
  notes: true,
  status: true,
  originType: true,
  originId: true,
  createdAt: true,
  updatedAt: true,
  person: { select: { id: true, name: true } },
  incomes: {
    select: {
      id: true,
      date: true,
      source: true,
      concept: true,
      amount: true,
      notes: true,
    },
  },
} satisfies Prisma.ReceivableAccountSelect;

export function formatReceivable(item: Prisma.ReceivableAccountGetPayload<{ select: typeof receivableSelect }>) {
  return { ...item, ...getDebtAccountState(item, item.incomes) };
}
