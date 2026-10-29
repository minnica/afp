import { Prisma, type PrismaClient } from '@prisma/client';
import { availableExpenseMonths, readPage, readDateRange } from './historyWindow';
import { z } from 'zod';
import { normalizeExpenseSearch } from './expenseFilters';

const mobileFilters = z.array(z.object({ type: z.enum(['category', 'payment', 'concept', 'amount']), value: z.string().max(200) })).max(40);
const combiningMarks = '[\u0300-\u036f]';
const fold = (expression: Prisma.Sql) => Prisma.sql`lower(regexp_replace(normalize(${expression}, NFD), ${combiningMarks}, '', 'g'))`;

export function expenseHistoryQuery(params: URLSearchParams) {
  const pagination = readPage(params);
  readDateRange(params);
  const clauses = [Prisma.sql`true`];
  const add = (key: string, column: Prisma.Sql) => { const value = params.get(key); if (value && value !== 'ALL') clauses.push(Prisma.sql`${column} = ${value}`); };
  add('categoryId', Prisma.sql`e."categoryId"`); add('cardId', Prisma.sql`e."cardId"`); add('debitAccountId', Prisma.sql`e."debitAccountId"`);
  const method = params.get('paymentMethod');
  if (method && method !== 'ALL') {
    if (!['CASH', 'CARD', 'DEBIT'].includes(method)) throw new Error('Método de pago no válido.');
    clauses.push(Prisma.sql`e."paymentMethod"::text = ${method}`);
  }
  if (params.get('startDate')) clauses.push(Prisma.sql`e.date >= ${new Date(`${params.get('startDate')}T00:00:00Z`)}`);
  if (params.get('endDate')) clauses.push(Prisma.sql`e.date <= ${new Date(`${params.get('endDate')}T23:59:59.999Z`)}`);
  if (params.get('concept')?.trim()) clauses.push(Prisma.sql`strpos(lower(e.concept), ${params.get('concept')!.trim().toLowerCase()}) > 0`);
  if (params.get('amount')?.trim()) {
    const amount = Number(params.get('amount'));
    if (!Number.isFinite(amount) || amount < 0) throw new Error('Importe no válido.');
    clauses.push(Prisma.sql`e.amount = ${amount}`);
  }
  const rawFilters = params.get('filters');
  if (rawFilters) {
    const filters = mobileFilters.parse(JSON.parse(rawFilters));
    for (const type of ['category', 'payment', 'concept', 'amount'] as const) {
      const alternatives = filters.filter(item => item.type === type).map(({ value }) => {
        if (type === 'category') return Prisma.sql`e."categoryId" = ${value}`;
        if (type === 'concept') return Prisma.sql`strpos(${fold(Prisma.sql`e.concept`)}, ${normalizeExpenseSearch(value)}) > 0`;
        if (type === 'amount') {
          if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error('Importe no válido.');
          return Prisma.sql`round(e.amount * 100) = ${Number(value)}`;
        }
        if (value === 'CASH' || value === 'DEBIT') return Prisma.sql`e."paymentMethod"::text = ${value}`;
        if (value.startsWith('DEBIT:')) return Prisma.sql`e."paymentMethod" = 'DEBIT' AND e."debitAccountId" = ${value.slice(6)}`;
        return Prisma.sql`e."paymentMethod" = 'CARD' AND e."cardId" = ${value}`;
      });
      if (alternatives.length) clauses.push(Prisma.sql`(${Prisma.join(alternatives.map(clause => Prisma.sql`(${clause})`), ' OR ')})`);
    }
  }
  const sortColumns: Record<string, Prisma.Sql> = { date: Prisma.sql`e.date`, concept: Prisma.sql`e.concept`, amount: Prisma.sql`e.amount`, paymentMethod: Prisma.sql`e."paymentMethod"`, category: Prisma.sql`cat.name`, card: Prisma.sql`card.name` };
  const sort = sortColumns[params.get('sortBy') || 'date'];
  const direction = params.get('sortDirection') || 'desc';
  if (!sort || !['asc', 'desc'].includes(direction)) throw new Error('Orden no válido.');
  return { ...pagination, predicate: Prisma.join(clauses, ' AND '), order: Prisma.sql`${sort} ${direction === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`}, e.date DESC, e."createdAt" DESC, e.id DESC` };
}

export async function readExpenseHistory<S extends Prisma.DailyExpenseSelect>(db: PrismaClient, userId: string, query: ReturnType<typeof expenseHistoryQuery>, select: S) {
  return db.$transaction(async tx => {
    const predicate = Prisma.sql`e."userId" = ${userId} AND ${query.predicate}`;
    const [summary] = await tx.$queryRaw<{ count: bigint; total: Prisma.Decimal; personalTotal: Prisma.Decimal }[]>(Prisma.sql`
      SELECT count(*) AS count, coalesce(sum(round(e.amount, 2)), 0) AS total,
        coalesce(sum(round(e.amount, 2) - round(e."cashContributionAmount", 2)), 0) AS "personalTotal"
      FROM daily_expenses e WHERE ${predicate}`);
    const totalCount = Number(summary?.count || 0);
    const pageCount = Math.max(1, Math.ceil(totalCount / query.pageSize));
    const page = Math.min(query.page, pageCount);
    const ids = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT e.id FROM daily_expenses e
      LEFT JOIN categories cat ON cat.id = e."categoryId" LEFT JOIN cards card ON card.id = e."cardId"
      WHERE ${predicate} ORDER BY ${query.order} LIMIT ${query.pageSize} OFFSET ${(page - 1) * query.pageSize}`);
    const [rows, availableMonths] = await Promise.all([
      tx.dailyExpense.findMany({ where: { userId, id: { in: ids.map(item => item.id) } }, select: { ...select, id: true } }),
      availableExpenseMonths(tx, userId),
    ]);
    const byId = new Map(rows.map(row => [z.object({ id: z.string() }).parse(row).id, row]));
    return { expenses: ids.flatMap(item => { const row = byId.get(item.id); return row ? [row] : []; }),
      availableMonths, total: Number(summary?.total || 0), personalTotal: Number(summary?.personalTotal || 0), totalCount, page, pageSize: query.pageSize, pageCount };
  }, { isolationLevel: 'RepeatableRead' });
}
