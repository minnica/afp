import { present } from './helpers/financial-fixtures';

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { record as objectValue } from './helpers/dynamic-values';
import { integrationLoader as sourceLoader } from './helpers/integration-fixtures';
function client(reply: unknown) {
  const calls: ({ url: string; options: RequestInit; })[] = [];
  const load = sourceLoader({ '@/lib/supabase': { supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: 'owner' }, access_token: 'fictitious' } } }) } } } }, {
    navigator: { onLine: true }, fetch: async (url, options) => { calls.push({ url, options }); return Response.json(reply); },
  });
  return { calls, uiFetch: load('src/lib/uiClient.ts').uiFetch, schemas: load('src/lib/uiResponseSchemas.ts').uiResponseSchemas };
}
test('cliente UI valida el recurso y conserva los metadatos y los valores serializados', async () => {
  const body = { categories: [{ id: 'c', name: 'Ficticia', metadata: { previousVersion: true } }], people: [], incomeTypes: [], revision: 2 };
  const { uiFetch, calls } = client(body);
  const response = await uiFetch('/api/settings?userId=owner', { errorMode: 'inline' });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), body);
  assert.equal(new Headers(present(present(calls[0]).options.headers)).get('Authorization'), 'Bearer fictitious');
});
test('una respuesta incompleta entra en recuperación antes de entregarse a la pantalla', async () => {
  const { uiFetch } = client({ categories: [] });
  await assert.rejects(uiFetch('/api/settings?userId=owner', { errorMode: 'inline' }), error => objectValue(error).kind === 'invalid');
});
test('el cliente valida el detalle de pagos MSI y conserva una cuenta no vinculada', async () => {
  const body = { purchase: { id: 'purchase', concept: 'Equipo ficticio' }, receivable: null, metadata: { version: 1 } };
  const valid = client(body);
  assert.deepEqual(await (await valid.uiFetch('/api/installment-purchases/payments?purchaseId=purchase', { errorMode: 'inline' })).json(), body);
  const invalid = client({ ...body, receivable: { incomes: [] } });
  await assert.rejects(invalid.uiFetch('/api/installment-purchases/payments?purchaseId=purchase', { errorMode: 'inline' }), error => objectValue(error).kind === 'invalid');
});
test('el contrato de interfaz acepta propuestas históricas parciales y rechaza importes estructurados', () => {
  const { schemas } = client({});
  assert.deepEqual(schemas['captures/movements'].parse({ movements: [], pendingCounts: {}, nextCursor: null }).movements, []);
  const partial = schemas['captures/movements'].options[1].shape.movements.element.shape.proposal;
  assert.deepEqual(partial.parse({ merchant: 'Aviso', missingFields: ['amount'] }), { merchant: 'Aviso', missingFields: ['amount'] });
  assert.throws(() => partial.parse({ amount: { value: '12.50' } }));
});
test('el cliente conserva el orden de la corrección usado por el control optimista', async () => {
  const correction = { merchant: 'Compra', currency: 'MXN', amount: '12.50', categoryId: 'c', cardId: 'card', date: '2026-10-28' };
  const body = { movement: { id: 'movement', events: [], cardId: 'card', status: 'REVIEW', amount: '12.50', expenseId: null, parserKey: null, reason: 'UNKNOWN_FORMAT', proposal: {}, correction, analysisHistory: null, operationDate: null, referenceKey: null, originalExpenseId: null, installmentPurchaseId: null, resolvedAt: null, fallbackDueAt: null }, candidates: [], receiptMetadata: { version: 1 } };
  const { uiFetch } = client(body);
  const response = await uiFetch('/api/captures/movements?id=movement', { errorMode: 'inline' });
  const result = await response.json();
  assert.equal(JSON.stringify(result.movement.correction), JSON.stringify(correction));
  assert.equal(JSON.stringify(result), JSON.stringify(body));
});
