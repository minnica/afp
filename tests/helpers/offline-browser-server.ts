// Fixture aislada: IndexedDB/Web Locks reales; API/recibos en memoria, sin Supabase.
// node --import tsx tests/helpers/offline-browser-server.ts (http://127.0.0.1:4192)
import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { SyncedOfflineExpense } from '../../src/lib/offlineExpenseContracts';
import { isRecord } from '../../src/lib/financialJson';
import { buildBrowserModule } from './browser-module';

async function main() {
  const receipts = new Map<string, SyncedOfflineExpense>();
  const requests: string[] = [];
  const held: (() => void)[] = [];
  const mocks = { '@/lib/apiFetch': 'export const apiFetch = (url, options) => fetch(url, options);' };
  const [moduleSource, observerSource] = await Promise.all([
    buildBrowserModule('src/lib/offlineExpenses.ts', mocks), buildBrowserModule('src/lib/offlineExpenseObserver.ts', mocks),
  ]);
  const json = (res: ServerResponse, value: unknown) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); };
  const handler = async (req: IncomingMessage, res: ServerResponse) => {
    if (req.url === '/queue.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(moduleSource); return; }
    if (req.url === '/observer.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(observerSource); return; }
    if (req.url === '/state') { json(res, { requests, receipts: [...receipts.values()], held: held.length }); return; }
    if (req.url === '/release') { held.splice(0).forEach(send => send()); json(res, { ok: true }); return; }
    if (req.url === '/api/expenses') {
      let text = '';
      for await (const chunk of req) {
        if (typeof chunk === 'string' || Buffer.isBuffer(chunk)) text += chunk.toString();
        else throw new Error('Cuerpo HTTP no válido.');
      }
      const body: unknown = JSON.parse(text);
      if (!isRecord(body) || typeof body.operationId !== 'string') {
        res.statusCode = 400; json(res, { error: 'Falta operationId en el fixture.' }); return;
      }
      const first = !receipts.has(body.operationId);
      const operationId = body.operationId;
      requests.push(body.operationId);
      if (first) receipts.set(body.operationId, { id: body.operationId, concept: body.concept });
      const send = () => json(res, { expense: receipts.get(operationId) });
      if (first && body.concept === 'perdida') { res.setHeader('Content-Type', 'application/json'); res.end('{"expense":'); return; }
      if (first && body.concept === 'cierre') { held.push(send); return; }
      send(); return;
    }
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><meta charset="utf-8"><title>A02 · prueba aislada</title><h1>Cola offline: prueba aislada</h1><p>IndexedDB y Web Locks reales; servidor en memoria.</p><script type="module">import * as q from "/queue.js"; import { observeOfflineExpenses } from "/observer.js"; window.q = q; window.observeOfflineExpenses = observeOfflineExpenses;</script>');
  };
  const server = http.createServer((req, res) => {
    void handler(req, res).catch((error: unknown) => { console.error(error); res.destroy(); });
  });
  const shutdown = () => { held.splice(0); server.close(); server.closeAllConnections(); };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  server.once('close', () => { process.removeListener('SIGTERM', shutdown); process.removeListener('SIGINT', shutdown); });
  server.once('error', (error: Error) => { shutdown(); console.error(error); process.exitCode = 1; });
  server.listen(4192, '127.0.0.1', () => console.log('Fixture A02: http://127.0.0.1:4192'));
}
void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
