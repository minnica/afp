import { apiResponse as NextResponse, requireApiUser, apiAccessErrorResponse, requireOwnedReferences } from "@/lib/apiAuth";
import { runDebtAccountOperation, refreshDebtAccount } from "@/lib/debtAccountService";
import { getDebtAccountState } from "@/lib/calculations/debtAccounts";
import { prisma } from "@/lib/prisma";

const payableSelect = {
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
    },
  },
};

function parseDateInput(dateValue) {
  if (!dateValue) return null;
  return new Date(`${dateValue}T12:00:00.000Z`);
}

function formatPayable(item) {
  return { ...item, ...getDebtAccountState(item, item.dailyExpenses) };
}

export async function GET(request) {
  try {
    const user = await requireApiUser(request);
    const userId = user.id;

    const payables = await prisma.payableAccount.findMany({
      where: {
        userId,
      },
      select: payableSelect,
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
    const accessResponse = apiAccessErrorResponse(error);
    if (accessResponse) return accessResponse;
    console.error("Error loading payables:", error);

    return NextResponse.json(
      { error: "No se pudieron cargar las cuentas por pagar." },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const user = await requireApiUser(request);
    const userId = user.id;
    const body = await request.json();
    await requireOwnedReferences(prisma, userId, body, ["personId"]);

    const {
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
      select: payableSelect,
    });

    return NextResponse.json({
      payable: formatPayable(payable),
    });
  } catch (error) {
    const accessResponse = apiAccessErrorResponse(error);
    if (accessResponse) return accessResponse;
    console.error("Error creating payable:", error);

    return NextResponse.json(
      { error: "No se pudo crear la cuenta por pagar." },
      { status: 500 },
    );
  }
}

export async function PATCH(request) {
  try {
    const user = await requireApiUser(request);
    const userId = user.id;
    const body = await request.json();
    return await runDebtAccountOperation(prisma, userId, async tx => {
      await requireOwnedReferences(tx, userId, body, ["personId"]);

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

      const payable = await tx.payableAccount.update({
        where: { id, userId },
        data: {
          personId,
          concept: concept.trim(),
          originalAmount: numericOriginalAmount,
          originDate: parsedOriginDate,
          expectedMonthlyPayment: numericExpectedMonthlyPayment,
          expectedDate: parsedExpectedDate,
          notes: notes?.trim() || null,
        },
        select: payableSelect,
      });

      const state = await refreshDebtAccount(tx, userId, "payable", id);
      return NextResponse.json({
        payable: formatPayable({ ...payable, ...state }),
      });
    });
  } catch (error) {
    const accessResponse = apiAccessErrorResponse(error);
    if (accessResponse) return accessResponse;
    console.error("Error updating payable:", error);

    return NextResponse.json(
      { error: "No se pudo actualizar la cuenta por pagar." },
      { status: 500 },
    );
  }
}

export async function DELETE(request) {
  try {
    const user = await requireApiUser(request);
    const userId = user.id;
    return await runDebtAccountOperation(prisma, userId, async tx => {
      const { searchParams } = new URL(request.url);
      const id = searchParams.get("id");

      if (!id) {
        return NextResponse.json({ error: "Falta id." }, { status: 400 });
      }

      await tx.payableAccount.delete({
        where: { id, userId },
      });

      return NextResponse.json({ ok: true });
    });
  } catch (error) {
    const accessResponse = apiAccessErrorResponse(error);
    if (accessResponse) return accessResponse;
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
