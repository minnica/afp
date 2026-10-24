import { apiResponse, requireApiUser, apiAccessErrorResponse } from '@/lib/apiAuth';
import { prisma } from '@/lib/prisma';
import { loadMoneyData, mutateMoney, routingOptions } from '@/lib/money/service';
import { buildForecast } from '@/lib/money/forecast';
import { todayInMexico, addMonths, day } from '@/lib/money/dates';
import { cents, amount } from '@/lib/money/sources';
import { scenarioSchema } from '@/lib/money/schema';

function failure(error) {
  const access = apiAccessErrorResponse(error); if (access) return access;
  if (error.code === 'P2002') return apiResponse.json({ error: 'Ya existe un registro con esos datos.' }, { status: 409 });
  if (error.code === 'P2021' || error.code === 'P2022') return apiResponse.json({ error: 'Mi dinero requiere aplicar la migración de cuentas antes de utilizarse.' }, { status: 503 });
  console.error('Money operation failed', error.code || error.name);
  return apiResponse.json({ error: 'No se pudo completar la operación de Mi dinero.' }, { status: 500 });
}
export async function GET(request) {
  try {
    const user = await requireApiUser(request), params = Object.fromEntries(new URL(request.url).searchParams);
    const scenario = scenarioSchema.safeParse(params);
    if (!scenario.success) return apiResponse.json({ error: 'Revisa las fechas e importes del escenario.' }, { status: 400 });
    return await prisma.$transaction(async tx => {
      const data = await loadMoneyData(tx, user.id), today = todayInMexico();
      const historyMonths = [3, 2, 1].map(n => addMonths(today, -n));
      const budgetSuggestions = data.categories.map(category => {
        const expenses = data.expenses.filter(e => e.categoryId === category.id && !e.subscriptionId && !e.payableAccountId && historyMonths.includes(day(e.date).slice(0, 7)));
        return { categoryId: category.id, name: category.name, amount: amount(Math.round(expenses.reduce((sum, e) => sum + cents(e.amount), 0) / 3)), monthsWithRecords: new Set(expenses.map(e => day(e.date).slice(0, 7))).size };
      }).filter(s => s.amount > 0);
      if (scenario.data.extraAccountId && !data.accounts.some(a => a.id === scenario.data.extraAccountId)) return apiResponse.json({ error: 'Cuenta no encontrada.' }, { status: 404 });
      const base = buildForecast(data, today), simulated = Object.keys(params).some(k => k !== 'userId') ? buildForecast(data, today, scenario.data) : null;
      return apiResponse.json({ forecast: base, simulated, plans: data.plans, routes: data.routes, routingOptions: routingOptions(data), incomeTypes: data.incomeTypes, categories: data.categories, budgetSuggestions, historyMonths, cards: data.cards.map(c => ({ id: c.id, name: c.name })), cycles: data.cycles.filter(c => c.statementAmount != null).map(c => ({ id: c.id, cardName: c.card.name, month: c.month, year: c.year, pending: Math.max(0, Number(c.statementAmount) - Number(c.postCutCreditAmount) - Number(c.paidAmount)), dueDate: c.dueDate })) });
    }, { isolationLevel: 'RepeatableRead', timeout: 20000 });
  } catch (error) { return failure(error); }
}
export async function POST(request) {
  try { const user = await requireApiUser(request); return apiResponse.json(await mutateMoney(prisma, user.id, await request.json())); }
  catch (error) { return failure(error); }
}
