import { apiFetch } from '@/lib/apiFetch';
import { parseTransferResponse, type TransferCommand, type ReverseTransferCommand, type TransferMutation, type TransferResponse, type ReverseTransferResponse } from './transferContracts';

export interface TransferRequestOptions {
  expectedUserId: string;
  signal?: AbortSignal;
  errorMode?: 'dialog' | 'inline';
}

export function sendTransfer(command: TransferCommand, options: TransferRequestOptions): Promise<TransferResponse>;
export function sendTransfer(command: ReverseTransferCommand, options: TransferRequestOptions): Promise<ReverseTransferResponse>;
export function sendTransfer(command: TransferMutation, options: TransferRequestOptions): Promise<TransferResponse | ReverseTransferResponse>;
export async function sendTransfer(command: TransferMutation, options: TransferRequestOptions) {
  // No normalizar el cuerpo: texto monetario y número tienen huellas distintas.
  const response: unknown = await apiFetch('/api/money', {
    ...options, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command),
    validateResponse: (value: unknown) => { parseTransferResponse(command.action, value); },
  });
  // El JSON se valida también dentro de la recuperación HTTP compartida.
  if (!(response instanceof Response)) throw new Error('Respuesta incompleta de Mi dinero.');
  const value: unknown = await response.json();
  return parseTransferResponse(command.action, value);
}
