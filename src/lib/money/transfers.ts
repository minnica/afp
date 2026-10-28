import type { MoneyData } from './data';
import type { Prisma } from '@prisma/client';
import { ApiAccessError } from '@/lib/apiAuth';
import { transferMutationSchema, type TransferResponse, type ReverseTransferResponse } from './transferContracts';

// El llamador mantiene el lock por propietario, la huella del cuerpo ORIGINAL
// y el recibo en esta misma transacción. Aquí nunca se abre otra transacción.
export async function executeTransfer(
  tx: Prisma.TransactionClient, userId: string, body: unknown, data: Pick<MoneyData, 'accounts' | 'transfers'>,
): Promise<TransferResponse | ReverseTransferResponse> {
  const parsed = transferMutationSchema.safeParse(body);
  if (!parsed.success) throw new ApiAccessError(parsed.error.issues[0]?.message ?? 'Referencia no válida.', 400);
  const command = parsed.data;
  if (command.action === 'TRANSFER') {
    const values = { fromAccountId: command.fromAccountId, toAccountId: command.toAccountId, amount: command.amount, date: command.date, concept: command.concept };
    const accounts = data.accounts.filter(account => [values.fromAccountId, values.toAccountId].includes(account.id));
    // Primero comprobar ambas referencias, igual que en el servicio anterior.
    if (accounts.length !== 2) throw new ApiAccessError('Registro no encontrado.', 404);
    if (accounts.some(account => values.date < account.asOf.toISOString().slice(0, 10))) {
      throw new ApiAccessError('La transferencia debe ser posterior al saldo inicial de ambas cuentas.', 400);
    }
    const transfer = await tx.moneyTransfer.create({ data: { ...values, date: new Date(values.date), userId }, select: { id: true } });
    return { ok: true, id: transfer.id };
  }
  const transfer = data.transfers.find(transfer => transfer.id === command.id);
  if (!transfer) throw new ApiAccessError('Registro no encontrado.', 404);
  const accounts = data.accounts.filter(account => [transfer.fromAccountId, transfer.toAccountId].includes(account.id));
  if (accounts.some(account => account.asOf.toISOString().slice(0, 10) > transfer.date.toISOString().slice(0, 10))) {
    throw new ApiAccessError('La transferencia ya está incluida en una conciliación posterior. Corrige los saldos con una nueva conciliación.', 409);
  }
  await tx.moneyTransfer.update({ where: { id: transfer.id, userId }, data: { reversedAt: new Date() } });
  return { ok: true };
}
