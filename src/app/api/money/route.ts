import { z } from 'zod';
import type { Prisma, PrismaClient } from '@prisma/client';
import { apiResponse, requireApiUser, apiAccessErrorResponse } from '@/lib/apiAuth';
import { prisma } from '@/lib/prisma';
import { loadMoneyData, mutateMoney, routingOptions } from '@/lib/money/service';
import { buildForecast } from '@/lib/money/forecast';
import { todayInMexico, addMonths, day } from '@/lib/money/dates';
import { amount } from '@/lib/money/sources';
import { scenarioSchema } from '@/lib/money/schema';
import { budgetExpenses } from '@/lib/money/budgets';

function failure(error: unknown) {
  const access = apiAccessErrorResponse(error); if (access) return access;
  const details = error && typeof error === 'object' ? error : {};
  const code = 'code' in details && typeof details.code === 'string' ? details.code : '';
  const name = 'name' in details && typeof details.name === 'string' ? details.name : '';
  if (code === 'P2002') return apiResponse.json({ error: 'Ya existe un registro con esos datos.' }, { status: 409 });
  if (code === 'P2021' || code === 'P2022') return apiResponse.json({ error: 'Mi dinero requiere aplicar la migración de cuentas antes de utilizarse.' }, { status: 503 });
  console.error('Money operation failed', code || name);
  if (['P2028', 'P2024'].includes(code)) return apiResponse.json({ error: 'La conexión con la base de datos tardó demasiado. Inténtalo de nuevo.' }, { status: 503 });
  return apiResponse.json({ error: 'No se pudo completar la operación de Mi dinero.' }, { status: 500 });
}
export async function GET(request: Request) {
  try {
    const user = z.object({ id: z.string() }).parse(await requireApiUser(request)), params = Object.fromEntries(new URL(request.url).searchParams);
    const scenario = scenarioSchema.safeParse(params);
    if (!scenario.success) return apiResponse.json({ error: 'Revisa las fechas e importes del escenario.' }, { status: 400 });
    // La transacción solo obtiene una instantánea coherente. El cálculo y la
    // serialización ocurren después de liberar la conexión con PostgreSQL.
    const data = await (prisma as PrismaClient).$transaction((tx: Prisma.TransactionClient) => loadMoneyData(tx, user.id), { isolationLevel: 'RepeatableRead', timeout: 20000 });
    const today = todayInMexico();
    const historyMonths = [3, 2, 1].map(n => addMonths(today, -n));
    const budgetSuggestions = data.categories.map(category => {
      const expenses = budgetExpenses(data, category.id).filter(e => historyMonths.includes(day(e.date).slice(0, 7)));
      return { categoryId: category.id, name: category.name, amount: amount(Math.round(expenses.reduce((sum, e) => sum + e.personalCents, 0) / 3)), monthsWithRecords: new Set(expenses.map(e => day(e.date).slice(0, 7))).size };
    }).filter(s => s.amount > 0);
    if (scenario.data.extraAccountId && !data.accounts.some(a => a.id === scenario.data.extraAccountId)) return apiResponse.json({ error: 'Cuenta no encontrada.' }, { status: 404 });
    const base = buildForecast(data, today), simulated = Object.keys(params).some(k => k !== 'userId') ? buildForecast(data, today, scenario.data) : null;
    return apiResponse.json({ forecast: base, simulated, plans: data.plans, routes: data.routes, routingOptions: routingOptions(data), incomeTypes: data.incomeTypes, categories: data.categories, budgetSuggestions, historyMonths, cards: data.cards.map(c => ({ id: c.id, name: c.name })), cycles: data.cycles.filter(c => c.statementAmount != null).map(c => ({ id: c.id, cardName: c.card.name, month: c.month, year: c.year, pending: Math.max(0, Number(c.statementAmount) - Number(c.postCutCreditAmount) - Number(c.paidAmount)), dueDate: c.dueDate })) });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try { const user = z.object({ id: z.string() }).parse(await requireApiUser(request)); return apiResponse.json(await mutateMoney(prisma as PrismaClient, user.id, await request.json())); }
  catch (error) { return failure(error); }
}
