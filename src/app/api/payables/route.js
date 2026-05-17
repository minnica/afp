import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function parseDateInput(dateValue) {
  if (!dateValue) return null;
  return new Date(`${dateValue}T12:00:00.000Z`);
}

function formatPayable(item) {
  const paidAmount = item.dailyExpenses.reduce((sum, expense) => {
    return sum + Number(expense.amount || 0);
  }, 0);

  const pendingBalance = Number(item.originalAmount || 0) - paidAmount;

  return {
    ...item,
    paidAmount,
    pendingBalance,
  };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "Falta userId." }, { status: 400 });
    }

    const payables = await prisma.payableAccount.findMany({
      where: {
        userId,
      },
      include: {
        person: true,
        dailyExpenses: true,
      },
      orderBy: [
        { status: "asc" },
        { expectedDate: "asc" },
        { originDate: "desc" },
        { createdAt: "desc" },
      ],
    });

    const formatted = payables.map(formatPayable);

    return NextResponse.json({ payables: formatted });
  } catch (error) {
    console.error("Error loading payables:", error);

    return NextResponse.json(
      { error: "No se pudieron cargar las cuentas por pagar." },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();

    const {
      userId,
      personId,
      concept,
      originalAmount,
      originDate,
      expectedMonthlyPayment,
      expectedDate,
      notes,
    } = body;

    if (!userId || !personId || !concept || !originalAmount || !originDate) {
      return NextResponse.json(
        { error: "Faltan datos obligatorios." },
        { status: 400 },
      );
    }

    const numericOriginalAmount = Number(originalAmount);

    if (!Number.isFinite(numericOriginalAmount) || numericOriginalAmount <= 0) {
      return NextResponse.json(
        { error: "El monto original debe ser mayor a 0." },
        { status: 400 },
      );
    }

    let numericExpectedMonthlyPayment = null;

    if (expectedMonthlyPayment) {
      numericExpectedMonthlyPayment = Number(expectedMonthlyPayment);

      if (
        !Number.isFinite(numericExpectedMonthlyPayment) ||
        numericExpectedMonthlyPayment <= 0
      ) {
        return NextResponse.json(
          { error: "El pago mensual esperado debe ser mayor a 0." },
          { status: 400 },
        );
      }
    }

    const parsedOriginDate = parseDateInput(originDate);
    const parsedExpectedDate = expectedDate
      ? parseDateInput(expectedDate)
      : null;

    if (!parsedOriginDate || Number.isNaN(parsedOriginDate.getTime())) {
      return NextResponse.json(
        { error: "Fecha de origen no válida." },
        { status: 400 },
      );
    }

    if (
      expectedDate &&
      (!parsedExpectedDate || Number.isNaN(parsedExpectedDate.getTime()))
    ) {
      return NextResponse.json(
        { error: "Fecha esperada no válida." },
        { status: 400 },
      );
    }

    const payable = await prisma.payableAccount.create({
      data: {
        userId,
        personId,
        concept: concept.trim(),
        originalAmount: numericOriginalAmount,
        originDate: parsedOriginDate,
        expectedMonthlyPayment: numericExpectedMonthlyPayment,
        expectedDate: parsedExpectedDate,
        notes: notes?.trim() || null,
        status: "ACTIVE",
        originType: "MANUAL",
      },
      include: {
        person: true,
        dailyExpenses: true,
      },
    });

    return NextResponse.json({
      payable: formatPayable(payable),
    });
  } catch (error) {
    console.error("Error creating payable:", error);

    return NextResponse.json(
      { error: "No se pudo crear la cuenta por pagar." },
      { status: 500 },
    );
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();

    const {
      id,
      personId,
      concept,
      originalAmount,
      originDate,
      expectedMonthlyPayment,
      expectedDate,
      notes,
    } = body;

    if (!id) {
      return NextResponse.json({ error: "Falta id." }, { status: 400 });
    }

    if (!personId || !concept || !originalAmount || !originDate) {
      return NextResponse.json(
        { error: "Faltan datos obligatorios." },
        { status: 400 },
      );
    }

    const numericOriginalAmount = Number(originalAmount);

    if (!Number.isFinite(numericOriginalAmount) || numericOriginalAmount <= 0) {
      return NextResponse.json(
        { error: "El monto original debe ser mayor a 0." },
        { status: 400 },
      );
    }

    let numericExpectedMonthlyPayment = null;

    if (expectedMonthlyPayment) {
      numericExpectedMonthlyPayment = Number(expectedMonthlyPayment);

      if (
        !Number.isFinite(numericExpectedMonthlyPayment) ||
        numericExpectedMonthlyPayment <= 0
      ) {
        return NextResponse.json(
          { error: "El pago mensual esperado debe ser mayor a 0." },
          { status: 400 },
        );
      }
    }

    const parsedOriginDate = parseDateInput(originDate);
    const parsedExpectedDate = expectedDate
      ? parseDateInput(expectedDate)
      : null;

    if (!parsedOriginDate || Number.isNaN(parsedOriginDate.getTime())) {
      return NextResponse.json(
        { error: "Fecha de origen no válida." },
        { status: 400 },
      );
    }

    if (
      expectedDate &&
      (!parsedExpectedDate || Number.isNaN(parsedExpectedDate.getTime()))
    ) {
      return NextResponse.json(
        { error: "Fecha esperada no válida." },
        { status: 400 },
      );
    }

    const payable = await prisma.payableAccount.update({
      where: { id },
      data: {
        personId,
        concept: concept.trim(),
        originalAmount: numericOriginalAmount,
        originDate: parsedOriginDate,
        expectedMonthlyPayment: numericExpectedMonthlyPayment,
        expectedDate: parsedExpectedDate,
        notes: notes?.trim() || null,
      },
      include: {
        person: true,
        dailyExpenses: true,
      },
    });

    return NextResponse.json({
      payable: formatPayable(payable),
    });
  } catch (error) {
    console.error("Error updating payable:", error);

    return NextResponse.json(
      { error: "No se pudo actualizar la cuenta por pagar." },
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

    await prisma.payableAccount.delete({
      where: { id },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting payable:", error);

    return NextResponse.json(
      {
        error:
          "No se pudo eliminar. Puede que esta cuenta ya tenga gastos relacionados.",
      },
      { status: 500 },
    );
  }
}
