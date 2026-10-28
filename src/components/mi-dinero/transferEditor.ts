import { z } from 'zod';
import { transferSchema, transferCommandSchema, type TransferFormInput, type TransferCommand } from '@/lib/money/transferContracts';

type TransferField = {
  name: keyof TransferFormInput;
  label: string;
  type?: 'number' | 'date';
  money?: boolean;
  options?: { value: string; label: string }[];
};
export interface TransferEditorConfiguration {
  title: string;
  description: string;
  action: 'TRANSFER';
  schema: typeof transferSchema;
  values: TransferFormInput;
  fields: TransferField[];
}

export function createTransferEditor(accounts: unknown, today: string): TransferEditorConfiguration {
  // La proyección permanece en JS: solo validar los datos usados por el piloto.
  const options = z.array(z.object({ id: z.string(), name: z.string() })).parse(accounts)
    .map(account => ({ value: account.id, label: account.name }));
  return {
    title: 'Transferir entre mis cuentas', description: 'Registra una transferencia realizada o programada. El total de tu dinero no cambia.',
    action: 'TRANSFER', schema: transferSchema,
    values: { fromAccountId: '', toAccountId: '', amount: '', date: today, concept: 'Transferencia entre mis cuentas' },
    fields: [
      { name: 'fromAccountId', label: 'Cuenta de origen', options },
      { name: 'toAccountId', label: 'Cuenta de destino', options },
      { name: 'amount', label: 'Importe', type: 'number', money: true },
      { name: 'date', label: 'Fecha', type: 'date' }, { name: 'concept', label: 'Concepto' },
    ],
  };
}

export function transferEditorCommand(payload: unknown): TransferCommand {
  return transferCommandSchema.parse(payload);
}
