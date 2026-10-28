// Fixture aislada: IndexedDB/Web Locks reales; API/recibos en memoria, sin Supabase.
// node tests/helpers/offline-browser-server.cjs (http://127.0.0.1:4192)
const http = require("node:http");
const { buildBrowserModule } = require('./browser-module.cjs');
const receipts = new Map(), requests = [], held = [];
const moduleSource = buildBrowserModule('src/lib/offlineExpenses', {
  '@/lib/apiFetch': 'export const apiFetch = (url, options) => fetch(url, options);',
});
const json = (res, value) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(value)); };
http.createServer(async (req, res) => {
  if (req.url === "/queue.js") { res.setHeader("Content-Type", "text/javascript"); res.end(await moduleSource); return; }
  if (req.url === "/state") { json(res, { requests, receipts: [...receipts.values()], held: held.length }); return; }
  if (req.url === "/release") { held.splice(0).forEach(send => send()); json(res, { ok: true }); return; }
  if (req.url === "/api/expenses") {
    let text = ""; for await (const chunk of req) text += chunk;
    const body = JSON.parse(text), first = !receipts.has(body.operationId);
    requests.push(body.operationId);
    if (first) receipts.set(body.operationId, { id: body.operationId, concept: body.concept });
    const send = () => json(res, { expense: receipts.get(body.operationId) });
    if (first && body.concept === "perdida") { res.destroy(); return; }
    if (first && body.concept === "cierre") { held.push(send); return; }
    send(); return;
  }
  res.setHeader("Content-Type", "text/html");
  res.end('<!doctype html><title>A02 · prueba aislada</title><h1>Cola offline: prueba aislada</h1><p>IndexedDB y Web Locks reales; servidor en memoria.</p><script type="module">import * as q from "/queue.js"; window.q = q;</script>');
}).listen(4192, "127.0.0.1", () => console.log("Fixture A02: http://127.0.0.1:4192"));
