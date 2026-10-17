import { apiResponse as NextResponse, requireApiUser, apiAccessErrorResponse, requireOwnedReferences } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";

const cardSelect = {
  id: true,
  userId: true,
  name: true,
  usualCutDay: true,
  usualDueDay: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
};

export async function GET(request) {
  try {
    const user = await requireApiUser(request);
    const userId = user.id;

    const cards = await prisma.card.findMany({
      where: { userId },
      select: cardSelect,
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ cards });
  } catch (error) {
    const accessResponse = apiAccessErrorResponse(error);
    if (accessResponse) return accessResponse;
    console.error("Error loading cards:", error);

    return NextResponse.json(
      { error: "No se pudieron cargar las tarjetas." },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const user = await requireApiUser(request);
    const userId = user.id;
    const body = await request.json();
    await requireOwnedReferences(prisma, userId, body, []);

    const { name, usualCutDay, usualDueDay, notes } = body;

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
      select: cardSelect,
    });

    return NextResponse.json({ card });
  } catch (error) {
    const accessResponse = apiAccessErrorResponse(error);
    if (accessResponse) return accessResponse;
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
    const user = await requireApiUser(request);
    const userId = user.id;
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Falta id." }, { status: 400 });
    }

    await prisma.card.delete({
      where: { id, userId },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const accessResponse = apiAccessErrorResponse(error);
    if (accessResponse) return accessResponse;
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

export async function PATCH(request) {
  try {
    const user = await requireApiUser(request);
    const userId = user.id;
    const body = await request.json();
    await requireOwnedReferences(prisma, userId, body, []);

    const { id, name, usualCutDay, usualDueDay, notes } = body;

    if (!id) {
      return NextResponse.json({ error: "Falta id." }, { status: 400 });
    }

    if (!name || !usualCutDay || !usualDueDay) {
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

    const card = await prisma.card.update({
      where: { id, userId },
      data: {
        name: cleanName,
        usualCutDay: cutDay,
        usualDueDay: dueDay,
        notes: notes?.trim() || null,
      },
      select: cardSelect,
    });

    return NextResponse.json({ card });
  } catch (error) {
    const accessResponse = apiAccessErrorResponse(error);
    if (accessResponse) return accessResponse;
    console.error("Error updating card:", error);

    if (error.code === "P2002") {
      return NextResponse.json(
        { error: "Ya existe una tarjeta con ese nombre." },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { error: "No se pudo actualizar la tarjeta." },
      { status: 500 },
    );
  }
}
