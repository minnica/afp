import { isRecord } from '@/lib/financialJson';
import type { Prisma } from "@prisma/client";
import { readFinancialInput, isPrismaError } from "@/lib/financialContracts";
import { apiResponse as NextResponse, requireApiUser, apiAccessErrorResponse, requireOwnedReferences, ApiAccessError } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { creditBalanceSchema, getBalanceToday } from "@/lib/cardBalances";
import { createBalanceTracking, getTrackedCard, loadBalanceMovements, runBalanceSnapshot } from "@/lib/cardBalanceTracking";

const cardSelect = {
  id: true,
  userId: true,
  name: true,
  usualCutDay: true,
  usualDueDay: true,
  notes: true,
  creditLimit: true,
  usedBalance: true,
  balanceAsOf: true,
  balanceTracking: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CardSelect;

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    const userId = user.id;

    const cards = await runBalanceSnapshot(prisma, async (tx) => {
      const today = getBalanceToday();
      const records = await tx.card.findMany({
        where: { userId }, select: cardSelect, orderBy: { name: "asc" },
      });
      const movements = await loadBalanceMovements(tx, userId, records, today);
      return records.map((card) => getTrackedCard(card, movements, today));
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

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request);
    const userId = user.id;
    const body = readFinancialInput(await request.json());
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

    if (isPrismaError(error) && error.code === "P2002") {
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

export async function DELETE(request: Request) {
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

export async function PATCH(request: Request) {
  try {
    const user = await requireApiUser(request);
    const userId = user.id;
    const body = readFinancialInput(await request.json());
    await requireOwnedReferences(prisma, userId, body, []);

    const { id, name, usualCutDay, usualDueDay, notes } = body;

    if (!id) {
      return NextResponse.json({ error: "Falta id." }, { status: 400 });
    }

    if (body.action === "UPDATE_CREDIT_BALANCE") {
      const parsed = creditBalanceSchema().safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues[0]!.message }, { status: 400 });
      }
      if (typeof body.balanceCaptureId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.balanceCaptureId)) {
        throw new ApiAccessError("Actualiza la página antes de guardar el saldo del banco.", 400);
      }
      const card = await runBalanceSnapshot(prisma, async (tx) => {
        const today = getBalanceToday();
        const current = await tx.card.findUnique({ where: { id, userId }, select: cardSelect });
        if (!current) throw Object.assign(new Error("Registro no encontrado."), { code: "P2025" });
        if ((isRecord(current.balanceTracking) ? (isRecord(current.balanceTracking) ? current.balanceTracking.captureId : undefined) : undefined) === body.balanceCaptureId) {
          if (Number(current.creditLimit) !== parsed.data.creditLimit || Number(current.usedBalance) !== parsed.data.usedBalance || new Date(current.balanceAsOf!).toISOString().slice(0, 10) !== parsed.data.balanceAsOf) {
            throw new ApiAccessError("Este intento ya corresponde a otra captura de saldo. Cierra y vuelve a abrir el formulario.", 409);
          }
          const movements = await loadBalanceMovements(tx, userId, [current], today);
          return getTrackedCard(current, movements, today);
        }
        if (current.balanceTracking && body.expectedBalanceCaptureId !== (isRecord(current.balanceTracking) ? current.balanceTracking.captureId : undefined)) {
          throw new ApiAccessError("El saldo base cambió en otra pantalla. Cierra y vuelve a abrir el formulario para revisarlo.", 409);
        }
        const seed = { ...current, balanceTracking: { version: 1, day: today, startedAt: new Date().toISOString(), captureId: body.balanceCaptureId, baseExposureCents: "0" } };
        const movements = await loadBalanceMovements(tx, userId, [seed], today);
        const saved = await tx.card.update({
          where: { id, userId },
          data: {
            creditLimit: parsed.data.creditLimit, usedBalance: parsed.data.usedBalance,
            balanceAsOf: new Date(`${parsed.data.balanceAsOf}T00:00:00.000Z`),
            balanceTracking: createBalanceTracking(seed, movements, today, seed.balanceTracking.startedAt, body.balanceCaptureId!),
          }, select: cardSelect,
        });
        return getTrackedCard(saved, movements, today);
      });
      return NextResponse.json({ card });
    }

    if (body.action !== undefined) {
      return NextResponse.json({ error: "Acción no válida." }, { status: 400 });
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

    if (isPrismaError(error) && error.code === "P2002") {
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
