import { expenseHistoryQuery, readExpenseHistory } from "@/lib/expenseHistory";
import type { Prisma } from "@prisma/client";
import { getDebtAccountState } from "@/lib/calculations/debtAccounts";
import { apiResponse as NextResponse, requireApiUser, apiAccessErrorResponse } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";

const expenseSelect = {
  reconciledAt: true,
  captureMovements: { select: { id: true, events: { select: { sourcePackage: true } } } },
  reconciliationStatus: true,
  id: true,
  userId: true,
  date: true,
  paymentMethod: true,
  cardId: true,
  debitAccountId: true,
  debitAccount: { select: { id: true, name: true } },
  concept: true,
  amount: true,
  refundOriginalAmount: true,
  cashContributionAmount: true,
  categoryId: true,
  notes: true,
  personId: true,
  receivableAccountId: true,
  payableAccountId: true,
  subscriptionId: true,
  createdAt: true,
  updatedAt: true,
  card: {
    select: {
      id: true,
      name: true,
    },
  },
  category: {
    select: {
      id: true,
      name: true,
    },
  },
  person: {
    select: {
      id: true,
      name: true,
    },
  },
  receivableAccount: {
    select: {
      id: true,
      concept: true,
    },
  },
  payableAccount: {
    select: {
      id: true,
      concept: true,
    },
  },
  subscription: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.DailyExpenseSelect;

const receivableSelect = {
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
  person: {
    select: {
      id: true,
      name: true,
    },
  },
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

const payableSelect = {
  accountType: true,
  currentBalance: true,
  id: true,
  userId: true,
  personId: true,
  concept: true,
  originalAmount: true,
  originDate: true,
  expectedMonthlyPayment: true,
  expectedDate: true,
  notes: true,
  status: true,
  originType: true,
  originId: true,
  createdAt: true,
  updatedAt: true,
  person: {
    select: {
      id: true,
      name: true,
    },
  },
  dailyExpenses: {
    select: {
      id: true,
      date: true,
      concept: true,
      amount: true,
      loanPrincipalAmount: true,
    },
  },
} satisfies Prisma.PayableAccountSelect;

const subscriptionSelect = {
  id: true,
  userId: true,
  name: true,
  amount: true,
  paymentMethod: true,
  cardId: true,
  categoryId: true,
  chargeDay: true,
  frequencyMonths: true,
  startMonth: true,
  startYear: true,
  isActive: true,
  deactivatedAt: true,
  createdAt: true,
  updatedAt: true,
  card: {
    select: {
      id: true,
      name: true,
    },
  },
  category: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.SubscriptionSelect;

function formatReceivable(item: Prisma.ReceivableAccountGetPayload<{ select: typeof receivableSelect }>) {
  return { ...item, ...getDebtAccountState(item, item.incomes) };
}

function formatPayable(item: Prisma.PayableAccountGetPayload<{ select: typeof payableSelect }>) {
  return { ...item, ...getDebtAccountState(item, item.dailyExpenses) };
}

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    const userId = user.id;
    const { searchParams } = new URL(request.url);
    let query;
    try { query = expenseHistoryQuery(searchParams); }
    catch { return NextResponse.json({ error: "Filtros o paginación no válidos." }, { status: 400 }); }
    const [
      categories,
      people,
      cards,
      history,
      receivables,
      payables,
      subscriptions,
      moneyAccounts,
    ] = await Promise.all([
      prisma.category.findMany({
        where: { userId },
        select: {
          id: true,
          userId: true,
          name: true,
          createdAt: true,
        },
        orderBy: { name: "asc" },
      }),
      prisma.person.findMany({
        where: { userId },
        select: {
          id: true,
          userId: true,
          name: true,
          notes: true,
          createdAt: true,
        },
        orderBy: { name: "asc" },
      }),
      prisma.card.findMany({
        where: { userId },
        select: {
          id: true,
          userId: true,
          name: true,
          usualCutDay: true,
          usualDueDay: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { name: "asc" },
      }),
      readExpenseHistory(prisma, userId, query, expenseSelect),
      prisma.receivableAccount.findMany({
        where: { userId },
        select: receivableSelect,
        orderBy: [
          { status: "asc" },
          { originDate: "desc" },
          { createdAt: "desc" },
        ],
      }),
      prisma.payableAccount.findMany({
        where: { userId },
        select: payableSelect,
        orderBy: [
          { status: "asc" },
          { expectedDate: "asc" },
          { originDate: "desc" },
          { createdAt: "desc" },
        ],
      }),
      prisma.subscription.findMany({
        where: { userId },
        select: subscriptionSelect,
        orderBy: [{ chargeDay: "asc" }, { name: "asc" }],
      }),
      prisma.moneyAccount.findMany({ where: { userId }, select: { id: true, name: true, kind: true }, orderBy: { name: "asc" } }),
    ]);

    return NextResponse.json({
      categories,
      people,
      cards,
      ...history,
      receivables: receivables.map(formatReceivable),
      payables: payables.map(formatPayable),
      subscriptions,
      moneyAccounts,
    });
  } catch (error) {
    const accessResponse = apiAccessErrorResponse(error);
    if (accessResponse) return accessResponse;
    console.error("Error loading expenses bootstrap:", error);

    return NextResponse.json(
      { error: "No se pudieron cargar los datos de gastos." },
      { status: 500 },
    );
  }
}
