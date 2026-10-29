import { Prisma, type PrismaClient } from '@prisma/client';
import { validDay } from './money/dates';

export type HistoryDb = Pick<PrismaClient, '$queryRaw'>;
export type Window = { start: Date; end: Date };
export function monthWindow(startValue: Date | string, endValue: Date | string): Window {
  const start = new Date(startValue); const end = new Date(endValue);
  return { start: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)),
    end: new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 1)) };
}
export function dashboardWindow(now: Date, summary: boolean): Window {
  const year = now.getUTCFullYear();
  return summary
    ? { start: new Date(Date.UTC(year, now.getUTCMonth() - 2, 1)), end: new Date(Date.UTC(year, now.getUTCMonth() + 2, 1)) }
    : { start: new Date(Date.UTC(year - 1, 11, 1)), end: new Date(Date.UTC(year + 1, 1, 1)) };
}
export function readPage(params: URLSearchParams, defaultSize = 100) {
  const parse = (key: string, fallback: number, max: number) => {
    const value = params.get(key);
    if (value === null) return fallback;
    if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > max) throw new Error('Paginación no válida.');
    return Number(value);
  };
  return { page: parse('page', 1, 2147483647), pageSize: parse('pageSize', defaultSize, 100) };
}
export function readYear(value: string | null, fallback: number) {
  if (value === null) return fallback;
  if (!/^\d{4}$/.test(value) || Number(value) < 1900 || Number(value) > 9998) throw new Error('Año no válido.');
  return Number(value);
}
export function readDateRange(params: URLSearchParams): Prisma.DailyExpenseWhereInput {
  const start = params.get('startDate'); const end = params.get('endDate');
  if ((start && !validDay(start)) || (end && !validDay(end)) || (start && end && start > end)) throw new Error('Período no válido.');
  return start || end ? { date: { ...(start ? { gte: new Date(`${start}T00:00:00Z`) } : {}), ...(end ? { lte: new Date(`${end}T23:59:59.999Z`) } : {}) } } : {};
}

export async function availableExpenseMonths(db: HistoryDb, userId: string) {
  const rows = await db.$queryRaw<{ month: string }[]>`
    SELECT to_char(date, 'YYYY-MM') AS month FROM daily_expenses
    WHERE "userId" = ${userId} GROUP BY 1 ORDER BY 1 DESC`;
  return rows.map(row => row.month);
}

// Se conservan TODOS los pendientes históricos, incluso PAID guardado con abono
// parcial. Los vecinos mantienen el batch de pagos y las advertencias de fechas.
export async function dashboardCycleIds(db: HistoryDb, userId: string, window: Window, today: Date) {
  return db.$queryRaw<{ id: string }[]>(Prisma.sql`
    WITH seeds AS (
      SELECT id, "cardId", "cutDate" FROM card_cycles WHERE "userId" = ${userId} AND (
        ("cutDate" >= ${window.start} AND "startDate" < ${window.end}) OR
        ("startDate" < ${today} AND "cutDate" >= ${new Date(today.getTime() - 86400000)}) OR
        ("usageReconciliation"->>'startDate' < ${new Date(today.getTime() - 86400000).toISOString().slice(0, 10)} AND "usageReconciliation"->>'cutDate' >= ${new Date(today.getTime() - 86400000).toISOString().slice(0, 10)}) OR
        ("cutDate" < ${today} AND ("statementAmount" IS NULL OR
          round("statementAmount", 2) > greatest(coalesce(round("paidAmount", 2), 0), 0) + greatest(round("postCutCreditAmount", 2), 0)))
    )), selected AS (
      SELECT * FROM seeds UNION
      SELECT c.id, c."cardId", c."cutDate" FROM card_cycles c WHERE c."userId" = ${userId}
        AND date_trunc('month', c."cutDate") = (
          SELECT date_trunc('month', min(u."cutDate")) FROM card_cycles u WHERE u."userId" = ${userId} AND u."cutDate" < ${today}
            AND (u."statementAmount" IS NULL OR round(u."statementAmount", 2) > greatest(coalesce(round(u."paidAmount", 2), 0), 0) + greatest(round(u."postCutCreditAmount", 2), 0))
        )
    ), neighbors AS (
      SELECT c.id FROM selected s JOIN LATERAL (
        (SELECT id FROM card_cycles WHERE "userId" = ${userId} AND "cardId" = s."cardId" AND "cutDate" < s."cutDate" ORDER BY "cutDate" DESC, id LIMIT 1)
        UNION (SELECT id FROM card_cycles WHERE "userId" = ${userId} AND "cardId" = s."cardId" AND "cutDate" > s."cutDate" ORDER BY "cutDate", id LIMIT 1)
      ) c ON true
    ) SELECT id FROM selected UNION SELECT id FROM neighbors`);
}

export function cycleExpenseWhere(userId: string, cycles: { cardId: string; startDate: Date; cutDate: Date }[], calendar?: Window): Prisma.DailyExpenseWhereInput {
  const ranges = cycles.map(cycle => ({ cardId: cycle.cardId, ...monthWindow(cycle.startDate, cycle.cutDate) }));
  const OR: Prisma.DailyExpenseWhereInput[] = calendar ? [{ date: { gte: calendar.start, lt: calendar.end } }] : [];
  for (const range of ranges) {
    OR.push({ cardId: range.cardId, date: { gte: range.start, lt: range.end } });
    OR.push({ cardId: range.cardId, subscriptionCharge: { month: { gte: range.start.toISOString().slice(0, 7), lt: range.end.toISOString().slice(0, 7) } } });
  }
  // Un cargo contabilizado fuera del mes igualmente resuelve su ocurrencia.
  if (calendar) OR.push({ subscriptionCharge: { month: { gte: calendar.start.toISOString().slice(0, 7), lt: calendar.end.toISOString().slice(0, 7) } } });
  return { userId, OR };
}

// La fecha de compra sola no basta: una referencia puede desplazar la primera
// mensualidad. Se incluyen candidatos por todo su plazo y por cada ancla válida.
export async function relevantPurchaseIds(db: HistoryDb, userId: string, windows: Window[]) {
  if (!windows.length) return [];
  const clauses = windows.map(({ start, end }) => {
    const first = start.getUTCFullYear() * 12 + start.getUTCMonth();
    const last = end.getUTCFullYear() * 12 + end.getUTCMonth() - 1;
    return Prisma.sql`(
      (extract(year FROM p."purchaseDate")::int * 12 + extract(month FROM p."purchaseDate")::int - 1 <= ${last}
        AND extract(year FROM p."purchaseDate")::int * 12 + extract(month FROM p."purchaseDate")::int - 1 + p.months >= ${first})
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p."statementReconciliations") = 'array' THEN p."statementReconciliations" ELSE '[]'::jsonb END) r
        WHERE jsonb_typeof(r->'year') = 'number' AND jsonb_typeof(r->'month') = 'number' AND jsonb_typeof(r->'paymentNumber') = 'number'
        AND (CASE WHEN jsonb_typeof(r->'year') = 'number' THEN (r->>'year')::numeric ELSE 0 END) * 12 + (CASE WHEN jsonb_typeof(r->'month') = 'number' THEN (r->>'month')::numeric ELSE 0 END) - (CASE WHEN jsonb_typeof(r->'paymentNumber') = 'number' THEN (r->>'paymentNumber')::numeric ELSE 0 END) <= ${last}
        AND (CASE WHEN jsonb_typeof(r->'year') = 'number' THEN (r->>'year')::numeric ELSE 0 END) * 12 + (CASE WHEN jsonb_typeof(r->'month') = 'number' THEN (r->>'month')::numeric ELSE 0 END) - (CASE WHEN jsonb_typeof(r->'paymentNumber') = 'number' THEN (r->>'paymentNumber')::numeric ELSE 0 END) + p.months >= ${first})
    )`;
  });
  return db.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT p.id FROM installment_purchases p WHERE p."userId" = ${userId}
    AND p.status IN ('ACTIVE', 'PAID_OFF') AND (${Prisma.join(clauses, ' OR ')})`);
}

export async function previousCycleReferences(db: HistoryDb, userId: string, ids: string[]) {
  return db.$queryRaw<{ id: string; cardId: string; cutDate: Date }[]>`
    SELECT DISTINCT p.id, p."cardId", p."cutDate" FROM card_cycles c JOIN LATERAL (
      SELECT id, "cardId", "cutDate" FROM card_cycles WHERE "userId" = ${userId} AND "cardId" = c."cardId"
        AND "cutDate" < c."cutDate" ORDER BY "cutDate" DESC, id LIMIT 1
    ) p ON true WHERE c."userId" = ${userId} AND c.id = ANY(${ids}::text[])`;
}

export function subscriptionHistoryWhere(userId: string, windows: Window[]): Prisma.SubscriptionWhereInput {
  return { userId, OR: windows.map(window => {
    const last = new Date(window.end.getTime() - 1);
    return { AND: [
      { OR: [{ startYear: { lt: last.getUTCFullYear() } }, { startYear: last.getUTCFullYear(), startMonth: { lte: last.getUTCMonth() + 1 } }] },
      { OR: [{ isActive: true }, { deactivatedAt: { gte: window.start } }] },
    ] };
  }) };
}
