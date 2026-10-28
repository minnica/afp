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

// El editor compartido está tipado; este wrapper conserva el callback específico
// de transferencias para sus consumidores y contratos existentes.
export default function MoneyTransferEditor({ onSave, ...props }: MoneyTransferEditorProps) {
  return <MoneyEditor {...props} onSave={(payload: unknown) => onSave(transferEditorCommand(payload))} />;
}
