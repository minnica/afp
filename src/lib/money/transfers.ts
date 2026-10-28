import type { Prisma } from '@prisma/client';
import { ApiAccessError } from '@/lib/apiAuth';
import { transferMutationSchema, type TransferResponse, type ReverseTransferResponse } from './transferContracts';

// El llamador mantiene el lock por propietario, la huella del cuerpo ORIGINAL
// y el recibo en esta misma transacción. Aquí nunca se abre otra transacción.
export async function executeTransfer(
  tx: Prisma.TransactionClient, userId: string, body: unknown,
): Promise<TransferResponse | ReverseTransferResponse> {
  const parsed = transferMutationSchema.safeParse(body);
  if (!parsed.success) throw new ApiAccessError(parsed.error.issues[0]?.message ?? 'Referencia no válida.', 400);
  const command = parsed.data;
  if (command.action === 'TRANSFER') {
    const values = { fromAccountId: command.fromAccountId, toAccountId: command.toAccountId, amount: command.amount, date: command.date, concept: command.concept };
    const accounts = await tx.moneyAccount.findMany({
      where: { userId, id: { in: [values.fromAccountId, values.toAccountId] } }, select: { id: true, asOf: true },
    });
    // Primero comprobar ambas referencias, igual que en el servicio anterior.
    if (accounts.length !== 2) throw new ApiAccessError('Registro no encontrado.', 404);
    if (accounts.some(account => values.date < account.asOf.toISOString().slice(0, 10))) {
      throw new ApiAccessError('La transferencia debe ser posterior al saldo inicial de ambas cuentas.', 400);
    }
    const transfer = await tx.moneyTransfer.create({ data: { ...values, date: new Date(values.date), userId }, select: { id: true } });
    return { ok: true, id: transfer.id };
  }
  const transfer = await tx.moneyTransfer.findFirst({ where: { id: command.id, userId } });
  if (!transfer) throw new ApiAccessError('Registro no encontrado.', 404);
  const accounts = await tx.moneyAccount.findMany({
    where: { userId, id: { in: [transfer.fromAccountId, transfer.toAccountId] } }, select: { asOf: true },
  });
  if (accounts.some(account => account.asOf.toISOString().slice(0, 10) > transfer.date.toISOString().slice(0, 10))) {
    throw new ApiAccessError('La transferencia ya está incluida en una conciliación posterior. Corrige los saldos con una nueva conciliación.', 409);
  }
  await tx.moneyTransfer.update({ where: { id: transfer.id, userId }, data: { reversedAt: new Date() } });
  return { ok: true };
}
