import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { PrismaClient, type Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { sourceLoader } from './helpers/load-source.ts';
import { record } from './helpers/dynamic-values';
import { moneyResponseSchema } from '../src/lib/money/responses';
import type { TransferCommand, TransferResponse } from '../src/lib/money/transferContracts';

interface JsonReply { body: Record<string, unknown>; status: number }
async function reply(response: Response): Promise<JsonReply> {
  return { body: record(await response.json()), status: response.status };
}
const connectionString = process.env.AFP_TEST_DATABASE_URL;

test('piloto TS: transferencias, recibos, concurrencia, rollback y límites con PostgreSQL', { skip: !connectionString }, async t => {
  assert.ok(connectionString);
  const url = new URL(connectionString);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && /^\/afp_test[a-zA-Z0-9_]*$/.test(url.pathname) && !url.search);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const user = await db.user.create({ data: { email: `transfer-${randomUUID()}@example.test` } });
  const other = await db.user.create({ data: { email: `transfer-${randomUUID()}@example.test` } });
  let actor = user.id, failReceipt = false;
  // La escritura y la transacción siguen siendo reales. Fallar DESPUÉS de
  // insertar el recibo comprueba que PostgreSQL revierte ambos registros.
  const faultDb = db.$extends({ query: { moneyOperation: { async create({ args, query }) {
    const receipt = await query(args);
    if (failReceipt) throw new Error('Fallo ficticio después del recibo');
    return receipt;
  } } } });
  // Prisma $extends expone una firma distinta para $transaction incluso en su
  // tipo de transacción. Es una transacción real con todos los delegates, no un
  // mock parcial. La conversión se limita a esta frontera del cliente extendido.
  const load = sourceLoader({ '@/lib/prisma': { prisma: { $transaction: (run, options) => faultDb.$transaction(tx => run(tx as Prisma.TransactionClient), options) } }, '@/lib/calendar/schedule': { scheduleCalendarSync: () => {} },
    '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: actor } } }) } }) },
    'next/server': { NextResponse: { json: (body, init = {}) => Response.json(body, init) } },
  });
  const route = load('src/app/api/money/route.ts'), { todayInMexico, addDays } = load('src/lib/money/dates.ts');
  const today = todayInMexico(), yesterday = addDays(today, -1);
  // Frontera HTTP: no validar/normalizar cuerpos inválidos antes del handler.
  const request = (body: unknown) => new Request('http://localhost/api/money', { method: 'POST', headers: { Authorization: 'Bearer fictitious', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const post = async (body: Record<string, unknown>) => reply(await route.POST(request({ operationId: randomUUID(), ...body })));
  const read = async () => { const result = await route.GET(request({})); assert.equal(result.status, 200); return moneyResponseSchema.parse(await result.json()).forecast; };
  const ok = (response: JsonReply) => { assert.equal(response.status, 200, JSON.stringify(response.body)); return response.body; };
  const isCreated = (body: Record<string, unknown>): body is TransferResponse => body.ok === true && typeof body.id === 'string';
  const created = (response: JsonReply): TransferResponse => {
    const body = ok(response);
    assert.ok(isCreated(body));
    // Recibo comprobado sin reemplazar el JSON original por uno normalizado.
    return body;
  };
  try {
    const create = async (name: string, openingBalance: string) => created(await post({ action: 'CREATE_ACCOUNT', name, kind: 'BANK', openingBalance, asOf: yesterday, reservedAmount: 0, autoYield: false })).id;
    const from = await create('Origen ficticio', '1000.25'), to = await create('Destino ficticio', '100.10');
    actor = other.id; const foreign = await create('Cuenta ajena ficticia', '10'); actor = user.id;
    const transfer = (extra: Partial<TransferCommand> = {}): TransferCommand => ({ action: 'TRANSFER', operationId: randomUUID(), fromAccountId: from, toAccountId: to, amount: '200.25', date: today, concept: 'Piloto TS', ...extra });
    let saved: TransferResponse, body: TransferCommand;
    await t.test('solicitudes concurrentes y repetición producen un movimiento y un recibo; total a centavos', async () => {
      body = transfer();
      const replies = await Promise.all([post(body), post(body)]);
      assert.ok(replies[0] && replies[1]);
      saved = created(replies[0]); assert.deepEqual(ok(replies[1]), saved); assert.deepEqual(ok(await post(body)), saved);
      assert.equal(await db.moneyTransfer.count({ where: { userId: user.id } }), 1);
      assert.equal(await db.moneyOperation.count({ where: { userId: user.id, operationId: body.operationId } }), 1);
      const forecast = await read(); assert.equal(forecast.accounts.find(a => a.id === from)?.balance, 800); assert.equal(forecast.accounts.find(a => a.id === to)?.balance, 300.35); assert.equal(forecast.summary.balance, 1100.35);
    });
    await t.test('huella conserva texto/número y propiedades adicionales antes de validar', async () => {
      for (const change of [{ amount: 200.25 }, { amount: '200.26' }, { ignored: true }]) {
        const response = await post({ ...body, ...change });
        assert.equal(response.status, 409); assert.equal(response.body.error, 'El identificador ya corresponde a otra operación.');
      }
      assert.equal(await db.moneyTransfer.count({ where: { userId: user.id } }), 1);
    });
    await t.test('fallo después de la escritura revierte movimiento y recibo; UUID reutilizable', async () => {
      const failed = transfer({ amount: '0.01' }); failReceipt = true;
      try { assert.equal((await post(failed)).status, 500); } finally { failReceipt = false; }
      assert.equal(await db.moneyTransfer.count({ where: { userId: user.id } }), 1);
      assert.equal(await db.moneyOperation.count({ where: { userId: user.id, operationId: failed.operationId } }), 0);
      const retried = created(await post(failed)); ok(await post({ action: 'REVERSE_TRANSFER', id: retried.id }));
    });
    await t.test('cuentas ajenas e inexistentes no filtran datos; mismo origen/destino y fechas conservan errores', async () => {
      const before = await db.moneyTransfer.count({ where: { userId: user.id } });
      for (const change of [{ fromAccountId: foreign }, { toAccountId: foreign }, { fromAccountId: 'missing' }, { toAccountId: 'missing' }]) {
        const result = await post(transfer(change)); assert.equal(result.status, 404); assert.equal(result.body.error, 'Registro no encontrado.');
      }
      for (const [change, message] of [
        [{ toAccountId: from }, 'Selecciona otra cuenta de destino.'],
        [{ date: addDays(yesterday, -1) }, 'La transferencia debe ser posterior al saldo inicial de ambas cuentas.'],
        [{ date: '2026-02-30' }, 'Indica una fecha válida.'],
      ] satisfies [Partial<TransferCommand>, string][]) { const result = await post(transfer(change)); assert.equal(result.status, 400); assert.equal(result.body.error, message); }
      assert.equal(await db.moneyTransfer.count({ where: { userId: user.id } }), before);
    });
    await t.test('reversión ajena no filtra; reversión válida conserva historial, saldo y recibo', async () => {
      actor = other.id;
      const denied = await post({ action: 'REVERSE_TRANSFER', id: saved.id }); assert.equal(denied.status, 404); assert.equal(denied.body.error, 'Registro no encontrado.');
      actor = user.id;
      const reverse = { action: 'REVERSE_TRANSFER', id: saved.id, operationId: randomUUID() };
      assert.deepEqual(ok(await post(reverse)), { ok: true });
      const stored = await db.moneyTransfer.findUniqueOrThrow({ where: { id: saved.id } }); assert.ok(stored.reversedAt);
      assert.deepEqual(ok(await post(reverse)), { ok: true });
      assert.deepEqual((await db.moneyTransfer.findUniqueOrThrow({ where: { id: saved.id } })).reversedAt, stored.reversedAt);
      const forecast = await read(); assert.equal(forecast.accounts.find(a => a.id === from)?.balance, 1000.25); assert.equal(forecast.accounts.find(a => a.id === to)?.balance, 100.10);
    });
    await t.test('fecha programada admitida y mismo día de referencia admitido', async () => {
      for (const date of [yesterday, addDays(today, 1)]) {
        const record = created(await post(transfer({ date, amount: 1 })));
        ok(await post({ action: 'REVERSE_TRANSFER', id: record.id }));
      }
    });
    await t.test('conciliación posterior bloquea reversión, conserva historial y no guarda recibo fallido', async () => {
      const record = created(await post(transfer({ date: yesterday, amount: 1 })));
      const account = (await read()).accounts.find(a => a.id === to); assert.ok(account);
      ok(await post({ action: 'RECONCILE', accountId: to, version: account.version, bankBalance: '101.10', reason: 'Conciliación ficticia' }));
      const reverse = { action: 'REVERSE_TRANSFER', operationId: randomUUID(), id: record.id };
      const response = await post(reverse); assert.equal(response.status, 409);
      assert.equal(response.body.error, 'La transferencia ya está incluida en una conciliación posterior. Corrige los saldos con una nueva conciliación.');
      assert.equal((await db.moneyTransfer.findUniqueOrThrow({ where: { id: record.id } })).reversedAt, null);
      assert.equal(await db.moneyOperation.count({ where: { userId: user.id, operationId: reverse.operationId } }), 0);
      // La repetición histórica se resuelve ANTES de aplicar las reglas nuevas de fecha.
      assert.deepEqual(ok(await post(body)), saved);
    });
  } finally { await db.user.deleteMany({ where: { id: { in: [user.id, other.id] } } }); await db.$disconnect(); }
});
