import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { array, record } from './helpers/dynamic-values';
import { dynamicRoute, financialLoader, testReply } from './helpers/financial-fixtures';
import { fixtureDatabase } from './helpers/fixture-database';
import { uiResponseSchemas } from '../src/lib/uiResponseSchemas';

const request = (query = '') => ({ url: `http://localhost/api/incomes?${query}`, headers: new Headers({ authorization: 'Bearer test' }) });

test('A07: rechaza paginación y filtros inválidos antes de consultar ingresos', async () => {
  const load = financialLoader({
    '@/lib/prisma': { prisma: { $transaction() { throw new Error('No debe consultar BD'); } } },
    '@/lib/apiAuth': { requireApiUser: async () => ({ id: 'owner' }), apiAccessErrorResponse: () => null, apiResponse: { json: testReply } },
  });
  const api = dynamicRoute(load('src/app/api/incomes/route.ts'));
  for (const query of ['page=0', 'page=-1', 'page=1.5', 'page=1e2', 'page=9007199254740992', 'pageSize=101', 'pageSize=0', 'pageSize=', 'startDate=2026-02-30', 'endDate=invalid', 'startDate=2026-10-02&endDate=2026-10-01', 'sortBy=userId', 'sortDirection=sideways', `q=${'x'.repeat(201)}`]) {
    assert.equal((await api.GET(request(query))).status, 400, query);
  }
});

test('A07: el cliente exige conteo y metadatos de paginación válidos', () => {
  const valid = { incomes: [], total: 0, totalCount: 0, page: 1, pageSize: 10, pageCount: 1 };
  assert.equal(uiResponseSchemas.incomes.safeParse(valid).success, true);
  for (const field of ['totalCount', 'page', 'pageSize', 'pageCount']) {
    const incomplete: Record<string, unknown> = { ...valid };
    delete incomplete[field];
    assert.equal(uiResponseSchemas.incomes.safeParse(incomplete).success, false, field);
  }
  assert.equal(uiResponseSchemas.incomes.safeParse({ ...valid, totalCount: -1 }).success, false);
});

test('PostgreSQL A07: historial completo, filtros, suma global, orden y cambios de página', { skip: !process.env.AFP_TEST_DATABASE_URL }, async t => {
  const db = await fixtureDatabase(process.env.AFP_TEST_DATABASE_URL!);
  const key = randomUUID();
  const owner = await db.user.create({ data: { email: `a07-${key}@example.test` } });
  const other = await db.user.create({ data: { email: `a07-other-${key}@example.test` } });
  try {
    const incomeType = await db.incomeType.create({ data: { userId: owner.id, name: 'Nómina A07' } });
    const olderType = await db.incomeType.create({ data: { userId: owner.id, name: 'Cobro A07' } });
    const foreignType = await db.incomeType.create({ data: { userId: other.id, name: 'Ajeno A07' } });
    const person = await db.person.create({ data: { userId: owner.id, name: 'Persona antigua A07' } });
    const receivable = await db.receivableAccount.create({ data: { userId: owner.id, personId: person.id, concept: 'Deuda antigua A07', originalAmount: 10, originDate: new Date('2026-09-01'), originType: 'MANUAL' } });
    const oldestId = `a07-${key}-101`;
    await db.income.createMany({ data: Array.from({ length: 101 }, (_, i) => ({
      id: `a07-${key}-${String(i + 1).padStart(3, '0')}`, userId: owner.id,
      incomeTypeId: i === 100 ? olderType.id : incomeType.id,
      amount: '10.00', date: new Date(i === 100 ? '2026-09-30T23:59:59.999Z' : '2026-10-01T12:00:00Z'),
      createdAt: new Date('2026-10-02T12:00:00Z'), concept: `Ingreso A07 ${i + 1}`,
      source: i === 100 ? 'Fuente antigua A07' : 'Empresa A07',
      notes: i === 100 ? 'Nota antigua A07' : null,
      receivableAccountId: i === 100 ? receivable.id : null,
    })) });
    await db.income.create({ data: { userId: other.id, incomeTypeId: foreignType.id, amount: 99999, date: new Date('2026-10-01'), concept: 'Ingreso ajeno A07', source: 'Empresa A07' } });
    const load = financialLoader({
      '@/lib/prisma': { prisma: db },
      'next/server': { NextResponse: { json: testReply } },
      '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: owner.id } } }) } }) },
    });
    const api = dynamicRoute(load('src/app/api/incomes/route.ts'));
    async function get(query = '') {
      const response = await api.GET(request(query));
      assert.equal(response.status, 200);
      return uiResponseSchemas.incomes.parse(response.body);
    }

    await t.test('el ingreso 101 es accesible y ambas páginas conservan $1,010 y el conteo global', async () => {
      const first = await get(`userId=${other.id}`);
      const last = await get('page=2');
      assert.equal(first.incomes.length, 100);
      assert.equal(last.incomes.length, 1);
      assert.equal(last.incomes[0]?.id, oldestId);
      for (const page of [first, last]) {
        assert.equal(page.total, 1010);
        assert.equal(page.totalCount, 101);
        assert.equal(page.pageCount, 2);
      }
      const ids = new Set<string>();
      for (let page = 1; page <= 11; page++) {
        const current = await get(`page=${page}&pageSize=10`);
        for (const income of current.incomes) { assert.equal(ids.has(income.id), false); ids.add(income.id); }
      }
      assert.equal(ids.size, 101, 'Los empates de fecha/creación tienen desempate por id.');
    });
    await t.test('búsqueda de concepto, fuente, notas, tipo, deuda y persona alcanza el registro antiguo', async () => {
      for (const q of ['ingreso a07 101', 'FUENTE ANTIGUA', 'nota antigua', 'cobro a07', 'deuda antigua', 'persona antigua']) {
        const result = await get(`q=${encodeURIComponent(q)}&pageSize=5`);
        assert.equal(result.total, 10, q);
        assert.equal(result.totalCount, 1, q);
        assert.equal(result.incomes[0]?.id, oldestId, q);
      }
    });
    await t.test('filtros combinados y límites inclusivos de fecha comparten conteo y suma', async () => {
      const result = await get(`incomeTypeId=${incomeType.id}&startDate=2026-10-01&endDate=2026-10-01&q=empresa&pageSize=25&page=2`);
      assert.equal(result.incomes.length, 25);
      assert.equal(result.total, 1000);
      assert.equal(result.totalCount, 100);
      assert.equal(result.page, 2);
      assert.equal(result.pageCount, 4);
      const oldest = await get('startDate=2026-09-30&endDate=2026-09-30');
      assert.equal(oldest.incomes[0]?.id, oldestId);
      const foreign = await get(`incomeTypeId=${foreignType.id}`);
      assert.deepEqual(foreign.incomes, []);
      assert.equal(foreign.totalCount, 0);
    });
    await t.test('sin resultados y página fuera de rango devuelven metadatos utilizables', async () => {
      const empty = await get('q=no-existe&page=999');
      assert.equal(empty.total, 0);
      assert.equal(empty.totalCount, 0);
      assert.equal(empty.page, 1);
      assert.equal(empty.pageCount, 1);
      assert.deepEqual(empty.incomes, []);
      const clamped = await get('page=2147483647');
      assert.equal(clamped.page, 2);
      assert.equal(clamped.incomes[0]?.id, oldestId);
    });
    await t.test('orden ascendente global y suma decimal independiente de la página', async () => {
      assert.equal((await get('sortBy=date&sortDirection=asc&pageSize=5')).incomes[0]?.id, oldestId);
      for (const amount of ['0.10', '0.20']) await db.income.create({ data: { userId: owner.id, incomeTypeId: incomeType.id, amount, date: new Date('2026-10-01'), source: 'Centavos', concept: 'Centavos A07' } });
      const cents = await get('q=centavos&pageSize=1');
      assert.equal(cents.total, 0.3);
      assert.equal(cents.totalCount, 2);
      assert.equal(cents.incomes.length, 1);
      assert.equal((await get('sortBy=amount&sortDirection=asc&pageSize=1')).incomes[0]?.amount, '0.1');
      await db.income.deleteMany({ where: { userId: owner.id, source: 'Centavos' } });
    });
    await t.test('borrar la única fila de la última página retorna a una página existente', async () => {
      assert.equal((await api.DELETE(request(`id=${oldestId}`))).status, 200);
      const current = await get('page=2');
      assert.equal(current.page, 1);
      assert.equal(current.pageCount, 1);
      assert.equal(current.totalCount, 100);
      assert.equal(current.total, 1000);
      assert.equal(current.incomes.length, 100);
      assert.equal(await db.income.count({ where: { userId: other.id } }), 1);
      assert.equal(array(current.incomes).every(income => record(income).userId === owner.id), true);
    });
  } finally {
    await db.user.deleteMany({ where: { id: { in: [owner.id, other.id] } } });
    await db.$disconnect();
  }
});
