import type { TransferCommand, TransferValues, ReverseTransferCommand, TransferResponse } from '@/lib/money/transferContracts';
import { sendTransfer } from '@/lib/money/transferClient';
import type { MoneyEditorProps } from '@/components/mi-dinero/MoneyEditor';
import type { TransferEditorConfiguration } from '@/components/mi-dinero/transferEditor';

export const transfer: TransferCommand = { action: 'TRANSFER', operationId: 'uuid', fromAccountId: 'a', toAccountId: 'b', amount: '12.50', date: '2026-10-27', concept: 'Prueba' };
export const reverse: ReverseTransferCommand = { action: 'REVERSE_TRANSFER', operationId: 'uuid', id: 'transfer' };
// @ts-expect-error Una transferencia exige la cuenta de destino.
export const missingDestination: TransferCommand = { action: 'TRANSFER', operationId: 'uuid', fromAccountId: 'a', amount: 12, date: '2026-10-27', concept: 'Prueba' };
// @ts-expect-error La reversión exige el ID del movimiento y no acepta una transferencia.
export const incompatibleAction: ReverseTransferCommand = { ...transfer, action: 'REVERSE_TRANSFER' };
// @ts-expect-error La salida validada convierte el importe a número.
export const unparsedValues: TransferValues = { ...transfer, amount: '12.50' };
// @ts-expect-error El recibo del alta exige el ID persistido.
export const incompleteReceipt: TransferResponse = { ok: true };
// @ts-expect-error Los nombres de campos del editor deben existir en el formulario.
export const unknownField: TransferEditorConfiguration['fields'][number] = { name: 'bankAccount', label: 'Cuenta' };
// @ts-expect-error El editor compartido exige un callback para todas sus acciones.
export const wrongCallback: MoneyEditorProps['onSave'] = async (command: ReverseTransferCommand) => { void command; };

export async function clientContracts() {
  const created = await sendTransfer(transfer, { expectedUserId: 'owner' });
  const id: string = created.id;
  const reversed = await sendTransfer(reverse, { expectedUserId: 'owner' });
  // @ts-expect-error La respuesta de reversión no contiene el ID de una nueva transferencia.
  void reversed.id;
  // @ts-expect-error El cliente exige la cuenta autenticada esperada.
  await sendTransfer(transfer, {});
  return id;
}
