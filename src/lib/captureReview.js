import { z } from "zod";
import { Prisma } from "@prisma/client";
import { ApiAccessError, requireOwnedReferences } from "@/lib/apiAuth";

export const captureDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
export const captureAmount = z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/).refine(value => new Prisma.Decimal(value).greaterThan(0));
export const correctionSchema = z.object({ cardId: z.string().min(1), date: captureDate, amount: captureAmount,
  merchant: z.string().trim().min(1).max(200), categoryId: z.string().min(1), currency: z.literal("MXN"),
}).strict();

export function effectiveCapture(movement) { return { ...movement.proposal, ...movement.correction }; }

export async function correctCapture(tx, movement, input) {
  const parsed = correctionSchema.safeParse(input.correction);
  if (!parsed.success) throw new ApiAccessError("Revisa tarjeta, fecha, importe MXN, concepto y categoría.", 400);
  if (!["REVIEW", "OBSERVED"].includes(movement.status)) throw new ApiAccessError("Este aviso ya se resolvió. Edita su registro financiero.", 409);
  if (input.expectedCorrection !== JSON.stringify(movement.correction ?? null)) throw new ApiAccessError("El aviso cambió en otra pantalla. Actualiza antes de corregirlo.", 409);
  await requireOwnedReferences(tx, movement.userId, parsed.data, ["cardId", "categoryId"]);
  return tx.captureMovement.update({ where: { id: movement.id }, data: {
    correction: parsed.data, cardId: parsed.data.cardId, amount: parsed.data.amount,
    operationDate: new Date(`${parsed.data.date}T12:00:00Z`),
  } });
}

// Conciliar es una decisión explícita; CONFIRMED histórico no implica cotejo.
export function captureInboxState(movement) {
  if (movement.status === "DISCARDED") return "DISCARDED";
  if (["REVIEW", "OBSERVED"].includes(movement.status)) return "REVIEW";
  return (movement.expense || movement.installmentPurchase)?.reconciledAt ? "RECONCILED" : "REGISTERED";
}

export function captureInboxWhere(status) {
  if (status === "REVIEW") return { status: { in: ["REVIEW", "OBSERVED"] } };
  if (status === "DISCARDED") return { status: "DISCARDED" };
  const reconciled = { OR: [{ expense: { reconciledAt: { not: null } } }, { installmentPurchase: { reconciledAt: { not: null } } }] };
  if (status === "RECONCILED") return { status: { in: ["REGISTERED", "LINKED", "CONVERTED"] }, ...reconciled };
  if (status === "REGISTERED") return { status: { in: ["REGISTERED", "LINKED", "CONVERTED"] }, NOT: reconciled };
  return status ? { status } : {};
}
