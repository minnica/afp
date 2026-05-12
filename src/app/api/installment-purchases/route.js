import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function parseDateInput(dateValue) {
  if (!dateValue) return null;
  return new Date(`${dateValue}T12:00:00.000Z`);
}

function formatPurchase(purchase) {
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
  const currentMonth = Math.min(paymentsMade + 1, months);
  const remainingBalance = remainingMonths * monthlyPaymentUsed;

  return {
    ...purchase,
    calculatedMonthlyPayment,
    monthlyPaymentUsed,
    currentMonth,
    remainingMonths,
    remainingBalance,
  };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "Falta userId." }, { status: 400 });
    }

    const purchases = await prisma.installmentPurchase.findMany({
      where: { userId },
      include: {
        card: true,
        category: true,
        person: true,
        receivableAccount: true,
      },
      orderBy: [{ status: "asc" }, { purchaseDate: "desc" }],
    });

    const formatted = purchases.map(formatPurchase);

    return NextResponse.json({ purchases: formatted });
  } catch (error) {
    console.error("Error loading installment purchases:", error);

    return NextResponse.json(
      { error: "No se pudieron cargar las compras a meses." },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();

    const {
      userId,
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

    let createdReceivable = null;

    if (personId) {
      createdReceivable = await prisma.receivableAccount.create({
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

    const purchase = await prisma.installmentPurchase.create({
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
      include: {
        card: true,
        category: true,
        person: true,
        receivableAccount: true,
      },
    });

    if (createdReceivable) {
      await prisma.receivableAccount.update({
        where: { id: createdReceivable.id },
        data: {
          originId: purchase.id,
        },
      });
    }

    return NextResponse.json({ purchase: formatPurchase(purchase) });
  } catch (error) {
    console.error("Error creating installment purchase:", error);

    return NextResponse.json(
      { error: "No se pudo crear la compra a meses." },
      { status: 500 },
    );
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Falta id." }, { status: 400 });
    }

    await prisma.installmentPurchase.delete({
      where: { id },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting installment purchase:", error);

    return NextResponse.json(
      { error: "No se pudo eliminar la compra a meses." },
      { status: 500 },
    );
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();

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

    const purchase = await prisma.installmentPurchase.update({
      where: { id },
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
      },
      include: {
        card: true,
        category: true,
        person: true,
        receivableAccount: true,
      },
    });

    return NextResponse.json({ purchase: formatPurchase(purchase) });
  } catch (error) {
    console.error("Error updating installment purchase:", error);

    return NextResponse.json(
      { error: "No se pudo actualizar la compra a meses." },
      { status: 500 },
    );
  }
}
