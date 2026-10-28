import type { Prisma } from '@prisma/client';

export async function loadMoneyData(db: Prisma.TransactionClient, userId: string) {
  const where = { userId };
  // Una transacción comparte una sola conexión pg; sus consultas se esperan
  // en orden para no acumular llamadas concurrentes sobre ese mismo cliente.
  return {
    accounts: await db.moneyAccount.findMany({ where, orderBy: { createdAt: 'asc' }, include: { reconciliations: { orderBy: { createdAt: 'desc' } } } }),
    routes: await db.moneyRoute.findMany({ where }),
    plans: await db.moneyPlan.findMany({ where, include: { occurrences: true } }),
    transfers: await db.moneyTransfer.findMany({ where }),
    withdrawals: await db.moneyWithdrawal.findMany({ where }),
    cards: await db.card.findMany({ where }),
    cycles: await db.cardCycle.findMany({ where, include: { card: true, credits: { include: { income: true } }, payments: true, moneyPayments: true } }),
    incomes: await db.income.findMany({ where, orderBy: { date: 'desc' } }),
    expenses: await db.dailyExpense.findMany({ where, include: { subscriptionCharge: true } }),
    subscriptions: await db.subscription.findMany({ where, include: { charges: true, dailyExpenses: { include: { subscriptionCharge: true } } } }),
    purchases: await db.installmentPurchase.findMany({ where }),
    receivables: await db.receivableAccount.findMany({ where, include: { incomes: true, person: true } }),
    payables: await db.payableAccount.findMany({ where, include: { dailyExpenses: true, person: true } }),
    incomeTypes: await db.incomeType.findMany({ where }),
    categories: await db.category.findMany({ where })
  };
}

export type MoneyData = Awaited<ReturnType<typeof loadMoneyData>>;
