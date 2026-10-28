import { z } from 'zod';
import { transferSchema, transferCommandSchema, type TransferCommand } from '@/lib/money/transferContracts';

import type { EditorConfiguration } from './editorContracts';
export type TransferEditorConfiguration = Extract<EditorConfiguration, { action: 'TRANSFER' }>;

export function createTransferEditor(accounts: unknown, today: string): TransferEditorConfiguration {
  // Aceptar también consumidores externos del editor; solo requiere IDs/nombres.
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
