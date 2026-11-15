import type { Prisma } from '@prisma/client';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { fixtureConnection, fixtureDatabase } from './helpers/fixture-database';
import { financialLoader, fixedDate, testReply } from './helpers/financial-fixtures';
import { faultingTransactions } from './helpers/financial-persistence';
import { array, record } from './helpers/dynamic-values';

const connectionString = process.env.AFP_TEST_DATABASE_URL;
test('PostgreSQL: inicio del ciclo siguiente desde el corte real anterior', { skip: !connectionString }, async t => {
  const db = await fixtureDatabase(fixtureConnection(connectionString));
  const owner = await db.user.create({ data: { email: `cycle-start-${randomUUID()}@example.test` } });
  const other = await db.user.create({ data: { email: `cycle-start-${randomUUID()}@example.test` } });
  const cleanupIds = [owner.id, other.id];
  let actor = owner.id, failCycleId = '';
  const adapter = faultingTransactions(db, { after(model, method, args) {
    if (model === 'cardCycle' && method === 'update' && record(record(args).where).id === failCycleId) {
      throw new Error('Fallo después de actualizar el ciclo siguiente');
    }
  } });
  const route = financialLoader({
    '@/lib/prisma': { prisma: adapter },
    '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: actor } } }) } }) },
    'next/server': { NextResponse: { json: testReply } },
  }, { Date: fixedDate(new Date('2026-11-14T18:00:00Z')), console: { error() {} } })('src/app/api/card-cycles/route.ts');
  const request = (body?: Record<string, unknown>, query = '') => ({
    url: `http://localhost/api/card-cycles${query}`, headers: new Headers({ authorization: 'Bearer test' }), json: async () => body,
  });
  const patch = (id: string, fields: Record<string, unknown> = {}) => route.PATCH(request({
    id, action: 'UPDATE_DATES', startDate: '2026-10-15', cutDate: '2026-11-15', dueDate: '2026-12-04', ...fields,
  }));
  const card = (userId = owner.id) => db.card.create({ data: { userId, name: `Tarjeta ficticia ${randomUUID()}`, usualCutDay: 14, usualDueDay: 4 } });
  const cycle = (cardId: string, fields: Partial<Prisma.CardCycleUncheckedCreateInput> = {}) => db.cardCycle.create({ data: {
    userId: owner.id, cardId, month: 11, year: 2026,
    startDate: new Date('2026-10-15T12:00:00Z'), cutDate: new Date('2026-11-14T12:00:00Z'), dueDate: new Date('2026-12-04T12:00:00Z'),
    ...fields,
  } });
  const nextCycle = (cardId: string, fields: Partial<Prisma.CardCycleUncheckedCreateInput> = {}) => cycle(cardId, {
    month: 12, startDate: new Date('2026-11-15T12:00:00Z'), cutDate: new Date('2026-12-14T12:00:00Z'), dueDate: new Date('2027-01-04T12:00:00Z'), ...fields,
  });
  const read = (id: string) => db.cardCycle.findUniqueOrThrow({ where: { id } });
  try {
    await t.test('actualiza el inicio al confirmar y corregir el corte; conserva todos los demás campos', async () => {
      const current = await cycle((await card()).id);
      const next = await nextCycle(current.cardId, { statementAmount: '900.50', paidAmount: '25.25', paidAt: new Date('2026-11-14'), notes: 'Notas personales ficticias' });
      const january = await nextCycle(current.cardId, { year: 2027, month: 1, startDate: new Date('2026-12-15'), cutDate: new Date('2027-01-14'), dueDate: new Date('2027-02-04') });
      for (const [cutDate, start] of [['2026-11-15', '2026-11-16'], ['2026-11-13', '2026-11-14']] as const) {
        assert.equal((await patch(current.id, { cutDate })).status, 200);
        const saved = await read(next.id);
        assert.equal(saved.startDate.toISOString().slice(0, 10), start);
        assert.deepEqual({ ...saved, startDate: next.startDate, updatedAt: next.updatedAt }, next);
        assert.deepEqual(await read(january.id), january, 'heredar el inicio de diciembre no confirma su corte ni altera enero');
      }
      const loaded = await route.GET(request(undefined, `?cycleId=${next.id}`));
      assert.deepEqual(array(record(loaded.body.cycle).dataWarnings), []);
    });

    await t.test('guardar el estado con fechas también enlaza el siguiente ciclo, incluso si el corte no cambia', async () => {
      const current = await cycle((await card()).id);
      const next = await nextCycle(current.cardId, { startDate: new Date('2026-11-13') });
      const result = await patch(current.id, { action: 'UPDATE_STATEMENT', statementAmount: '1234.56', cutDate: '2026-11-14' });
      assert.equal(result.status, 200);
      assert.equal((await read(current.id)).statementAmount?.toFixed(2), '1234.56');
      assert.equal((await read(next.id)).startDate.toISOString().slice(0, 10), '2026-11-15');
      assert.equal((await read(next.id)).datesConfirmedAt, null);
    });

    await t.test('respeta el inicio confirmado del siguiente ciclo, que continúa editable', async () => {
      const current = await cycle((await card()).id);
      const next = await nextCycle(current.cardId, { datesConfirmedAt: new Date('2026-11-01') });
      assert.equal((await patch(current.id)).status, 200);
      assert.deepEqual(await read(next.id), next);
      assert.equal((await patch(next.id, { startDate: '2026-11-18', cutDate: '2026-12-14', dueDate: '2027-01-04' })).status, 200);
      assert.equal((await read(next.id)).startDate.toISOString().slice(0, 10), '2026-11-18');
    });

    await t.test('usa el mes inmediato de la misma tarjeta; no salta meses ni modifica otra tarjeta o propietario', async () => {
      const current = await cycle((await card()).id);
      const january = await nextCycle(current.cardId, { month: 1, year: 2027, startDate: new Date('2026-12-15'), cutDate: new Date('2027-01-14'), dueDate: new Date('2027-02-04') });
      const anotherCard = await nextCycle((await card()).id);
      const anotherOwner = await nextCycle((await card(other.id)).id, { userId: other.id });
      assert.equal((await patch(current.id)).status, 200);
      assert.deepEqual(await read(january.id), january);
      assert.deepEqual(await read(anotherCard.id), anotherCard);
      assert.deepEqual(await read(anotherOwner.id), anotherOwner);
      const saved = await read(current.id);
      actor = other.id;
      try { assert.equal((await patch(current.id)).status, 404); }
      finally { actor = owner.id; }
      assert.deepEqual(await read(current.id), saved);
    });

    await t.test('febrero bisiesto, febrero normal y diciembre conservan el día bancario', async () => {
      for (const [year, month, startDate, cutDate, nextYear, nextMonth, nextStart, nextCut, dueDate] of [
        [2028, 2, '2028-01-15', '2028-02-29', 2028, 3, '2028-03-01', '2028-03-14', '2028-03-20'],
        [2027, 2, '2027-01-15', '2027-02-28', 2027, 3, '2027-03-01', '2027-03-14', '2027-03-20'],
        [2026, 12, '2026-11-15', '2026-12-31', 2027, 1, '2027-01-01', '2027-01-14', '2027-01-20'],
      ] as const) {
        const current = await cycle((await card()).id, { year, month, startDate: new Date(startDate), cutDate: new Date(cutDate), dueDate: new Date(dueDate) });
        const next = await nextCycle(current.cardId, { year: nextYear, month: nextMonth, startDate: new Date(cutDate), cutDate: new Date(nextCut), dueDate: new Date(`${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-04`) });
        assert.equal((await patch(current.id, { startDate, cutDate, dueDate })).status, 200);
        assert.equal((await read(next.id)).startDate.toISOString().slice(0, 10), nextStart);
        assert.equal((await read(next.id)).startDate.getUTCHours(), 12);
      }
    });

    await t.test('actualizar solo importe o pago no confirma fechas ni cambia el inicio siguiente', async () => {
      const current = await cycle((await card()).id, { datesConfirmedAt: new Date('2026-11-01') });
      const next = await nextCycle(current.cardId, { startDate: new Date('2026-11-13') });
      assert.equal((await route.PATCH(request({ id: current.id, action: 'UPDATE_STATEMENT', statementAmount: '100' }))).status, 200);
      assert.equal((await route.PATCH(request({ id: current.id, action: 'MARK_AS_PAID', paidAmount: '10', paidAt: '2026-11-14' }))).status, 200);
      assert.deepEqual(await read(next.id), next);
    });

    await t.test('un período siguiente imposible rechaza y revierte ambas filas', async () => {
      const current = await cycle((await card()).id);
      const next = await nextCycle(current.cardId);
      const response = await patch(current.id, { cutDate: '2026-12-14', dueDate: '2027-01-04' });
      assert.equal(response.status, 409);
      assert.match(String(response.body.error), /ciclo siguiente/);
      assert.deepEqual(await read(current.id), current);
      assert.deepEqual(await read(next.id), next);
    });

    await t.test('un fallo después de escribir el siguiente ciclo revierte también monto y fechas del actual', async () => {
      const current = await cycle((await card()).id);
      const next = await nextCycle(current.cardId);
      failCycleId = next.id;
      try { assert.equal((await patch(current.id, { action: 'UPDATE_STATEMENT', statementAmount: '1234.56' })).status, 500); }
      finally { failCycleId = ''; }
      assert.deepEqual(await read(current.id), current);
      assert.deepEqual(await read(next.id), next);
    });

    await t.test('la generación hereda diciembre anterior para enero nuevo, repara inicios sin confirmar y respeta confirmados', async () => {
      const cardId = (await card()).id;
      await cycle(cardId, { year: 2025, month: 12, startDate: new Date('2025-11-15'), cutDate: new Date('2025-12-31T00:00:00Z'), dueDate: new Date('2026-01-20'), datesConfirmedAt: new Date('2025-12-31') });
      const confirmed = await cycle(cardId, { month: 3, startDate: new Date('2026-02-19'), cutDate: new Date('2026-03-14'), dueDate: new Date('2026-04-04'), datesConfirmedAt: new Date('2026-03-14') });
      const april = await cycle(cardId, { month: 4, startDate: new Date('2026-03-10'), cutDate: new Date('2026-04-14'), dueDate: new Date('2026-05-04') });
      const reviewedCard = (await card()).id;
      await cycle(reviewedCard, { year: 2025, month: 12, startDate: new Date('2025-11-15'), cutDate: new Date('2025-12-16'), dueDate: new Date('2026-01-04'), datesConfirmedAt: new Date('2025-12-17') });
      const reviewedJanuary = await cycle(reviewedCard, { month: 1, startDate: new Date('2025-12-19'), cutDate: new Date('2026-01-14'), dueDate: new Date('2026-02-04'), datesConfirmedAt: new Date('2026-01-14') });
      const unreviewedCard = (await card()).id;
      await cycle(unreviewedCard, { year: 2025, month: 12, startDate: new Date('2025-11-15'), cutDate: new Date('2025-12-16'), dueDate: new Date('2026-01-04') });
      assert.equal((await route.POST(request({}))).status, 200);
      const january = await db.cardCycle.findUniqueOrThrow({ where: { cardId_month_year: { cardId, year: 2026, month: 1 } } });
      assert.equal(january.startDate.toISOString().slice(0, 10), '2026-01-01');
      assert.equal(january.datesConfirmedAt, null);
      assert.equal(january.cutDate.toISOString().slice(0, 10), '2026-01-14');
      assert.equal(january.dueDate.toISOString().slice(0, 10), '2026-02-04');
      assert.deepEqual(await read(confirmed.id), confirmed);
      assert.deepEqual(await read(reviewedJanuary.id), reviewedJanuary);
      const unreviewedJanuary = await db.cardCycle.findUniqueOrThrow({ where: { cardId_month_year: { cardId: unreviewedCard, year: 2026, month: 1 } } });
      assert.equal(unreviewedJanuary.startDate.toISOString().slice(0, 10), '2025-12-15', 'sin corte confirmado mantiene el día habitual');
      assert.equal((await read(april.id)).startDate.toISOString().slice(0, 10), '2026-03-15');
      const saved = await read(april.id);
      assert.equal((await route.POST(request({}))).status, 200);
      assert.deepEqual(await read(april.id), saved, 'repetir no vuelve a escribir el mismo inicio');
      assert.deepEqual(await read(january.id), january);
    });

    await t.test('generación y confirmación concurrentes no pierden el corte real aunque enero no exista', async () => {
      // A dedicated owner keeps this card first in generation, so the requests
      // contend immediately instead of processing unrelated cards beforehand.
      const concurrentOwner = await db.user.create({ data: { email: `cycle-start-concurrent-${randomUUID()}@example.test` } });
      cleanupIds.push(concurrentOwner.id);
      const cardId = (await card(concurrentOwner.id)).id;
      const december = await cycle(cardId, { userId: concurrentOwner.id, year: 2025, month: 12, startDate: new Date('2025-11-15'), cutDate: new Date('2025-12-14'), dueDate: new Date('2026-01-04') });
      actor = concurrentOwner.id;
      try {
        const results = await Promise.all([
          route.POST(request({})),
          patch(december.id, { startDate: '2025-11-15', cutDate: '2025-12-18', dueDate: '2026-01-07' }),
          route.POST(request({})),
        ]);
        assert.ok(results.every(result => result.status === 200), JSON.stringify(results.map(result => result.body.error)));
        const january = await db.cardCycle.findUniqueOrThrow({ where: { cardId_month_year: { cardId, year: 2026, month: 1 } } });
        assert.equal(january.startDate.toISOString().slice(0, 10), '2025-12-19');
        assert.equal(january.datesConfirmedAt, null);
      } finally { actor = owner.id; }
    });

    await t.test('confirmaciones concurrentes de meses vecinos conservan el inicio elegido expresamente', async () => {
      const current = await cycle((await card()).id);
      const next = await nextCycle(current.cardId);
      const responses = await Promise.all([
        patch(current.id),
        patch(next.id, { startDate: '2026-11-19', cutDate: '2026-12-14', dueDate: '2027-01-04' }),
      ]);
      assert.ok(responses.every(response => response.status === 200));
      assert.equal((await read(next.id)).startDate.toISOString().slice(0, 10), '2026-11-19');
      assert.ok((await read(next.id)).datesConfirmedAt);
    });
  } finally {
    await db.user.deleteMany({ where: { id: { in: cleanupIds } } });
    await db.$disconnect();
  }
});
