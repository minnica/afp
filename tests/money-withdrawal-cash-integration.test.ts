import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { integrationLoader } from './helpers/integration-fixtures';
import { present } from './helpers/financial-fixtures';
import { loadMoneyData } from '../src/lib/money/data';
import { buildSources, accountBalances } from '../src/lib/money/sources';

const connectionString = process.env.AFP_TEST_DATABASE_URL;
test('retiro con destino de efectivo: PostgreSQL, propietario, comisión, reintentos y reversión', { skip: !connectionString }, async t => {
  const url = new URL(present(connectionString));
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && /^\/afp_test\w*$/.test(url.pathname) && !url.search);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const users = await Promise.all(['owner', 'other'].map(name => db.user.create({ data: { email: `withdrawal-${name}-${randomUUID()}@example.test` } })));
  const user = present(users[0]), other = present(users[1]);
  const create = (name: string, kind: string, userId = user.id) => db.moneyAccount.create({ data: { userId, name, kind, asOf: new Date('2026-11-01'), openingBalance: 1000, baseline: {} } });
  const bank = await create('Banco ficticio', 'BANK'), cash = await create('Caja ficticia', 'CASH'), wrongKind = await create('Otro banco ficticio', 'BANK'), foreign = await create('Caja ajena', 'CASH', other.id);
  const { mutateMoney } = integrationLoader()('src/lib/money/service.ts');
  const write = (body: unknown) => mutateMoney(db, user.id, body, '2026-11-10');
  const input = () => ({ action: 'WITHDRAWAL', operationId: randomUUID(), accountId: bank.id, cashAccountId: cash.id, amount: '100.47', cashAmount: '100.00', date: '2026-11-06', concept: 'Retiro ficticio' });
  const balances = async () => { const data = await loadMoneyData(db, user.id); return accountBalances(data.accounts, buildSources(data, '2026-11-10').events, '2026-11-10'); };
  try {
    await t.test('concurrencia y reintento conservan un retiro y una entrada; solo la comisión reduce el total', async () => {
      const body = input(), results = await Promise.all(Array.from({ length: 6 }, () => write(body)));
      for (const result of results) assert.deepEqual(result, results[0]);
      assert.equal(await db.moneyWithdrawal.count({ where: { userId: user.id } }), 1);
      const withdrawal = await db.moneyWithdrawal.findUniqueOrThrow({ where: { id: present(results[0]?.id) } });
      assert.equal(withdrawal.cashAccountId, cash.id); assert.equal(withdrawal.cashAmount?.toString(), '100');
      const current = await balances();
      assert.equal(current.find(a => a.id === bank.id)?.balance, 899.53); assert.equal(current.find(a => a.id === cash.id)?.balance, 1100);
      assert.equal(current.reduce((sum, a) => sum + Math.round(a.balance * 100), 0), 299953);
      await assert.rejects(write({ ...body, cashAmount: '99.00' }), e => e !== null && typeof e === 'object' && 'status' in e && e.status === 409);
      await write({ action: 'REVERSE_WITHDRAWAL', operationId: randomUUID(), id: withdrawal.id });
      await write({ action: 'REVERSE_WITHDRAWAL', operationId: randomUUID(), id: withdrawal.id });
      const reversed = await balances(); assert.equal(reversed.find(a => a.id === bank.id)?.balance, 1000); assert.equal(reversed.find(a => a.id === cash.id)?.balance, 1000);
    });
    await t.test('destino ajeno, de otro tipo, igual al origen o incompleto no crea movimientos', async () => {
      const before = await db.moneyWithdrawal.count({ where: { userId: user.id } });
      for (const body of [{ ...input(), cashAccountId: foreign.id }, { ...input(), cashAccountId: wrongKind.id },
        { ...input(), cashAccountId: bank.id }, { ...input(), cashAmount: undefined }, { ...input(), cashAmount: '100.48' }]) await assert.rejects(write(body));
      assert.equal(await db.moneyWithdrawal.count({ where: { userId: user.id } }), before);
    });
    await t.test('el saldo de referencia de la caja protege altas y reversiones históricas', async () => {
      const result = await write(input());
      await db.moneyAccount.update({ where: { id: cash.id }, data: { asOf: new Date('2026-11-07') } });
      await assert.rejects(write(input()));
      await assert.rejects(write({ action: 'REVERSE_WITHDRAWAL', operationId: randomUUID(), id: present(result.id) }));
      assert.equal((await db.moneyWithdrawal.findUniqueOrThrow({ where: { id: present(result.id) } })).reversedAt, null);
      await db.moneyAccount.update({ where: { id: cash.id }, data: { asOf: new Date('2026-11-01') } });
    });
    await t.test('la restricción SQL protege parejas nulas, importes y origen igual al destino', async () => {
      for (const data of [{ cashAccountId: cash.id, cashAmount: null }, { cashAccountId: null, cashAmount: '100' },
        { cashAccountId: cash.id, cashAmount: '101' }, { cashAccountId: bank.id, cashAmount: '100' }]) {
        await assert.rejects(db.moneyWithdrawal.create({ data: { userId: user.id, accountId: bank.id, amount: '100', date: new Date('2026-11-06'), concept: 'Inválido ficticio', ...data } }));
      }
    });
    await t.test('el contrato anterior persiste sin destino y conserva su salida única', async () => {
      const result = await write({ action: 'WITHDRAWAL', operationId: randomUUID(), accountId: bank.id, amount: '10.00', date: '2026-11-06', concept: 'Cliente anterior ficticio' });
      const row = await db.moneyWithdrawal.findUniqueOrThrow({ where: { id: present(result.id) } });
      assert.equal(row.cashAccountId, null); assert.equal(row.cashAmount, null);
    });
  } finally {
    await db.moneyWithdrawal.deleteMany({ where: { userId: { in: users.map(u => u.id) } } });
    await db.user.deleteMany({ where: { id: { in: users.map(u => u.id) } } });
    await db.$disconnect();
  }
});
