import type { CardCycle } from '@prisma/client';
import type { CaptureDb, Movement } from '@/lib/captureTypes';
import { captureInput } from '@/lib/captureJson';
import { captureCorrection } from '@/lib/captureJson';
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { ApiAccessError } from "@/lib/apiAuth";
import { captureDate, captureAmount } from "@/lib/captureReview";
import { paymentCaptureKind, paymentStatementPeriod } from "@/lib/capturePaymentParsers";
import { getStoredCycleStatus } from "@/lib/calculations/cardCyclePayments";

const money = (value: Prisma.Decimal.Value | null | undefined) => new Prisma.Decimal(value ?? 0);
function day(value: Date | string): string;
function day(value: Date | string | null | undefined): string | null;
function day(value: Date | string | null | undefined) { return value ? new Date(value).toISOString().slice(0, 10) : null; }
const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Mexico_City" }).format(new Date());
const inputSchema = z.object({ cycleId: z.string().min(1), amount: captureAmount.refine(value => money(value).lte("9999999999.99")),
  date: captureDate, currency: z.literal("MXN"), confirmedApplied: z.literal(true),
  expectedPaidAmount: z.string().regex(/^\d+(?:\.\d{1,2})?$/), expectedPaidAt: z.string().nullable(),
  statementConcept: z.string().trim().max(100).optional(), distinct: z.boolean().optional(),
}).strict();

export async function capturePaymentDetail(db: CaptureDb, userId: string, movement: Movement) {
  const payment = await db.cardCyclePayment.findUnique({ where: { movementId: movement.id }, include: { cycle: { select: { cardId: true, month: true, year: true } } } });
  if (payment && payment.userId !== userId) throw new ApiAccessError("Pago no encontrado.", 404);
  const cycles = await db.cardCycle.findMany({ where: { userId }, orderBy: [{ year: "desc" }, { month: "desc" }],
    select: { id: true, cardId: true, month: true, year: true, statementAmount: true, paidAmount: true, paidAt: true, postCutCreditAmount: true } });
  return { payment, cycles };
}

// El total manual conserva su contrato. Los importes identificados no se pueden
// borrar indirectamente: primero se revierte o desvincula su evidencia.
export async function guardCapturedPaymentTotal(tx: Prisma.TransactionClient, current: Pick<CardCycle, 'id' | 'userId' | 'paidAmount' | 'paidAt'>, changes: { paidAmount?: Prisma.Decimal.Value | null; paidAt?: Date | string | null }) {
  if (!("paidAmount" in changes) && !("paidAt" in changes)) return;
  const payments = await tx.cardCyclePayment.findMany({ where: { userId: current.userId, cycleId: current.id, reversedAt: null } });
  const identified = payments.reduce((sum, row) => sum.add(row.amount), money(0));
  const next = { ...current, ...changes };
  if (money(next.paidAmount).lt(identified) || payments.some(row => !next.paidAt || day(next.paidAt) < day(row.date))) {
    throw new ApiAccessError("Este total incluye pagos identificados en Captura automática. Deshaz o desvincula esos pagos en la bandeja antes de reducir el total o su fecha.", 409);
  }
}

export async function resolveCapturePayment(tx: Prisma.TransactionClient, movement: Movement, rawInput: unknown) {
  const input = captureInput(rawInput);
  const { userId } = movement;
  if (!paymentCaptureKind(movement)) throw new ApiAccessError("Interpreta primero el aviso como pago o cargo de cuenta.", 409);
  const existing = await tx.cardCyclePayment.findUnique({ where: { movementId: movement.id } });
  if (input.action === "reversePayment") {
    if (!existing || existing.userId !== userId) throw new ApiAccessError("Pago no encontrado.", 404);
    if (existing.reversedAt) return movement;
    await tx.$queryRaw`SELECT id FROM card_cycles WHERE id = ${existing.cycleId} AND "userId" = ${userId} FOR UPDATE`;
    const cycle = await tx.cardCycle.findFirst({ where: { id: existing.cycleId, userId } });
    if (!cycle) throw new ApiAccessError("Ciclo no encontrado.", 404);
    const amount = money(cycle.paidAmount).sub(existing.kind === "CAPTURE" ? existing.amount : 0);
    if (amount.lt(0)) throw new ApiAccessError("El total del corte cambió. Revisa sus pagos antes de deshacer este abono.", 409);
    // La fecha acumulada se conserva como última fecha conocida; con cero se limpia.
    const changes = { paidAmount: amount.isZero() ? null : amount, paidAt: amount.isZero() ? null : cycle.paidAt };
    await tx.cardCyclePayment.update({ where: { id: existing.id }, data: { reversedAt: new Date() } });
    if (existing.kind === "CAPTURE") await tx.cardCycle.update({ where: { id: cycle.id }, data: { ...changes, status: getStoredCycleStatus({ ...cycle, ...changes }) } });
    return tx.captureMovement.update({ where: { id: movement.id }, data: { reason: "PAYMENT_REVERSED" } });
  }
  const parsed = inputSchema.safeParse(input.payment);
  if (!parsed.success) throw new ApiAccessError("Revisa el corte, importe, fecha y confirmación de pago aplicado en MXN.", 400);
  const p = parsed.data, kind = input.action === "linkPayment" ? "EXISTING" : "CAPTURE";
  // El recibo sobrevive a la reversión; no se reaplica un aviso antiguo.
  if (existing) {
    if (existing.userId !== userId || existing.cycleId !== p.cycleId || existing.kind !== kind || !money(existing.amount).equals(p.amount) || day(existing.date) !== p.date) {
      throw new ApiAccessError("Este aviso ya tiene otra resolución. Actualiza para consultarla.", 409);
    }
    return movement;
  }
  if (!["REVIEW", "OBSERVED"].includes(movement.status) || movement.expenseId || movement.installmentPurchaseId || captureCorrection(movement.correction)) {
    throw new ApiAccessError("El aviso ya tiene una resolución o corrección de compra.", 409);
  }
  if (p.date > today()) throw new ApiAccessError("La fecha del pago no puede ser futura.", 400);
  await tx.$queryRaw`SELECT id FROM card_cycles WHERE id = ${p.cycleId} AND "userId" = ${userId} FOR UPDATE`;
  const cycle = await tx.cardCycle.findFirst({ where: { id: p.cycleId, userId } });
  if (!cycle) throw new ApiAccessError("Ciclo no encontrado.", 404);
  if (cycle.statementAmount == null) throw new ApiAccessError("Captura el estado de cuenta de ese corte antes de registrar el pago.", 409);
  const paidDay = day(cycle.paidAt);
  if (paidDay && paidDay > today()) throw new ApiAccessError("El corte tiene una fecha de pago futura. Corrígela en Tarjetas antes de agregar un abono recibido.", 409);
  if (!money(cycle.paidAmount).equals(p.expectedPaidAmount) || paidDay !== p.expectedPaidAt) {
    throw new ApiAccessError("El total pagado cambió. Actualiza el aviso antes de continuar.", 409);
  }
  const period = paymentStatementPeriod(p.statementConcept);
  if (p.statementConcept && (!period || period.month !== cycle.month || (period.year && period.year !== cycle.year))) {
    throw new ApiAccessError("El concepto no corresponde al corte seleccionado. Confirma también el año.", 409);
  }
  const payments = await tx.cardCyclePayment.findMany({ where: { userId, cycleId: cycle.id, reversedAt: null } });
  const identified = payments.reduce((sum, row) => sum.add(row.amount), money(0));
  if (kind === "EXISTING" && money(cycle.paidAmount).sub(identified).lt(p.amount)) {
    throw new ApiAccessError("No queda suficiente pago sin identificar en este total. Revisa las evidencias ya vinculadas.", 409);
  }
  // Mismo importe y fechas cercanas no prueba identidad ni una compra distinta.
  const nearby = await tx.cardCyclePayment.findMany({ where: { userId, cycle: { cardId: cycle.cardId }, amount: p.amount, reversedAt: null,
    date: { gte: new Date(new Date(`${p.date}T12:00:00Z`).getTime() - 3 * 86400000), lte: new Date(new Date(`${p.date}T12:00:00Z`).getTime() + 3 * 86400000) } } });
  if (kind === "CAPTURE" && !p.distinct && (nearby.length || money(cycle.paidAmount).gt(0))) {
    throw new ApiAccessError("Ya hay pagos en esta tarjeta. Vincula el aviso al total existente o confirma que es otro abono.", 409);
  }
  await tx.cardCyclePayment.create({ data: { userId, cycleId: cycle.id, movementId: movement.id, amount: p.amount, date: new Date(`${p.date}T12:00:00Z`), kind } });
  const total = money(cycle.paidAmount).add(kind === "CAPTURE" ? p.amount : 0);
  const date = paidDay && paidDay > p.date ? cycle.paidAt : new Date(`${p.date}T12:00:00Z`);
  if (kind === "EXISTING" && paidDay && p.date > paidDay) throw new ApiAccessError("La fecha supera la del último pago registrado. Revisa el total y su fecha en Tarjetas.", 409);
  if (kind === "CAPTURE") {
    const changes = { paidAmount: total, paidAt: date };
    await tx.cardCycle.update({ where: { id: cycle.id }, data: { ...changes, status: getStoredCycleStatus({ ...cycle, ...changes }) } });
  }
  return tx.captureMovement.update({ where: { id: movement.id }, data: { status: "REGISTERED",
    reason: kind === "CAPTURE" ? "PAYMENT_REGISTERED" : "PAYMENT_LINKED", cardId: cycle.cardId, amount: p.amount,
    operationDate: new Date(`${p.date}T12:00:00Z`), correction: { ...p, cardId: cycle.cardId, movementType: "CARD_PAYMENT",
      merchant: "Pago de tarjeta", dateSource: "OWNER_CONFIRMED", currencySource: "OWNER_CONFIRMED" }, resolvedAt: new Date() } });
}
