import type { ImportantNotice } from './importantNotices';
import { calendarDaySchema, moneyInputSchema } from './financialValidation';
import { z } from 'zod';

export function cardStatementHref(notice: Pick<ImportantNotice, 'type' | 'cycleId'>) {
  if (!['CUT_CYCLE', 'CUT_CYCLE_UPCOMING'].includes(notice.type) || !notice.cycleId) return null;
  return `/tarjetas?${new URLSearchParams({ statementCycleId: notice.cycleId })}`;
}

export const cardStatementSchema = z.object({
  statementAmount: z.string()
    .refine(value => moneyInputSchema.safeParse(value).success, 'Indica un importe con hasta dos decimales y máximo $9,999,999,999.99.')
    .refine(value => Number(value) >= 0, 'El importe no puede ser negativo.'),
  startDate: calendarDaySchema,
  cutDate: calendarDaySchema,
  dueDate: calendarDaySchema,
}).refine(value => value.startDate < value.cutDate, {
  path: ['startDate'], message: 'La fecha de inicio debe ser menor a la fecha de corte.',
}).refine(value => value.cutDate < value.dueDate, {
  path: ['dueDate'], message: 'La fecha límite debe ser posterior al corte.',
});

export type CardStatementDraft = z.input<typeof cardStatementSchema>;
