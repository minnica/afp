import type { Card,CardCycle,Category,DailyExpense,Income,InstallmentPurchase,NoticeDismissal,PayableAccount,Prisma,ReceivableAccount,Subscription } from '@prisma/client';
import type { Sparse } from './financial-fixtures';

export interface NoticeRows {
  card: Sparse<Card>[];
  cardCycle: Sparse<CardCycle & { card: Card; credits: Prisma.CardCycleCreditGetPayload<{ include: { income: true } }>[] }>[];
  dailyExpense: Sparse<DailyExpense>[];
  subscription: Sparse<Subscription & { charges: { month: string; status: string; expenseId?: string }[]; dailyExpenses: DailyExpense[] }>[];
  installmentPurchase: Sparse<InstallmentPurchase>[];
  receivableAccount: Sparse<ReceivableAccount & { person: { name: string }; incomes: Income[] }>[];
  payableAccount: Sparse<PayableAccount & { person: { name: string }; dailyExpenses: DailyExpense[] }>[];
  noticeDismissal: (Omit<Sparse<NoticeDismissal>, 'noticeKey'> & { noticeKey?: string | null })[];
  income: Sparse<Income>[];
  category: Sparse<Category>[];
}
type Query = { where: { userId: string; month?: string | number }; include?: { credits?: { select?: { income?: unknown } } } };
export type NoticeDelegates = { [K in keyof NoticeRows]: { findMany(query: Query): Promise<NoticeRows[K]> } };
// Cada delegate devuelve la colección correspondiente, con las proyecciones
// mínimas del escenario. No añade valores a las filas ni simula PrismaClient.
export function noticeDelegates(rows: NoticeRows, onRead: (model: string, where: Query['where']) => void): NoticeDelegates {
  const entries = (Object.keys(rows) as (keyof NoticeRows)[]).map(key => [key, rows[key]] as const);
  return Object.fromEntries(entries.map(([model, records]) => [model, {
    findMany: async ({ where }: Query) => { onRead(model, where); return records.filter(row => row.userId === where.userId && (!where.month || ('month' in row && row.month === where.month))); },
  }])) as NoticeDelegates;
}
