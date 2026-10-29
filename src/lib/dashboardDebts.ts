import type { PrismaClient, Prisma } from '@prisma/client';
import { mexicoDayNumber } from './financialDates';

// Los abonos históricos se suman en PostgreSQL. Solo los cobros del mes actual
// viajan a Node, pues son los que resuelven los avisos del mes.
export async function dashboardReceivables(db: PrismaClient, userId: string, now: Date) {
  const amounts = await db.$queryRaw<{ id: string; totalPaid: Prisma.Decimal }[]>`
    SELECT a.id, coalesce(sum(round(i.amount, 2)), 0) AS "totalPaid"
    FROM receivable_accounts a LEFT JOIN incomes i ON i."receivableAccountId" = a.id AND i."userId" = ${userId}
    WHERE a."userId" = ${userId} AND a.status <> 'CANCELLED'
    GROUP BY a.id HAVING round(a."originalAmount", 2) + round(a."balanceAdjustment", 2) > coalesce(sum(round(i.amount, 2)), 0)`;
  const paid = new Map(amounts.map(item => [item.id, item.totalPaid]));
  const day = new Date(mexicoDayNumber(now));
  const accounts = await db.receivableAccount.findMany({ where: { userId, id: { in: amounts.map(item => item.id) } },
    select: { id: true, personId: true, concept: true, originalAmount: true, balanceAdjustment: true, originDate: true,
      expectedMonthlyPayment: true, expectedChargeDays: true, status: true, person: { select: { id: true, name: true } },
      incomes: { where: { userId, date: { gte: new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1)), lt: new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 1)) } }, select: { id: true, date: true, amount: true } },
    }, orderBy: [{ status: 'asc' }, { originDate: 'desc' }],
  });
  return accounts.map(account => ({ ...account, totalPaid: paid.get(account.id) || 0 }));
}
export async function dashboardPayables(db: PrismaClient, userId: string) {
  const amounts = await db.$queryRaw<{ id: string; amount: Prisma.Decimal; principal: Prisma.Decimal }[]>`
    SELECT a.id, coalesce(sum(round(e.amount, 2)), 0) AS amount, coalesce(sum(round(e."loanPrincipalAmount", 2)), 0) AS principal
    FROM payable_accounts a LEFT JOIN daily_expenses e ON e."payableAccountId" = a.id AND e."userId" = ${userId}
    WHERE a."userId" = ${userId} AND a.status <> 'CANCELLED' AND a."expectedDate" IS NOT NULL
    GROUP BY a.id HAVING (CASE WHEN a."accountType" = 'LOAN' AND a."currentBalance" IS NOT NULL THEN round(a."currentBalance", 2)
      ELSE round(a."originalAmount", 2) - coalesce(sum(round(CASE WHEN a."accountType" = 'LOAN' THEN e."loanPrincipalAmount" ELSE e.amount END, 2)), 0) END) > 0`;
  const paid = new Map(amounts.map(item => [item.id, item]));
  const accounts = await db.payableAccount.findMany({ where: { userId, id: { in: amounts.map(item => item.id) } },
    select: { id: true, concept: true, originalAmount: true, accountType: true, currentBalance: true, expectedDate: true, status: true, person: { select: { name: true } } } });
  return accounts.map(account => ({ ...account, dailyExpenses: [{ amount: paid.get(account.id)!.amount, loanPrincipalAmount: paid.get(account.id)!.principal }] }));
}
