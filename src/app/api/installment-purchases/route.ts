import type { Prisma } from "@prisma/client";
import { readFinancialInput } from "@/lib/financialContracts";
import { apiResponse as NextResponse, requireApiUser, apiAccessErrorResponse, requireOwnedReferences, ApiAccessError } from "@/lib/apiAuth";
import { runDebtAccountOperation } from "@/lib/debtAccountService";
import { prisma } from "@/lib/prisma";
import { getLatestInstallmentStatement } from "@/lib/calculations/installmentStatements";

const purchaseSelect = {
  reconciledAt: true,
  captureMovements: { select: { id: true, events: { select: { sourcePackage: true } } } },
  reconciliationStatus: true,
  id: true,
  userId: true,
  cardId: true,
  purchaseDate: true,
  concept: true,
  totalAmount: true,
  months: true,
  manualMonthlyPayment: true,
  statementReconciliations: true,
  initialPaymentsMade: true,
  personId: true,
  receivableAccountId: true,
  categoryId: true,
  notes: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  card: {
    select: {
      id: true,
      name: true,
      usualCutDay: true,
      usualDueDay: true,
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
      person: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.InstallmentPurchaseSelect;

function parseDateInput(dateValue: string | null | undefined) {
  if (!dateValue) return null;
  return new Date(`${dateValue}T12:00:00.000Z`);
}

function formatPurchase(purchase: Prisma.InstallmentPurchaseGetPayload<{ select: typeof purchaseSelect }>) {
  const totalAmount = Number(purchase.totalAmount || 0);
  const months = Number(purchase.months || 0);
  const manualMonthlyPayment = purchase.manualMonthlyPayment
    ? Number(purchase.manualMonthlyPayment)
    : null;

  const calculatedMonthlyPayment = months > 0 ? totalAmount / months : 0;
  const monthlyPaymentUsed =
    manualMonthlyPayment && manualMonthlyPayment > 0
      ? manualMonthlyPayment
      : calculatedMonthlyPayment;

  const paymentsMade = Number(purchase.initialPaymentsMade || 0);
  const remainingMonths = Math.max(months - paymentsMade, 0);
  const remainingBalance = remainingMonths * monthlyPaymentUsed;
  const currentMonth = Math.min(paymentsMade + 1, months);

  const verifiedStatement = getLatestInstallmentStatement(purchase);

  return {
    ...purchase,
    calculatedMonthlyPayment,
    monthlyPaymentUsed,
    currentMonth,
    remainingMonths,
    remainingBalance,
    ...(verifiedStatement
      ? {
          currentMonth: verifiedStatement.paymentNumber,
          monthlyPaymentUsed: Number(verifiedStatement.amount),
          remainingMonths: Math.max(months - verifiedStatement.paymentNumber, 0),
          remainingBalance: Number(verifiedStatement.remainingBalance),
          verifiedStatementDate: verifiedStatement.year + "-" + String(verifiedStatement.month).padStart(2, "0"),
        }
      : {}),
  };
}

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    const userId = user.id;

    const purchases = await prisma.installmentPurchase.findMany({
      where: { userId },
      select: purchaseSelect,
      orderBy: [{ status: "asc" }, { purchaseDate: "desc" }],
    });

    const formatted = purchases.map(formatPurchase);

    return NextResponse.json({ purchases: formatted });
  } catch (error) {
    const accessResponse = apiAccessErrorResponse(error);
    if (accessResponse) return accessResponse;
    console.error("Error loading installment purchases:", error);

    return NextResponse.json(
      { error: "No se pudieron cargar las compras a meses." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request);
    const userId = user.id;
    const body = readFinancialInput(await request.json());
    await requireOwnedReferences(prisma, userId, body, []);

    const {
      cardId,
      purchaseDate,
      concept,
      totalAmount,
      months,
      manualMonthlyPayment,
      initialPaymentsMade,
      personId,
      categoryId,
      notes,
    } = body;

    if (
      !userId ||
      !cardId ||
      !purchaseDate ||
      !concept ||
      !totalAmount ||
      !months ||
      !categoryId
    ) {
      return NextResponse.json(
        { error: "Faltan datos obligatorios." },
        { status: 400 },
      );
    }

    const numericTotalAmount = Number(totalAmount);
    const numericMonths = Number(months);
    const numericInitialPaymentsMade = Number(initialPaymentsMade || 0);

    if (!Number.isFinite(numericTotalAmount) || numericTotalAmount <= 0) {
      return NextResponse.json(
        { error: "El monto total debe ser mayor a 0." },
        { status: 400 },
      );
    }

    if (!Number.isInteger(numericMonths) || numericMonths <= 0) {
      return NextResponse.json(
        { error: "El número de meses debe ser mayor a 0." },
        { status: 400 },
      );
    }

    if (
      !Number.isInteger(numericInitialPaymentsMade) ||
      numericInitialPaymentsMade < 0 ||
      numericInitialPaymentsMade > numericMonths
    ) {
      return NextResponse.json(
        {
          error:
            "Los pagos ya realizados no pueden ser negativos ni mayores al número de meses.",
        },
        { status: 400 },
      );
    }

    let numericManualMonthlyPayment = null;

    if (manualMonthlyPayment) {
      numericManualMonthlyPayment = Number(manualMonthlyPayment);

      if (
        !Number.isFinite(numericManualMonthlyPayment) ||
        numericManualMonthlyPayment <= 0
      ) {
        return NextResponse.json(
          { error: "El pago mensual manual debe ser mayor a 0." },
          { status: 400 },
        );
      }
    }

    const parsedPurchaseDate = parseDateInput(purchaseDate);

    if (!parsedPurchaseDate || Number.isNaN(parsedPurchaseDate.getTime())) {
      return NextResponse.json(
        { error: "Fecha de compra no válida." },
        { status: 400 },
      );
    }

    const monthlyPaymentUsed =
      numericManualMonthlyPayment || numericTotalAmount / numericMonths;

    const status =
      numericInitialPaymentsMade >= numericMonths ? "PAID_OFF" : "ACTIVE";

    const result = await runDebtAccountOperation(prisma, userId, async tx => {
      await requireOwnedReferences(tx, userId, body, ["cardId", "categoryId", "personId"]);
      // Cuenta, compra y referencia de origen se confirman o revierten juntas.
      let createdReceivable = null;

      if (personId) {
        createdReceivable = await tx.receivableAccount.create({
          data: {
            userId,
            personId,
            concept: concept.trim(),
            originalAmount: numericTotalAmount,
            originDate: parsedPurchaseDate,
            expectedMonthlyPayment: monthlyPaymentUsed,
            status: "ACTIVE",
            originType: "INSTALLMENT_PURCHASE",
          },
        });
      }

      const purchase = await tx.installmentPurchase.create({
        data: {
          userId,
          cardId,
          purchaseDate: parsedPurchaseDate,
          concept: concept.trim(),
          totalAmount: numericTotalAmount,
          months: numericMonths,
          manualMonthlyPayment: numericManualMonthlyPayment,
          initialPaymentsMade: numericInitialPaymentsMade,
          personId: personId || null,
          receivableAccountId: createdReceivable?.id || null,
          categoryId,
          notes: notes?.trim() || null,
          status,
        },
        select: purchaseSelect,
      });

      if (createdReceivable) {
        await tx.receivableAccount.update({
          where: { id: createdReceivable.id, userId },
          data: {
            originId: purchase.id,
          },
        });
      }

      return { purchase: formatPurchase(purchase) };
    });
    return NextResponse.json(result);
  } catch (error) {
    const accessResponse = apiAccessErrorResponse(error);
    if (accessResponse) return accessResponse;
    console.error("Error creating installment purchase:", error);

    return NextResponse.json(
      { error: "No se pudo crear la compra a meses." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireApiUser(request);
    const userId = user.id;
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Falta id." }, { status: 400 });
    }

    await prisma.installmentPurchase.delete({
      where: { id, userId },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const accessResponse = apiAccessErrorResponse(error);
    if (accessResponse) return accessResponse;
    console.error("Error deleting installment purchase:", error);

    return NextResponse.json(
      { error: "No se pudo eliminar la compra a meses." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireApiUser(request);
    const userId = user.id;
    const body = readFinancialInput(await request.json());
    await requireOwnedReferences(prisma, userId, body, []);

    const {
      id,
      cardId,
      purchaseDate,
      concept,
      totalAmount,
      months,
      manualMonthlyPayment,
      initialPaymentsMade,
      categoryId,
      notes,
    } = body;

    if (!id) {
      return NextResponse.json({ error: "Falta id." }, { status: 400 });
    }

    if (
      !cardId ||
      !purchaseDate ||
      !concept ||
      !totalAmount ||
      !months ||
      !categoryId
    ) {
      return NextResponse.json(
        { error: "Faltan datos obligatorios." },
        { status: 400 },
      );
    }

    const numericTotalAmount = Number(totalAmount);
    const numericMonths = Number(months);
    const numericInitialPaymentsMade = Number(initialPaymentsMade || 0);

    if (!Number.isFinite(numericTotalAmount) || numericTotalAmount <= 0) {
      return NextResponse.json(
        { error: "El monto total debe ser mayor a 0." },
        { status: 400 },
      );
    }

    if (!Number.isInteger(numericMonths) || numericMonths <= 0) {
      return NextResponse.json(
        { error: "El número de meses debe ser mayor a 0." },
        { status: 400 },
      );
    }

    if (
      !Number.isInteger(numericInitialPaymentsMade) ||
      numericInitialPaymentsMade < 0 ||
      numericInitialPaymentsMade > numericMonths
    ) {
      return NextResponse.json(
        {
          error:
            "Los pagos ya realizados no pueden ser negativos ni mayores al número de meses.",
        },
        { status: 400 },
      );
    }

    let numericManualMonthlyPayment = null;

    if (manualMonthlyPayment) {
      numericManualMonthlyPayment = Number(manualMonthlyPayment);

      if (
        !Number.isFinite(numericManualMonthlyPayment) ||
        numericManualMonthlyPayment <= 0
      ) {
        return NextResponse.json(
          { error: "El pago mensual manual debe ser mayor a 0." },
          { status: 400 },
        );
      }
    }

    const parsedPurchaseDate = parseDateInput(purchaseDate);

    if (!parsedPurchaseDate || Number.isNaN(parsedPurchaseDate.getTime())) {
      return NextResponse.json(
        { error: "Fecha de compra no válida." },
        { status: 400 },
      );
    }

    const status =
      numericInitialPaymentsMade >= numericMonths ? "PAID_OFF" : "ACTIVE";

    const result = await runDebtAccountOperation(prisma, userId, async tx => {
      await requireOwnedReferences(tx, userId, body, ["cardId", "categoryId", "personId"]);
      const previous = await tx.installmentPurchase.findFirst({ where: { id, userId } });
      if (!previous) throw new ApiAccessError("Compra no encontrada.", 404);
      const purchase = await tx.installmentPurchase.update({
        where: { id, userId },
        data: {
          cardId,
          purchaseDate: parsedPurchaseDate,
          concept: concept.trim(),
          totalAmount: numericTotalAmount,
          months: numericMonths,
          manualMonthlyPayment: numericManualMonthlyPayment,
          initialPaymentsMade: numericInitialPaymentsMade,
          categoryId,
          notes: notes?.trim() || null,
          status,
          ...(previous.reconciledAt && (String(previous.totalAmount) !== String(numericTotalAmount) || previous.cardId !== cardId
            || previous.purchaseDate.toISOString().slice(0, 10) !== purchaseDate || previous.months !== numericMonths
            || Number(previous.manualMonthlyPayment) !== Number(numericManualMonthlyPayment)) ? { reconciledAt: null, reconciliationStatus: "PENDING" } : {}),
        },
        select: purchaseSelect,
      });

      return { purchase: formatPurchase(purchase) };
    });
    return NextResponse.json(result);
  } catch (error) {
    const accessResponse = apiAccessErrorResponse(error);
    if (accessResponse) return accessResponse;
    console.error("Error updating installment purchase:", error);

    return NextResponse.json(
      { error: "No se pudo actualizar la compra a meses." },
      { status: 500 },
    );
  }
}
