import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { Prisma } from '@prisma/client';
import { fixtureConnection, fixtureDatabase } from './helpers/fixture-database';
import { financialLoader, fixedDate, present, testReply } from './helpers/financial-fixtures';
import type { SubscriptionChargeInput } from '../src/lib/subscriptionChargeService';
import { lockDebtAccounts } from '../src/lib/debtAccountService';

const connectionString = process.env.AFP_TEST_DATABASE_URL;
const today = '2026-11-11';

test('suscripciones y captura: vincular sin duplicar y recordar el comercio por tarjeta', { skip: !connectionString }, async t => {
  const db = await fixtureDatabase(fixtureConnection(connectionString));
  const user = await db.user.create({ data: { email: `subscription-capture-${randomUUID()}@example.test` } });
  const other = await db.user.create({ data: { email: `subscription-capture-other-${randomUUID()}@example.test` } });
  const category = await db.category.create({ data: { userId: user.id, name: 'Servicios ficticios' } });
  const load = financialLoader({ '@/lib/prisma': { prisma: db }, 'next/server': { NextResponse: { json: testReply } },
    '@supabase/supabase-js': { createClient: () => ({ auth: { getUser: async () => ({ data: { user } }) } }) },
  }, { Date: fixedDate(new Date(`${today}T12:00:00Z`)) });
  const charges = load('src/lib/subscriptionChargeService.ts');
  const api = load('src/app/api/subscription-charges/route.ts');
  const processing = load('src/lib/captureProcessing.ts');
  async function fixture() {
    const card = await db.card.create({ data: { userId: user.id, name: `Tarjeta ficticia ${randomUUID()}`, usualCutDay: 25, usualDueDay: 15 } });
    const subscription = await db.subscription.create({ data: { userId: user.id, name: 'Servicio mensual ficticio', amount: '249',
      paymentMethod: 'CARD', cardId: card.id, categoryId: category.id, chargeDay: 10, startMonth: 1, startYear: 2026 } });
    const input = { subscriptionId: subscription.id, month: '2026-10', action: 'confirm', today };
    const apply = (extra: SubscriptionChargeInput = {}) => db.$transaction(tx => charges.applySubscriptionCharge(tx, user.id, { ...input, ...extra }));
    const preview = (extra: SubscriptionChargeInput = {}) => charges.previewSubscriptionCharge(db, user.id, { ...input, ...extra });
    const capture = async (extra: Partial<Prisma.DailyExpenseUncheckedCreateInput> = {}) => {
      const expense = await db.dailyExpense.create({ data: { userId: user.id, date: new Date('2026-10-10T12:00:00Z'),
        amount: '249', concept: 'SERVICIO *PLAN MENSUAL', paymentMethod: 'CARD', cardId: card.id,
        categoryId: category.id, notes: 'Nota personal', reconciliationStatus: 'PENDING', ...extra } });
      const movement = await db.captureMovement.create({ data: { userId: user.id, cardId: card.id,
        status: 'REGISTERED', reason: 'AUTOMATIC', parserKey: 'wallet.banamex-purchase.es.v1', amount: expense.amount,
        operationDate: expense.date, expenseId: expense.id, originalExpenseId: expense.id,
        proposal: { merchant: 'SERVICIO *PLAN MENSUAL', date: expense.date.toISOString().slice(0, 10), currency: 'MXN',
          cardId: card.id, amount: String(expense.amount) } } });
      return { expense, movement };
    };
    return { card, subscription, input, apply, preview, capture };
  }
  try {
    await t.test('confirmación rápida y API bloquean el duplicado; GET solo propone y no activa reglas', async () => {
      const f = await fixture(), { expense } = await f.capture();
      const request = { headers: new Headers({ authorization: 'Bearer test' }), json: async () => f.input };
      assert.equal((await api.POST(request)).status, 409);
      const result = await api.GET({ ...request, url: `http://localhost/api/subscription-charges?${new URLSearchParams({ ...f.input })}` });
      assert.equal(result.status, 200);
      const preview = await f.preview();
      assert.equal(preview.candidates.length, 1);
      assert.equal(present(preview.candidates[0]).expenseId, expense.id);
      assert.equal(present(preview.candidates[0]).canRemember, true);
      assert.equal(await db.dailyExpense.count({ where: { cardId: f.card.id } }), 1);
      assert.equal(await db.captureMerchantRule.count({ where: { cardId: f.card.id } }), 0);
      assert.equal(await db.subscriptionCharge.count({ where: { subscriptionId: f.subscription.id } }), 0);
    });
    await t.test('vincular conserva gasto, evidencia y recurrencia y retira la previsión de ese mes', async () => {
      const f = await fixture(), { expense, movement } = await f.capture({ reconciledAt: new Date('2026-10-12'), reconciliationStatus: 'CONFIRMED' });
      const preview = await f.preview();
      const input = { action: 'link', expenseId: expense.id, expectedCandidates: preview.candidateKey };
      const results = await Promise.all([f.apply(input), f.apply(input), f.apply(input)]);
      assert.equal(results.filter(row => !row.alreadyConfirmed).length, 1);
      assert.ok(results.every(row => row.expenseId === expense.id));
      const stored = present(await db.dailyExpense.findUnique({ where: { id: expense.id } }));
      const { subscriptionId, updatedAt, ...rest } = stored;
      const { subscriptionId: previousLink, updatedAt: previousTime, ...original } = expense;
      void updatedAt; void previousLink; void previousTime;
      assert.equal(subscriptionId, f.subscription.id);
      assert.deepEqual(rest, original);
      assert.deepEqual(await db.captureMovement.findUnique({ where: { id: movement.id } }), movement);
      assert.deepEqual(await db.subscription.findUnique({ where: { id: f.subscription.id } }), f.subscription);
      const rows = await charges.loadSubscriptionCharges(db, user.id, '2026-10', today);
      assert.equal(rows.find(row => row.subscriptionId === f.subscription.id)?.status, 'CONFIRMED');
      assert.equal(await db.captureMerchantRule.count({ where: { cardId: f.card.id } }), 0);
    });
    await t.test('regla aceptada confirma el siguiente mes con importe real y el reintento manual no suma otro gasto', async () => {
      const f = await fixture(), { expense } = await f.capture();
      const preview = await f.preview();
      await f.apply({ action: 'link', expenseId: expense.id, expectedCandidates: preview.candidateKey, rememberMerchant: true });
      const next = await db.captureMovement.create({ data: { userId: user.id, cardId: f.card.id, reason: 'PURCHASE', amount: '259.50',
        parserKey: 'wallet.banamex-purchase.es.v1', operationDate: new Date('2026-11-10T12:00:00Z'),
        proposal: { cardId: f.card.id, merchant: 'SERVICIO *PLAN MENSUAL', amount: '259.50', date: '2026-11-10', currency: 'MXN' } } });
      const registered = await db.$transaction(async tx => {
        await lockDebtAccounts(tx, user.id);
        return processing.registerCaptureMovement(tx, next, false);
      });
      assert.equal(registered.status, 'REGISTERED');
      assert.equal((await f.apply({ month: '2026-11' })).expenseId, registered.expenseId);
      const stored = present(await db.dailyExpense.findUnique({ where: { id: present(registered.expenseId) } }));
      assert.equal(stored.subscriptionId, f.subscription.id);
      assert.equal(Number(stored.amount), 259.50);
      assert.equal(await db.dailyExpense.count({ where: { cardId: f.card.id } }), 2);
      assert.deepEqual(await db.subscription.findUnique({ where: { id: f.subscription.id } }), f.subscription);
    });
    await t.test('varias capturas exigen elegir y otra compra solo se permite tras revisar la lista vigente', async () => {
      const f = await fixture(); await f.capture(); await f.capture({ concept: 'OTRO SERVICIO' });
      const preview = await f.preview();
      assert.equal(preview.candidates.length, 2);
      await assert.rejects(f.apply(), /gastos capturados/);
      await assert.rejects(f.apply({ confirmDistinctCapture: true }), /gastos capturados/);
      await assert.rejects(f.apply({ confirmDistinctCapture: true, expectedCandidates: 'anterior' }), /gastos capturados/);
      await f.apply({ confirmDistinctCapture: true, expectedCandidates: preview.candidateKey });
      assert.equal(await db.dailyExpense.count({ where: { cardId: f.card.id } }), 3);
    });
    await t.test('una captura nueva o editada invalida la decisión anterior y no sobrescribe correcciones', async () => {
      const f = await fixture(), { expense } = await f.capture();
      const preview = await f.preview();
      await db.dailyExpense.update({ where: { id: expense.id }, data: { notes: 'Nota corregida' } });
      await assert.rejects(f.apply({ action: 'link', expenseId: expense.id, expectedCandidates: preview.candidateKey }), /gasto cambió/);
      await f.capture();
      await assert.rejects(f.apply({ confirmDistinctCapture: true, expectedCandidates: preview.candidateKey }), /gastos capturados/);
      assert.equal((await db.dailyExpense.findUnique({ where: { id: expense.id } }))?.notes, 'Nota corregida');
      assert.equal(await db.subscriptionCharge.count({ where: { subscriptionId: f.subscription.id } }), 0);
    });
    await t.test('tarjeta, propietario, método, importe y ventana de tres días limitan candidatos', async () => {
      const f = await fixture(), otherFixture = await fixture();
      await f.capture({ date: new Date('2026-10-06T23:59:59Z') });
      await f.capture({ date: new Date('2026-10-14T00:00:00Z') });
      await f.capture({ amount: '249.01' });
      await f.capture({ cardId: otherFixture.card.id });
      await f.capture({ userId: other.id });
      assert.equal((await f.preview()).candidates.length, 0);
      const { expense } = await f.capture({ date: new Date('2026-10-07T00:00:00Z') });
      assert.equal((await f.preview()).candidates.length, 1);
      assert.equal((await f.preview({ paymentMethod: 'CASH' })).candidates.length, 0);
      await assert.rejects(db.$transaction(tx => charges.applySubscriptionCharge(tx, other.id, { ...f.input, action: 'link', expenseId: expense.id })), /No se encontró/);
    });
    await t.test('captura editada, devolución o vínculos no permiten aprender silenciosamente ni borrar información', async () => {
      const f = await fixture(), { expense } = await f.capture({ refundOriginalAmount: '300' });
      const preview = await f.preview();
      assert.equal(present(preview.candidates[0]).canLink, false);
      await assert.rejects(f.apply({ action: 'link', expenseId: expense.id, expectedCandidates: preview.candidateKey }), /gasto cambió/);
      const g = await fixture(), captured = await g.capture();
      await db.dailyExpense.update({ where: { id: captured.expense.id }, data: { amount: '250' } });
      const edited = await g.preview({ amount: '250' });
      assert.equal(present(edited.candidates[0]).canRemember, false);
      await assert.rejects(g.apply({ action: 'link', amount: '250', expenseId: captured.expense.id,
        expectedCandidates: edited.candidateKey, rememberMerchant: true }), /comercio necesita/);
      assert.equal((await db.dailyExpense.findUnique({ where: { id: captured.expense.id } }))?.subscriptionId, null);
    });
    await t.test('una regla de otra suscripción no se reemplaza y una omisión necesita restauración', async () => {
      const f = await fixture(), g = await fixture(), { expense } = await f.capture();
      const rule = await db.captureMerchantRule.create({ data: { userId: user.id, cardId: f.card.id, merchant: 'SERVICIO *PLAN MENSUAL', categoryId: category.id, subscriptionId: g.subscription.id } });
      const preview = await f.preview();
      assert.equal(present(preview.candidates[0]).canRemember, false);
      await assert.rejects(f.apply({ action: 'link', expenseId: expense.id, expectedCandidates: preview.candidateKey, rememberMerchant: true }), /comercio necesita/);
      assert.deepEqual(await db.captureMerchantRule.findUnique({ where: { id: rule.id } }), rule);
      await f.apply({ action: 'skip' });
      await assert.rejects(f.apply({ action: 'link', expenseId: expense.id, expectedCandidates: preview.candidateKey }), /Restaura/);
    });
    await t.test('concurrencia captura y confirmación conserva un solo gasto en cualquier orden', async () => {
      const f = await fixture();
      const movement = await db.captureMovement.create({ data: { userId: user.id, cardId: f.card.id, amount: '249',
        reason: 'PURCHASE', parserKey: 'wallet.banamex-purchase.es.v1', operationDate: new Date('2026-10-10T12:00:00Z'),
        proposal: { cardId: f.card.id, date: '2026-10-10', amount: '249', currency: 'MXN', merchant: 'SERVICIO *PLAN MENSUAL' } } });
      const results = await Promise.allSettled([f.apply(), db.$transaction(async tx => {
        await lockDebtAccounts(tx, user.id);
        return processing.registerCaptureMovement(tx, movement, false);
      })]);
      assert.ok(results.some(row => row.status === 'fulfilled'));
      assert.equal(await db.dailyExpense.count({ where: { cardId: f.card.id } }), 1);
    });
    await t.test('rollback revierte vínculo, ocurrencia y regla juntos; un gasto eliminado no se reconstruye', async () => {
      const f = await fixture(), { expense } = await f.capture(), preview = await f.preview();
      const input = { ...f.input, action: 'link', expenseId: expense.id, expectedCandidates: preview.candidateKey, rememberMerchant: true };
      await assert.rejects(db.$transaction(async tx => { await charges.applySubscriptionCharge(tx, user.id, input); throw new Error('rollback'); }), /rollback/);
      assert.equal((await db.dailyExpense.findUnique({ where: { id: expense.id } }))?.subscriptionId, null);
      assert.equal(await db.captureMerchantRule.count({ where: { cardId: f.card.id } }), 0);
      assert.equal(await db.subscriptionCharge.count({ where: { subscriptionId: f.subscription.id } }), 0);
      await db.dailyExpense.delete({ where: { id: expense.id } });
      await assert.rejects(f.apply(input), /gasto cambió/);
      assert.equal(await db.dailyExpense.count({ where: { cardId: f.card.id } }), 0);
    });
  } finally {
    await db.user.deleteMany({ where: { id: { in: [user.id, other.id] } } });
    await db.$disconnect();
  }
});
