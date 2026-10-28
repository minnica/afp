'use client';

import MoneyEditor from './MoneyEditor';
import { transferEditorCommand, type TransferEditorConfiguration } from './transferEditor';
import type { TransferCommand } from '@/lib/money/transferContracts';

export interface MoneyTransferEditorProps {
  editor: TransferEditorConfiguration;
  onClose: () => void;
  onSave: (command: TransferCommand) => Promise<void>;
  restoreFocus: (event: Event) => void;
}

// MoneyEditor conserva RHF, borrador, UUID y foco. Su interior JSX no se
// considera comprobado: validar el callback antes de entrar al flujo tipado.
export default function MoneyTransferEditor({ onSave, ...props }: MoneyTransferEditorProps) {
  return <MoneyEditor {...props} onSave={(payload: unknown) => onSave(transferEditorCommand(payload))} />;
}
