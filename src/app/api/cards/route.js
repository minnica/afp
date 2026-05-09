import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "Falta userId." }, { status: 400 });
    }

    const cards = await prisma.card.findMany({
      where: { userId },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ cards });
  } catch (error) {
    console.error("Error loading cards:", error);

    return NextResponse.json(
      { error: "No se pudieron cargar las tarjetas." },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();

    const { userId, name, usualCutDay, usualDueDay, notes } = body;

    if (!userId || !name || !usualCutDay || !usualDueDay) {
      return NextResponse.json(
        { error: "Faltan datos obligatorios." },
        { status: 400 },
      );
    }

    const cleanName = name.trim();
    const cutDay = Number(usualCutDay);
    const dueDay = Number(usualDueDay);

    if (!cleanName) {
      return NextResponse.json(
        { error: "El nombre de la tarjeta no puede estar vacío." },
        { status: 400 },
      );
    }

    if (cutDay < 1 || cutDay > 31 || dueDay < 1 || dueDay > 31) {
      return NextResponse.json(
        { error: "Los días deben estar entre 1 y 31." },
        { status: 400 },
      );
    }

    const card = await prisma.card.create({
      data: {
        userId,
        name: cleanName,
        usualCutDay: cutDay,
        usualDueDay: dueDay,
        notes: notes?.trim() || null,
      },
    });

    return NextResponse.json({ card });
  } catch (error) {
    console.error("Error creating card:", error);

    if (error.code === "P2002") {
      return NextResponse.json(
        { error: "Ya existe una tarjeta con ese nombre." },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { error: "No se pudo crear la tarjeta." },
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

    await prisma.card.delete({
      where: { id },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting card:", error);

    return NextResponse.json(
      {
        error:
          "No se pudo eliminar la tarjeta. Puede que ya tenga gastos, compras, suscripciones o ciclos relacionados.",
      },
      { status: 500 },
    );
  }
}
