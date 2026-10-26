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
};

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
};

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
};

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
};

function parseStartDate(dateValue) {
  if (!dateValue) return null;
  return new Date(`${dateValue}T00:00:00.000Z`);
}

function parseEndDate(dateValue) {
  if (!dateValue) return null;
  return new Date(`${dateValue}T23:59:59.999Z`);
}

function getAvailableMonths(expenseDates) {
  const months = new Set();

  expenseDates.forEach((expense) => {
    const date = new Date(expense.date);

    if (Number.isNaN(date.getTime())) return;

    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    months.add(`${year}-${month}`);
  });

  return Array.from(months).sort().reverse();
}

function formatReceivable(item) {
  return { ...item, ...getDebtAccountState(item, item.incomes) };
}

function formatPayable(item) {
  return { ...item, ...getDebtAccountState(item, item.dailyExpenses) };
}

export async function GET(request) {
  try {
    const user = await requireApiUser(request);
    const userId = user.id;
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");


    const expensesWhere = { userId };

    if (startDate || endDate) {
      expensesWhere.date = {};

      if (startDate) {
        expensesWhere.date.gte = parseStartDate(startDate);
      }

      if (endDate) {
        expensesWhere.date.lte = parseEndDate(endDate);
      }
    }

    const [
      categories,
      people,
      cards,
      expenses,
      expenseDates,
      receivables,
      payables,
      subscriptions,
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
      prisma.dailyExpense.findMany({
        where: expensesWhere,
        select: expenseSelect,
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      }),
      prisma.dailyExpense.findMany({
        where: { userId },
        select: {
          date: true,
        },
        orderBy: [{ date: "desc" }],
      }),
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
    ]);

    return NextResponse.json({
      categories,
      people,
      cards,
      expenses,
      availableMonths: getAvailableMonths(expenseDates),
      receivables: receivables.map(formatReceivable),
      payables: payables.map(formatPayable),
      subscriptions,
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
