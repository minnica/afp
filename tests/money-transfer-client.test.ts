import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { sourceLoader } from './helpers/load-source';
import { record, array, call } from './helpers/dynamic-values';
import type { SourceMocks } from './helpers/source-contracts';
import type { TransferCommand } from '../src/lib/money/transferContracts';
import type { TransferRequestOptions } from '../src/lib/money/transferClient';
import type { EditorSubmission } from '../src/components/mi-dinero/editorContracts';

const command = (): TransferCommand => ({ action: 'TRANSFER', operationId: randomUUID(), fromAccountId: 'a', toAccountId: 'b', amount: '12.50', date: '2026-10-27', concept: 'Prueba' });
function client() {
  let userId = 'owner';
  let handler: typeof fetch = async () => Response.json({ ok: true, id: 'saved' });
  const requests: { url: RequestInfo | URL; init: RequestInit & { headers: Headers } }[] = [];
  const load = sourceLoader({ '@/lib/supabase': { supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: userId }, access_token: 'fictitious' } } }) } } } }, {
    Response, fetch: async (url, init) => {
      assert.ok(init?.headers instanceof Headers);
      requests.push({ url, init: { ...init, headers: init.headers } }); return handler(url, init);
    },
  });
  return { load, requests, setUser: (id: string) => { userId = id; }, respond: (fn: typeof fetch) => { handler = fn; }, ...load('src/lib/money/transferClient.ts') };
}
const options = { expectedUserId: 'owner', errorMode: 'inline' } satisfies TransferRequestOptions;

function request(c: ReturnType<typeof client>, index: number) {
  const entry = c.requests[index];
  assert.ok(entry);
  return entry;
}

test('transferencias: cliente conserva el cuerpo, UUID, cuenta esperada y respuesta por acción', async () => {
  const c = client(), body = command();
  assert.deepEqual(JSON.parse(JSON.stringify(await c.sendTransfer(body, options))), { ok: true, id: 'saved' });
  assert.equal(request(c, 0).init.body, JSON.stringify(body));
  assert.equal(request(c, 0).init.headers.get('Authorization'), 'Bearer fictitious');
  assert.equal(Reflect.get(request(c, 0).init, 'validateResponse'), undefined, 'el validador no se envía a fetch');
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
  assert.equal(recovery.getRecoverySnapshot().items[0]?.title, 'Revisa si se guardó');
  recovery.dismissRecovery(); await rejected; unsubscribe();
  c.respond(async () => Response.json({ ok: true, id: 'saved' }));
  await c.sendTransfer(body, options);
  assert.equal(request(c, 0).init.body, request(c, 1).init.body, 'el reintento conserva el UUID y los valores originales');
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
  assert.equal(request(c, 0).init.body, request(c, 1).init.body);
});

test('transferencias: editor compartido valida el formulario y conserva configuración y UUID al reintentar', async () => {
  let values: unknown;
  const controls = new Proxy({}, { get: (_, name) => name });
  const mocks = Object.fromEntries(['dialog', 'field', 'input', 'checkbox', 'alert', 'responsive-select', 'collapsible', 'button'].map(name => [`@/components/ui/${name}`, controls]));
  const editorMocks = { ...mocks,
    '@/lib/money/client': { errorMessage: (error, fallback) => error !== null && typeof error === 'object' && 'message' in error && typeof error.message === 'string' ? error.message : fallback },
    react: { useRef: current => ({ current }), useState: <T>(initial: T | (() => T)) => [typeof initial === 'function' ? (initial as () => T)() : initial, () => {}] },
    'react-hook-form': {
      useForm: () => ({ control: {}, formState: { errors: {} }, handleSubmit: submit => () => submit(editor.schema.parse(values)) }),
      useWatch: () => undefined,
    },
    '@hookform/resolvers/zod': { zodResolver: () => undefined },
  } satisfies SourceMocks;
  const load = sourceLoader(editorMocks, { crypto: { randomUUID } });
  const { createTransferEditor } = load('src/components/mi-dinero/transferEditor.ts');
  const Editor = load('src/components/mi-dinero/MoneyEditor.tsx').default;
  const editor = createTransferEditor([{ id: 'a', name: 'Origen', balance: 100 }, { id: 'b', name: 'Destino' }], '2026-10-27');
  const saved: EditorSubmission[] = [], restoreFocus = () => {};
  let closed = 0, fail = true;
  const element = Editor({ editor, onClose: () => { closed++; }, restoreFocus, onSave: async value => {
    saved.push(value);
    if (fail) throw new TypeError('Respuesta perdida');
  } });
  const content = record(record(element.props).children);
  const contentProps = record(content.props);
  assert.equal(contentProps.onCloseAutoFocus, restoreFocus);
  const form = record(array(contentProps.children).find(child => child !== null && typeof child === 'object' && 'type' in child && child.type === 'form'));
  const submitForm = () => call(record(form.props).onSubmit, {});
  assert.equal(editor.values.amount, '');
  assert.deepEqual(Array.from(editor.fields, f => f.name), ['fromAccountId', 'toAccountId', 'amount', 'date', 'concept']);
  values = command();
  // El editor crea el recibo, sin aceptar uno del formulario.
  const submit = async () => { submitForm(); await new Promise(resolve => setImmediate(resolve)); };
  await submit();
  assert.equal(closed, 0);
  fail = false;
  await submit();
  assert.equal(closed, 1);
  const first = saved[0]; assert.ok(first?.action === 'TRANSFER');
  assert.equal(first.amount, 12.5); assert.match(first.operationId, /^[\da-f-]{36}$/);
  assert.deepEqual(saved[0], saved[1]);
  values = { ...record(values), amount: '13.75' };
  await submit();
  const third = saved[2]; assert.ok(third?.action === 'TRANSFER');
  assert.notEqual(third.operationId, first.operationId);
  assert.equal(third.amount, 13.75);
  values = { ...record(values), toAccountId: 'a' };
  assert.throws(() => submitForm(), /Selecciona otra cuenta/);
  values = { action: 'REVERSE_TRANSFER', id: 'saved' };
  assert.throws(() => submitForm());
  assert.equal(saved.length, 3);
});


test('Mi dinero: cliente conserva el cuerpo original y exige recibos de alta completos', async () => {
  const c = client(), { sendMoney } = c.load('src/lib/money/client.ts');
  const body = { action: 'WITHDRAWAL', operationId: randomUUID(), accountId: 'a', amount: '12.50', date: '2026-10-27', concept: '  Retiro  ', legacyMetadata: 'conservar' } as const;
  await sendMoney(body, options);
  assert.equal(request(c, 0).init.body, JSON.stringify(body));
  c.respond(async () => Response.json({ ok: true }));
  await assert.rejects(sendMoney(body, options), { kind: 'invalid', retryable: false });
  assert.deepEqual(JSON.parse(JSON.stringify(await sendMoney({ action: 'REVERSE_WITHDRAWAL', operationId: randomUUID(), id: 'saved' }, options))), { ok: true });
});

test('Mi dinero: una consulta incompleta entra en recuperación sin publicar datos inválidos', async () => {
  const c = client(), { loadMoney } = c.load('src/lib/money/client.ts');
  c.respond(async () => Response.json({ forecast: {} }));
  await assert.rejects(loadMoney(new URLSearchParams(), options), { kind: 'invalid', retryable: true });
});
