import type { Prisma } from '@prisma/client';
import type { Movement } from '@/lib/captureTypes';
import { captureInput } from '@/lib/captureJson';
import { captureProposal, captureSnapshot } from '@/lib/captureJson';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { ApiAccessError } from '@/lib/apiAuth';
import { accountDebitNotice } from '@/lib/captureMoneyParsers';
import { mutateMoney } from '@/lib/money/service';
import { day } from '@/lib/money/dates';

const correctionSchema = z.object({
  kind: z.enum(['TRANSFER', 'WITHDRAWAL', 'CARD_PAYMENT']),
  toAccountId: z.string().min(1).max(160).optional(),
  cycleId: z.string().min(1).max(160).optional(),
}).strict();

// Called inside the capture transaction, with the owner's financial lock held.
// Replace the expense and its effect together; keep the original notice and ID.
export async function correctDebitCapture(tx: Prisma.TransactionClient, movement: Movement, rawInput: unknown) {
  const input = captureInput(rawInput);
  const parsed = correctionSchema.safeParse(input.correction);
  if (!parsed.success) throw new ApiAccessError('Selecciona el tipo de movimiento y su destino.', 400);
  const v = parsed.data, userId = movement.userId;
  if ((v.kind === 'TRANSFER') !== !!v.toAccountId || (v.kind === 'CARD_PAYMENT') !== !!v.cycleId) throw new ApiAccessError('Revisa el destino del movimiento.', 400);
  const posting = await tx.captureMoneyPosting.findUnique({ where: { movementId: movement.id }, include: { expense: true } });
  if (!accountDebitNotice(movement) || !posting || movement.status !== 'REGISTERED') throw new ApiAccessError('Este aviso no tiene un gasto con débito para corregir.', 409);
  if (captureSnapshot(posting.snapshot).correction) {
    const previous = captureSnapshot(posting.snapshot).correction!;
    if (previous.kind === v.kind && previous.toAccountId === v.toAccountId && previous.cycleId === v.cycleId) return movement;
    throw new ApiAccessError('Este movimiento ya se corrigió. Revisa su registro en Mi dinero.', 409);
  }
  const expense = posting.expense, snapshot = captureSnapshot(posting.snapshot);
  if (posting.kind !== 'DEBIT_EXPENSE' || !expense || expense.userId !== userId || expense.paymentMethod !== 'DEBIT'
      || expense.debitAccountId !== snapshot.fromAccountId || Number(expense.amount) !== Number(snapshot.amount) || day(expense.date) !== snapshot.date
      || expense.refundOriginalAmount != null || expense.subscriptionId || expense.receivableAccountId || expense.payableAccountId || expense.personId
      || Number(expense.cashContributionAmount) || expense.reconciledAt) throw new ApiAccessError('El gasto cambió o tiene otros movimientos asociados. Revísalo desde Gastos antes de corregirlo.', 409);
  const from = await tx.moneyAccount.findFirst({ where: { id: expense.debitAccountId!, userId } });
  if (!from || snapshot.date < day(from.asOf)) throw new ApiAccessError('El movimiento ya está incluido en un saldo de referencia posterior. Revisa la cuenta.', 409);
  const to = v.toAccountId ? await tx.moneyAccount.findFirst({ where: { id: v.toAccountId, userId } }) : null;
  if (v.toAccountId && !to) throw new ApiAccessError('Cuenta de destino no encontrada.', 404);
  if (to && (to!.id === from.id || snapshot.date < day(to.asOf))) throw new ApiAccessError('Selecciona otra cuenta con un saldo de referencia anterior al movimiento.', 409);
  if (v.cycleId && !await tx.cardCycle.findFirst({ where: { id: v.cycleId, userId } })) throw new ApiAccessError('Corte de tarjeta no encontrado.', 404);
  const date = new Date(`${snapshot.date}T00:00:00Z`);
  const window = { gte: new Date(date.getTime() - 86400000), lte: new Date(date.getTime() + 2 * 86400000 - 1) };
  const common = { userId, amount: expense.amount, date: window, reversedAt: null };
  const candidate = v.kind === 'TRANSFER'
    ? await tx.moneyTransfer.findFirst({ where: { ...common, fromAccountId: from.id, toAccountId: to!.id } })
    : v.kind === 'WITHDRAWAL'
      ? await tx.moneyWithdrawal.findFirst({ where: { ...common, accountId: from.id } })
      : await tx.moneyCardPayment.findFirst({ where: { ...common, accountId: from.id, cycleId: v.cycleId } });
  if (candidate) throw new ApiAccessError('Ya hay un movimiento compatible en Mi dinero. Revisa si es el mismo antes de corregir el gasto.', 409);
  let record;
  if (v.kind === 'CARD_PAYMENT') {
    record = await mutateMoney({ transactionScope: 'existing', $transaction: async fn => fn(tx) }, userId, { action: 'CARD_PAYMENT', operationId: randomUUID(), accountId: from.id, cycleId: v.cycleId, amount: String(expense.amount), date: snapshot.date, additional: true });
  } else if (v.kind === 'TRANSFER') {
    record = await tx.moneyTransfer.create({ data: { userId, fromAccountId: from.id, toAccountId: to!.id, amount: expense.amount, date, concept: 'Transferencia entre mis cuentas' } });
  } else {
    record = await tx.moneyWithdrawal.create({ data: { userId, accountId: from.id, amount: expense.amount, date, concept: 'Retiro de efectivo' } });
  }
  await tx.expenseTombstone.upsert({ where: { expenseId: expense.id }, update: {}, create: { expenseId: expense.id, userId, cardId: expense.cardId, date: expense.date, amount: expense.amount, concept: expense.concept } });
  await tx.dailyExpense.delete({ where: { id: expense.id, userId } });
  await tx.captureMoneyPosting.update({ where: { id: posting.id }, data: {
    kind: v.kind, expenseId: null, transferId: v.kind === 'TRANSFER' ? record.id : null,
    withdrawalId: v.kind === 'WITHDRAWAL' ? record.id : null, cardPaymentId: v.kind === 'CARD_PAYMENT' ? record.id : null,
    snapshot: { ...snapshot, kind: v.kind, toAccountId: to?.id || null, toName: to?.name || null, correction: { ...v, at: new Date().toISOString(), previousExpense: { id: expense.id, concept: expense.concept, categoryId: expense.categoryId, amount: String(expense.amount), date: snapshot.date } } },
  } });
  return tx.captureMovement.update({ where: { id: movement.id }, data: { expenseId: null, reason: 'DEBIT_TYPE_CORRECTED', proposal: { ...captureProposal(movement.proposal), moneyKind: v.kind, toAccountId: to?.id || null, ...(v.cycleId ? { cycleId: v.cycleId } : {}) } } });
}
