import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const allowedTypes = ["category", "person", "incomeType"];

const categorySelect = {
  id: true,
  userId: true,
  name: true,
  createdAt: true,
};

const personSelect = {
  id: true,
  userId: true,
  name: true,
  notes: true,
  createdAt: true,
};

const incomeTypeSelect = {
  id: true,
  userId: true,
  name: true,
  createdAt: true,
};

function getModel(type) {
  if (type === "category") return prisma.category;
  if (type === "person") return prisma.person;
  if (type === "incomeType") return prisma.incomeType;

  return null;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "Falta userId." }, { status: 400 });
    }

    const [categories, people, incomeTypes] = await Promise.all([
      prisma.category.findMany({
        where: { userId },
        select: categorySelect,
        orderBy: { name: "asc" },
      }),
      prisma.person.findMany({
        where: { userId },
        select: personSelect,
        orderBy: { name: "asc" },
      }),
      prisma.incomeType.findMany({
        where: { userId },
        select: incomeTypeSelect,
        orderBy: { name: "asc" },
      }),
    ]);

    return NextResponse.json({
      categories,
      people,
      incomeTypes,
    });
  } catch (error) {
    console.error("Error loading settings:", error);

    return NextResponse.json(
      { error: "No se pudo cargar configuración." },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { userId, type, name, notes } = body;

    if (!userId || !type || !name) {
      return NextResponse.json(
        { error: "Faltan datos obligatorios." },
        { status: 400 },
      );
    }

    if (!allowedTypes.includes(type)) {
      return NextResponse.json(
        { error: "Tipo no permitido." },
        { status: 400 },
      );
    }

    const cleanName = name.trim();

    if (!cleanName) {
      return NextResponse.json(
        { error: "El nombre no puede estar vacío." },
        { status: 400 },
      );
    }

    if (type === "category") {
      const category = await prisma.category.create({
        data: {
          userId,
          name: cleanName,
        },
        select: categorySelect,
      });

      return NextResponse.json({ item: category });
    }

    if (type === "incomeType") {
      const incomeType = await prisma.incomeType.create({
        data: {
          userId,
          name: cleanName,
        },
        select: incomeTypeSelect,
      });

      return NextResponse.json({ item: incomeType });
    }

    if (type === "person") {
      const person = await prisma.person.create({
        data: {
          userId,
          name: cleanName,
          notes: notes?.trim() || null,
        },
        select: personSelect,
      });

      return NextResponse.json({ item: person });
    }
  } catch (error) {
    console.error("Error creating setting:", error);

    if (error.code === "P2002") {
      return NextResponse.json(
        { error: "Ya existe un registro con ese nombre." },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { error: "No se pudo crear el registro." },
      { status: 500 },
    );
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const id = searchParams.get("id");

    if (!type || !id) {
      return NextResponse.json({ error: "Faltan type o id." }, { status: 400 });
    }

    const model = getModel(type);

    if (!model) {
      return NextResponse.json(
        { error: "Tipo no permitido." },
        { status: 400 },
      );
    }

    await model.delete({
      where: { id },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting setting:", error);

    return NextResponse.json(
      {
        error:
          "No se pudo eliminar. Puede que este registro ya esté siendo usado.",
      },
      { status: 500 },
    );
  }
}
