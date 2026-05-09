import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const defaultCategories = [
  "Comida",
  "Entretenimiento",
  "Transporte",
  "Chatarra",
  "Otros",
  "Salud",
  "Mascotas",
  "Ropa",
  "Servicios",
  "Casa",
  "Regalos",
];

const defaultIncomeTypes = [
  "Nómina",
  "Pago recibido",
  "Reembolso",
  "Ingreso extra",
  "Otro",
];

export async function POST(request) {
  try {
    const body = await request.json();
    const { userId, email } = body;

    if (!userId || !email) {
      return NextResponse.json(
        { error: "Faltan userId o email." },
        { status: 400 },
      );
    }

    await prisma.user.upsert({
      where: {
        id: userId,
      },
      update: {
        email,
      },
      create: {
        id: userId,
        email,
      },
    });

    for (const categoryName of defaultCategories) {
      await prisma.category.upsert({
        where: {
          userId_name: {
            userId,
            name: categoryName,
          },
        },
        update: {},
        create: {
          userId,
          name: categoryName,
        },
      });
    }

    for (const incomeTypeName of defaultIncomeTypes) {
      await prisma.incomeType.upsert({
        where: {
          userId_name: {
            userId,
            name: incomeTypeName,
          },
        },
        update: {},
        create: {
          userId,
          name: incomeTypeName,
        },
      });
    }

    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    console.error("Error setting up user:", error);

    return NextResponse.json(
      { error: "No se pudo preparar el usuario." },
      { status: 500 },
    );
  }
}
