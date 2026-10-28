import { apiFetch, type ApiFetchOptions } from './apiFetch';
import { financialReadSchemas, validateFinancialResponse, type FinancialResource, type FinancialResponse } from './financialResponses';
// Explicit boundary for the JSX screens awaiting phase 6. Validation happens
// inside recovery, so an incomplete response preserves drafts and retry state.
export function financialFetch(url: string, options: ApiFetchOptions = {}) {
  return apiFetch(url, { ...options, validateResponse(value) {
    validateFinancialResponse(url, (options.method || 'GET').toUpperCase(), value);
    options.validateResponse?.(value);
  } });
}
export async function loadFinancial<K extends FinancialResource>(resource: K, params = new URLSearchParams(), options: ApiFetchOptions = {}): Promise<FinancialResponse<K>> {
  const response = await financialFetch(`/api/${resource}?${params}`, options);
  const value: unknown = await response.json();
  // The keyed schema determines K's output; the value has been parsed here.
  return financialReadSchemas[resource].parse(value) as FinancialResponse<K>;
}
