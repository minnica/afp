import { z } from 'zod';
import { apiFetch, type ApiFetchOptions } from './apiFetch';
import { uiResponseSchemas, type UiResource, type UiResponse } from './uiResponseSchemas';
import { financialReadSchemas, financialWriteSchemas } from './financialResponses';

const mutationSchema = z.object({ error: z.string().optional(), ok: z.boolean().optional(), alreadyConfirmed: z.boolean().optional(), expenseId: z.string().optional(), url: z.string().optional() }).passthrough();
type MutationResult = z.output<typeof mutationSchema>;
export type ResourceResult<U extends string> = U extends `/api/card-cycles?${string}cycleId=${string}` ? Extract<UiResponse<'card-cycles'>, { cycle: unknown }>
  : U extends `/api/card-cycles${string}` ? Extract<UiResponse<'card-cycles'>, { cycles: unknown }>
  : U extends `/api/subscription-charges${string}` ? Extract<UiResponse<'subscription-charges'>, { charges: unknown }>
  : U extends `/api/captures/movements?id=${string}` ? Extract<UiResponse<'captures/movements'>, { movement: unknown }>
  : U extends `/api/captures/movements${string}` ? Extract<UiResponse<'captures/movements'>, { movements: unknown }>
  : U extends `/api/captures/devices${string}` ? Extract<UiResponse<'captures/devices'>, { devices: unknown }>
  : { [K in UiResource]: U extends `/api/${K}` | `/api/${K}?${string}` ? UiResponse<K> : never }[UiResource];
type WriteResult<U extends string> = { [K in keyof typeof financialWriteSchemas]: U extends `/api/${K}` | `/api/${K}?${string}` ? z.output<(typeof financialWriteSchemas)[K]> : never }[keyof typeof financialWriteSchemas];
type ReadResult<U extends string> = [ResourceResult<U>] extends [never] ? MutationResult : ResourceResult<U> & { error?: string | null };
export type Result<U extends string, O extends ApiFetchOptions> = O extends { method: 'GET' } ? ReadResult<U> : O extends { method: string }
  ? O extends { method: 'DELETE' } ? MutationResult
    : U extends '/api/card-cycles' ? O extends { method: 'PATCH' } ? Extract<WriteResult<U>, { cycle: unknown }> & { error?: string } : MutationResult
    : [WriteResult<U>] extends [never] ? MutationResult : WriteResult<U> & { error?: string }
  : ReadResult<U>;
export type UiHttpResponse<T> = Omit<Response, 'json'> & { json(): Promise<T> };

function parseUiResponse(url: string, method: string, value: unknown): unknown {
  const resource = new URL(url, 'http://localhost').pathname.slice(5);
  if (method === 'GET' && resource in uiResponseSchemas) return uiResponseSchemas[resource as UiResource].parse(value);
  if (resource === 'notice-dismissals') return financialReadSchemas['notice-dismissals'].parse(value);
  if (method !== 'DELETE' && resource in financialWriteSchemas) return financialWriteSchemas[resource as keyof typeof financialWriteSchemas].parse(value);
  return mutationSchema.parse(value);
}

// URL and method select the same schema at runtime and in the public signature.
// Validation runs inside apiFetch recovery, preserving the current form/draft.
export async function uiFetch<const U extends string, const O extends ApiFetchOptions = ApiFetchOptions>(url: U, options?: O): Promise<UiHttpResponse<Result<U, O>>> {
  const method = (options?.method || 'GET').toUpperCase();
  const response = await apiFetch(url, { ...options, validateResponse(value) {
    parseUiResponse(url, method, value);
    options?.validateResponse?.(value);
  } });
  // Return the original JSON, preserving key order, omitted fields and metadata
  // used by optimistic capture checks and historical operation receipts.
  return response as UiHttpResponse<Result<U, O>>;
}
