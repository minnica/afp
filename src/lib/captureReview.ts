import type { Movement } from '@/lib/captureTypes';
import { captureInput } from '@/lib/captureJson';
import { captureCorrection, captureProposal } from '@/lib/captureJson';
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { ApiAccessError, requireOwnedReferences } from "@/lib/apiAuth";
import { calendarDaySchema, moneyInputSchema } from './financialValidation';

export const captureDate = calendarDaySchema;
export const captureAmount = z.string().refine(value => moneyInputSchema.safeParse(value).success).refine(value => Number(value) > 0);
export const correctionSchema = z.object({ cardId: z.string().min(1), date: captureDate, amount: captureAmount,
  merchant: z.string().trim().min(1).max(200), categoryId: z.string().min(1), currency: z.literal("MXN"),
}).strict();

export function effectiveCapture(movement: Pick<Movement, 'proposal' | 'correction'>) { return { ...captureProposal(movement.proposal), ...captureCorrection(movement.correction) }; }

export async function correctCapture(tx: Prisma.TransactionClient, movement: Movement, rawInput: unknown) {
  const input = captureInput(rawInput);
  const parsed = correctionSchema.safeParse(input.correction);
  if (!parsed.success) throw new ApiAccessError("Revisa tarjeta, fecha, importe MXN, concepto y categoría.", 400);
  if (!["REVIEW", "OBSERVED"].includes(movement.status)) throw new ApiAccessError("Este aviso ya se resolvió. Edita su registro financiero.", 409);
  if (input.expectedCorrection !== JSON.stringify(captureCorrection(movement.correction) ?? null)) throw new ApiAccessError("El aviso cambió en otra pantalla. Actualiza antes de corregirlo.", 409);
  await requireOwnedReferences(tx, movement.userId, parsed.data, ["cardId", "categoryId"]);
  return tx.captureMovement.update({ where: { id: movement.id }, data: {
    correction: parsed.data, cardId: parsed.data.cardId, amount: parsed.data.amount,
    operationDate: new Date(`${parsed.data.date}T12:00:00Z`),
  } });
}

// Conciliar es una decisión explícita; CONFIRMED histórico no implica cotejo.
export function captureInboxState(movement: Pick<Movement, 'status'> & { expense?: { reconciledAt: Date | string | null } | null; installmentPurchase?: { reconciledAt: Date | string | null } | null }) {
  if (movement.status === "DISCARDED") return "DISCARDED";
  if (["REVIEW", "OBSERVED"].includes(movement.status)) return "REVIEW";
  return (movement.expense || movement.installmentPurchase)?.reconciledAt ? "RECONCILED" : "REGISTERED";
}

export function captureInboxWhere(status: string | null): Prisma.CaptureMovementWhereInput {
  if (status === "REVIEW") return { status: { in: ["REVIEW", "OBSERVED"] } };
  if (status === "DISCARDED") return { status: "DISCARDED" };
  const reconciled = { OR: [{ expense: { reconciledAt: { not: null } } }, { installmentPurchase: { reconciledAt: { not: null } } }] };
  if (status === "RECONCILED") return { status: { in: ["REGISTERED", "LINKED", "CONVERTED"] }, ...reconciled };
  if (status === "REGISTERED") return { status: { in: ["REGISTERED", "LINKED", "CONVERTED"] }, NOT: reconciled };
  return status ? { status } : {};
}
