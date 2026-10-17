import { apiResponse as NextResponse, requireApiUser, apiAccessErrorResponse } from "@/lib/apiAuth";
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
    const user = await requireApiUser(request);
    const userId = user.id;
    const email = user.email;

    if (!email) {
      return NextResponse.json(
        { error: "La cuenta autenticada no tiene un correo disponible." },
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
    const accessResponse = apiAccessErrorResponse(error);
    if (accessResponse) return accessResponse;
    console.error("Error setting up user:", error);

    return NextResponse.json(
      { error: "No se pudo preparar el usuario." },
      { status: 500 },
    );
  }
}
