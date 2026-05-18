import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function parseDateInput(dateValue) {
  if (!dateValue) return null;
  return new Date(`${dateValue}T12:00:00.000Z`);
}

function parseExpectedChargeDays(value) {
  if (!value) return { days: [], error: "" };

  const rawDays = Array.isArray(value) ? value : String(value).split(",");

  const days = rawDays
    .map((day) => String(day).trim())
    .filter(Boolean)
    .map(Number);

  const hasInvalidDay = days.some((day) => {
    return !Number.isInteger(day) || day < 1 || day > 31;
  });

  if (hasInvalidDay) {
    return {
      days: [],
      error: "Los días de cobro deben ser números entre 1 y 31.",
    };
  }

  const uniqueDays = [...new Set(days)].sort((a, b) => a - b);

  return {
    days: uniqueDays,
    error: "",
  };
}

function formatReceivable(item) {
  const paidAmount = item.incomes.reduce((sum, income) => {
    return sum + Number(income.amount || 0);
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

    const receivables = await prisma.receivableAccount.findMany({
      where: {
        userId,
      },
      include: {
        person: true,
        incomes: true,
      },
      orderBy: [
        { status: "asc" },
        { originDate: "desc" },
        { createdAt: "desc" },
      ],
    });

    const formatted = receivables.map(formatReceivable);

    return NextResponse.json({ receivables: formatted });
  } catch (error) {
    console.error("Error loading receivables:", error);

    return NextResponse.json(
      { error: "No se pudieron cargar las cuentas por cobrar." },
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
      expectedChargeDays,
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

    if (!parsedOriginDate || Number.isNaN(parsedOriginDate.getTime())) {
      return NextResponse.json(
        { error: "Fecha de origen no válida." },
        { status: 400 },
      );
    }

    const parsedExpectedChargeDays =
      parseExpectedChargeDays(expectedChargeDays);

    if (parsedExpectedChargeDays.error) {
      return NextResponse.json(
        { error: parsedExpectedChargeDays.error },
        { status: 400 },
      );
    }

    const receivable = await prisma.receivableAccount.create({
      data: {
        userId,
        personId,
        concept: concept.trim(),
        originalAmount: numericOriginalAmount,
        originDate: parsedOriginDate,
        expectedMonthlyPayment: numericExpectedMonthlyPayment,
        expectedChargeDays: parsedExpectedChargeDays.days,
        notes: notes?.trim() || null,
        status: "ACTIVE",
        originType: "MANUAL",
      },
      include: {
        person: true,
        incomes: true,
      },
    });

    return NextResponse.json({
      receivable: formatReceivable(receivable),
    });
  } catch (error) {
    console.error("Error creating receivable:", error);

    return NextResponse.json(
      { error: "No se pudo crear la cuenta por cobrar." },
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

    await prisma.receivableAccount.delete({
      where: { id },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting receivable:", error);

    return NextResponse.json(
      {
        error:
          "No se pudo eliminar. Puede que esta cuenta ya tenga ingresos o gastos relacionados.",
      },
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
      expectedChargeDays,
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

    if (!parsedOriginDate || Number.isNaN(parsedOriginDate.getTime())) {
      return NextResponse.json(
        { error: "Fecha de origen no válida." },
        { status: 400 },
      );
    }

    const parsedExpectedChargeDays =
      parseExpectedChargeDays(expectedChargeDays);

    if (parsedExpectedChargeDays.error) {
      return NextResponse.json(
        { error: parsedExpectedChargeDays.error },
        { status: 400 },
      );
    }

    const receivable = await prisma.receivableAccount.update({
      where: { id },
      data: {
        personId,
        concept: concept.trim(),
        originalAmount: numericOriginalAmount,
        originDate: parsedOriginDate,
        expectedMonthlyPayment: numericExpectedMonthlyPayment,
        expectedChargeDays: parsedExpectedChargeDays.days,
        notes: notes?.trim() || null,
      },
      include: {
        person: true,
        incomes: true,
      },
    });

    return NextResponse.json({
      receivable: formatReceivable(receivable),
    });
  } catch (error) {
    console.error("Error updating receivable:", error);

    return NextResponse.json(
      { error: "No se pudo actualizar la cuenta por cobrar." },
      { status: 500 },
    );
  }
}
