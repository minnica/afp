import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function getDaysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function createDate(year, monthIndex, day) {
  const safeDay = Math.min(day, getDaysInMonth(year, monthIndex));

  // Usamos mediodía UTC para reducir problemas de zona horaria.
  return new Date(Date.UTC(year, monthIndex, safeDay, 12, 0, 0));
}

function getCycleDates(year, monthIndex, cutDay, dueDay) {
  const cutDate = createDate(year, monthIndex, cutDay);

  const previousMonthDate = new Date(
    Date.UTC(year, monthIndex - 1, 1, 12, 0, 0),
  );
  const previousCutDate = createDate(
    previousMonthDate.getUTCFullYear(),
    previousMonthDate.getUTCMonth(),
    cutDay,
  );

  const startDate = new Date(previousCutDate);
  startDate.setUTCDate(startDate.getUTCDate() + 1);

  let dueDate = createDate(year, monthIndex, dueDay);

  // Si el día límite cae antes o igual que el corte, entonces corresponde al siguiente mes.
  if (dueDate <= cutDate) {
    const nextMonthDate = new Date(Date.UTC(year, monthIndex + 1, 1, 12, 0, 0));
    dueDate = createDate(
      nextMonthDate.getUTCFullYear(),
      nextMonthDate.getUTCMonth(),
      dueDay,
    );
  }

  return {
    startDate,
    cutDate,
    dueDate,
  };
}

function getTargetMonths() {
  const now = new Date();

  return [-1, 0, 1].map((offset) => {
    const date = new Date(
      Date.UTC(now.getFullYear(), now.getMonth() + offset, 1, 12, 0, 0),
    );

    return {
      month: date.getUTCMonth() + 1,
      year: date.getUTCFullYear(),
      monthIndex: date.getUTCMonth(),
    };
  });
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "Falta userId." }, { status: 400 });
    }

    const cycles = await prisma.cardCycle.findMany({
      where: { userId },
      include: {
        card: true,
      },
      orderBy: [{ year: "asc" }, { month: "asc" }, { card: { name: "asc" } }],
    });

    return NextResponse.json({ cycles });
  } catch (error) {
    console.error("Error loading card cycles:", error);

    return NextResponse.json(
      { error: "No se pudieron cargar los ciclos." },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: "Falta userId." }, { status: 400 });
    }

    const cards = await prisma.card.findMany({
      where: { userId },
    });

    const targetMonths = getTargetMonths();

    for (const card of cards) {
      for (const target of targetMonths) {
        const { startDate, cutDate, dueDate } = getCycleDates(
          target.year,
          target.monthIndex,
          card.usualCutDay,
          card.usualDueDay,
        );

        await prisma.cardCycle.upsert({
          where: {
            cardId_month_year: {
              cardId: card.id,
              month: target.month,
              year: target.year,
            },
          },
          update: {},
          create: {
            userId,
            cardId: card.id,
            month: target.month,
            year: target.year,
            startDate,
            cutDate,
            dueDate,
          },
        });
      }
    }

    const cycles = await prisma.cardCycle.findMany({
      where: { userId },
      include: {
        card: true,
      },
      orderBy: [{ year: "asc" }, { month: "asc" }, { card: { name: "asc" } }],
    });

    return NextResponse.json({
      ok: true,
      cycles,
    });
  } catch (error) {
    console.error("Error generating card cycles:", error);

    return NextResponse.json(
      { error: "No se pudieron generar los ciclos." },
      { status: 500 },
    );
  }
}
