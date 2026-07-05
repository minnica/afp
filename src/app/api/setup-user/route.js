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

    await prisma.$transaction([
      prisma.user.upsert({
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
      }),
      prisma.category.createMany({
        data: defaultCategories.map((name) => ({
          userId,
          name,
        })),
        skipDuplicates: true,
      }),
      prisma.incomeType.createMany({
        data: defaultIncomeTypes.map((name) => ({
          userId,
          name,
        })),
        skipDuplicates: true,
      }),
    ]);

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
