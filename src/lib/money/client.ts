import { apiFetch } from '@/lib/apiFetch';
import { moneyResponseSchema } from './responses';
import { parseMoneyResponse, type MoneyCommand, type MoneyResult } from './commands';
import type { TransferRequestOptions } from './transferClient';
export type MoneyRequestOptions = TransferRequestOptions & { mutationCompleted?: boolean };
export function errorMessage(error: unknown, fallback: string) { return error instanceof Error ? error.message || fallback : fallback; }
export async function loadMoney(params: URLSearchParams, options: MoneyRequestOptions) {
  const response: unknown = await apiFetch(`/api/money?${params}`, { ...options, validateResponse: (value: unknown) => { moneyResponseSchema.parse(value); } });
  if (!(response instanceof Response)) throw new Error('Respuesta incompleta de Mi dinero.');
  const body: unknown = await response.json();
  return moneyResponseSchema.parse(body);
}
export function sendMoney<C extends MoneyCommand>(command: C, options: MoneyRequestOptions): Promise<MoneyResult<C>>;
export async function sendMoney(command: MoneyCommand, options: MoneyRequestOptions) {
  const response: unknown = await apiFetch('/api/money', {
    ...options, validateResponse: (value: unknown) => { parseMoneyResponse(command, value); }, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command),
  });
  if (!(response instanceof Response)) throw new Error('Respuesta incompleta de Mi dinero.');
  const body: unknown = await response.json();
  return parseMoneyResponse(command, body);
}
