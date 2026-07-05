import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "Falta userId." }, { status: 400 });
    }

    const subscriptions = await prisma.subscription.findMany({
      where: { userId },
      select: subscriptionSelect,
      orderBy: [{ chargeDay: "asc" }, { name: "asc" }],
    });

    const total = subscriptions.reduce((sum, subscription) => {
      return sum + Number(subscription.amount || 0);
    }, 0);

    return NextResponse.json({ subscriptions, total });
  } catch (error) {
    console.error("Error loading subscriptions:", error);

    return NextResponse.json(
      { error: "No se pudieron cargar las suscripciones." },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();

    const {
      userId,
      name,
      amount,
      paymentMethod,
      cardId,
      categoryId,
      chargeDay,
      frequencyMonths,
      startMonth,
      startYear,
    } = body;

    if (
      !userId ||
      !name ||
      !amount ||
      !paymentMethod ||
      !categoryId ||
      !chargeDay
    ) {
      return NextResponse.json(
        { error: "Faltan datos obligatorios." },
        { status: 400 },
      );
    }

    if (!["CASH", "CARD"].includes(paymentMethod)) {
      return NextResponse.json(
        { error: "Método de pago no válido." },
        { status: 400 },
      );
    }

    if (paymentMethod === "CARD" && !cardId) {
      return NextResponse.json(
        { error: "Debes seleccionar una tarjeta." },
        { status: 400 },
      );
    }

    const numericAmount = Number(amount);
    const numericChargeDay = Number(chargeDay);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return NextResponse.json(
        { error: "El monto debe ser mayor a 0." },
        { status: 400 },
      );
    }

    if (
      !Number.isInteger(numericChargeDay) ||
      numericChargeDay < 1 ||
      numericChargeDay > 31
    ) {
      return NextResponse.json(
        { error: "El día de cobro debe estar entre 1 y 31." },
        { status: 400 },
      );
    }

    const numericFrequencyMonths = Number(frequencyMonths || 1);
    const numericStartMonth = Number(startMonth);
    const numericStartYear = Number(startYear);

    if (![1, 2, 3, 6, 12].includes(numericFrequencyMonths)) {
      return NextResponse.json(
        { error: "Frecuencia no válida." },
        { status: 400 },
      );
    }

    if (
      !Number.isInteger(numericStartMonth) ||
      numericStartMonth < 1 ||
      numericStartMonth > 12
    ) {
      return NextResponse.json(
        { error: "Mes de inicio no válido." },
        { status: 400 },
      );
    }

    if (
      !Number.isInteger(numericStartYear) ||
      numericStartYear < 2000 ||
      numericStartYear > 2100
    ) {
      return NextResponse.json(
        { error: "Año de inicio no válido." },
        { status: 400 },
      );
    }

    const subscription = await prisma.subscription.create({
      data: {
        userId,
        name: name.trim(),
        amount: numericAmount,
        paymentMethod,
        cardId: paymentMethod === "CARD" ? cardId : null,
        categoryId,
        chargeDay: numericChargeDay,
        frequencyMonths: numericFrequencyMonths,
        startMonth: numericStartMonth,
        startYear: numericStartYear,
      },
      select: subscriptionSelect,
    });

    return NextResponse.json({ subscription });
  } catch (error) {
    console.error("Error creating subscription:", error);

    return NextResponse.json(
      { error: "No se pudo crear la suscripción." },
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

    await prisma.subscription.delete({
      where: { id },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting subscription:", error);

    return NextResponse.json(
      { error: "No se pudo eliminar la suscripción." },
      { status: 500 },
    );
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();

    const {
      id,
      name,
      amount,
      paymentMethod,
      cardId,
      categoryId,
      chargeDay,
      frequencyMonths,
      startMonth,
      startYear,
      toggleActive,
      isActive,
    } = body;

    if (!id) {
      return NextResponse.json({ error: "Falta id." }, { status: 400 });
    }

    if (toggleActive) {
      let data;

      if (isActive) {
        data = { isActive: true, deactivatedAt: null };
      } else {
        const { deactivatedAt } = body;
        const parsedDate = deactivatedAt ? new Date(deactivatedAt) : new Date();
        data = {
          isActive: false,
          deactivatedAt: Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate,
        };
      }

      const subscription = await prisma.subscription.update({
        where: { id },
        data,
        select: subscriptionSelect,
      });

      return NextResponse.json({ subscription });
    }

    if (!name || !amount || !paymentMethod || !categoryId || !chargeDay) {
      return NextResponse.json(
        { error: "Faltan datos obligatorios." },
        { status: 400 },
      );
    }

    if (!["CASH", "CARD"].includes(paymentMethod)) {
      return NextResponse.json(
        { error: "Método de pago no válido." },
        { status: 400 },
      );
    }

    if (paymentMethod === "CARD" && !cardId) {
      return NextResponse.json(
        { error: "Debes seleccionar una tarjeta." },
        { status: 400 },
      );
    }

    const numericAmount = Number(amount);
    const numericChargeDay = Number(chargeDay);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return NextResponse.json(
        { error: "El monto debe ser mayor a 0." },
        { status: 400 },
      );
    }

    if (
      !Number.isInteger(numericChargeDay) ||
      numericChargeDay < 1 ||
      numericChargeDay > 31
    ) {
      return NextResponse.json(
        { error: "El día de cobro debe estar entre 1 y 31." },
        { status: 400 },
      );
    }

    const numericFrequencyMonths = Number(frequencyMonths || 1);
    const numericStartMonth = Number(startMonth);
    const numericStartYear = Number(startYear);

    if (![1, 2, 3, 6, 12].includes(numericFrequencyMonths)) {
      return NextResponse.json(
        { error: "Frecuencia no válida." },
        { status: 400 },
      );
    }

    if (
      !Number.isInteger(numericStartMonth) ||
      numericStartMonth < 1 ||
      numericStartMonth > 12
    ) {
      return NextResponse.json(
        { error: "Mes de inicio no válido." },
        { status: 400 },
      );
    }

    if (
      !Number.isInteger(numericStartYear) ||
      numericStartYear < 2000 ||
      numericStartYear > 2100
    ) {
      return NextResponse.json(
        { error: "Año de inicio no válido." },
        { status: 400 },
      );
    }

    const subscription = await prisma.subscription.update({
      where: { id },
      data: {
        name: name.trim(),
        amount: numericAmount,
        paymentMethod,
        cardId: paymentMethod === "CARD" ? cardId : null,
        categoryId,
        chargeDay: numericChargeDay,
        frequencyMonths: numericFrequencyMonths,
        startMonth: numericStartMonth,
        startYear: numericStartYear,
      },
      select: subscriptionSelect,
    });

    return NextResponse.json({ subscription });
  } catch (error) {
    console.error("Error updating subscription:", error);

    return NextResponse.json(
      { error: "No se pudo actualizar la suscripción." },
      { status: 500 },
    );
  }
}
