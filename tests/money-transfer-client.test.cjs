const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomUUID } = require('node:crypto');
const { sourceLoader } = require('./helpers/load-source.cjs');

const command = () => ({ action: 'TRANSFER', operationId: randomUUID(), fromAccountId: 'a', toAccountId: 'b', amount: '12.50', date: '2026-10-27', concept: 'Prueba' });
function client() {
  let userId = 'owner', handler = async () => Response.json({ ok: true, id: 'saved' });
  const requests = [];
  const load = sourceLoader({ '@/lib/supabase': { supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: userId }, access_token: 'fictitious' } } }) } } } }, {
    Response, fetch: async (url, init) => { requests.push({ url, init }); return handler(url, init); },
  });
  return { load, requests, setUser: id => { userId = id; }, respond: fn => { handler = fn; }, ...load('src/lib/money/transferClient.ts') };
}
const options = { expectedUserId: 'owner', errorMode: 'inline' };

test('transferencias: cliente conserva el cuerpo, UUID, cuenta esperada y respuesta por acción', async () => {
  const c = client(), body = command();
  assert.deepEqual(JSON.parse(JSON.stringify(await c.sendTransfer(body, options))), { ok: true, id: 'saved' });
  assert.equal(c.requests[0].init.body, JSON.stringify(body));
  assert.equal(c.requests[0].init.headers.get('Authorization'), 'Bearer fictitious');
  assert.equal(c.requests[0].init.validateResponse, undefined, 'el validador no se envía a fetch');
  c.respond(async () => Response.json({ ok: true }));
  assert.deepEqual(JSON.parse(JSON.stringify(await c.sendTransfer({ action: 'REVERSE_TRANSFER', operationId: randomUUID(), id: 'saved' }, options))), { ok: true });
  c.setUser('other');
  await assert.rejects(c.sendTransfer(body, options), { kind: 'account' });
  assert.equal(c.requests.length, 2);
});

test('transferencias: respuesta inválida pasa por recuperación y conserva el resultado incierto', async () => {
  const c = client(), body = command(), recovery = c.load('src/lib/requestRecovery.ts');
  c.respond(async () => Response.json({ ok: true }));
  const unsubscribe = recovery.subscribeRecovery(() => {});
  const pending = c.sendTransfer(body, { expectedUserId: 'owner' });
  const rejected = assert.rejects(pending, { name: 'RequestError', kind: 'invalid', retryable: false });
  while (!recovery.getRecoverySnapshot().items.length) await new Promise(resolve => setImmediate(resolve));
  assert.equal(recovery.getRecoverySnapshot().items[0].title, 'Revisa si se guardó');
  recovery.dismissRecovery(); await rejected; unsubscribe();
  c.respond(async () => Response.json({ ok: true, id: 'saved' }));
  await c.sendTransfer(body, options);
  assert.equal(c.requests[0].init.body, c.requests[1].init.body, 'el reintento conserva el UUID y los valores originales');
});

test('transferencias: cancelación, validación HTTP y error de red conservan el error compartido', async () => {
  const c = client(), body = command(), controller = new AbortController();
  controller.abort(new DOMException('Cancelado', 'AbortError'));
  await assert.rejects(c.sendTransfer(body, { ...options, signal: controller.signal }), { name: 'AbortError' });
  assert.equal(c.requests.length, 0);
  c.respond(async () => Response.json({ error: 'Selecciona otra cuenta de destino.' }, { status: 400 }));
  await assert.rejects(c.sendTransfer(body, options), { status: 400, message: 'Selecciona otra cuenta de destino.' });
  c.respond(async () => { throw new TypeError('Red interrumpida'); });
  await assert.rejects(c.sendTransfer(body, options), { kind: 'network', retryable: false });
  assert.equal(c.requests[0].init.body, c.requests[1].init.body);
});

test('transferencias: frontera JSX valida el callback y conserva configuración y UUID del editor', async () => {
  const load = sourceLoader({ './MoneyEditor': { default: () => null } });
  const { createTransferEditor } = load('src/components/mi-dinero/transferEditor.ts');
  const Editor = load('src/components/mi-dinero/MoneyTransferEditor.tsx').default;
  const editor = createTransferEditor([{ id: 'a', name: 'Origen', balance: 100 }, { id: 'b', name: 'Destino' }], '2026-10-27');
  const saved = [], onClose = () => {}, restoreFocus = () => {};
  const element = Editor({ editor, onClose, restoreFocus, onSave: async value => { saved.push(value); } });
  assert.equal(element.props.editor, editor); assert.equal(element.props.onClose, onClose); assert.equal(element.props.restoreFocus, restoreFocus);
  assert.equal(editor.values.amount, '');
  assert.deepEqual(Array.from(editor.fields, f => f.name), ['fromAccountId', 'toAccountId', 'amount', 'date', 'concept']);
  const body = command();
  await element.props.onSave(body); await element.props.onSave(body);
  assert.equal(saved[0].amount, 12.5); assert.equal(saved[0].operationId, body.operationId);
  assert.deepEqual(saved[0], saved[1]);
  assert.throws(() => element.props.onSave({ ...body, toAccountId: 'a' }), /Selecciona otra cuenta/);
  assert.throws(() => element.props.onSave({ action: 'REVERSE_TRANSFER', id: 'saved', operationId: body.operationId }));
  assert.equal(saved.length, 2);
});


test('Mi dinero: cliente conserva el cuerpo original y exige recibos de alta completos', async () => {
  const c = client(), { sendMoney } = c.load('src/lib/money/client.ts');
  const body = { action: 'WITHDRAWAL', operationId: randomUUID(), accountId: 'a', amount: '12.50', date: '2026-10-27', concept: '  Retiro  ', legacyMetadata: 'conservar' };
  await sendMoney(body, options);
  assert.equal(c.requests[0].init.body, JSON.stringify(body));
  c.respond(async () => Response.json({ ok: true }));
  await assert.rejects(sendMoney(body, options), { kind: 'invalid', retryable: false });
  assert.deepEqual(JSON.parse(JSON.stringify(await sendMoney({ action: 'REVERSE_WITHDRAWAL', operationId: randomUUID(), id: 'saved' }, options))), { ok: true });
});

test('Mi dinero: una consulta incompleta entra en recuperación sin publicar datos inválidos', async () => {
  const c = client(), { loadMoney } = c.load('src/lib/money/client.ts');
  c.respond(async () => Response.json({ forecast: {} }));
  await assert.rejects(loadMoney(new URLSearchParams(), options), { kind: 'invalid', retryable: true });
});
