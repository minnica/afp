import { z } from 'zod';

export const MAX_MONEY_AMOUNT = 9999999999.99;

/** Civil dates must survive a UTC round trip without Date normalizing the day. */
export function isCalendarDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) return false;
  const date = new Date(`${value}T12:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export const calendarDaySchema = z.string().refine(isCalendarDay, 'Indica una fecha válida (YYYY-MM-DD).');

// No coercion or trimming here: expense receipts hash the original HTTP values.
// Positivity, zero and signed balances remain rules of the individual operation.
export const moneyInputSchema = z.union([z.string(), z.number()])
  .refine(value => /^-?\d+(?:\.\d{1,2})?$/.test(String(value)), 'Indica un importe con hasta dos decimales.')
  .refine(value => Number.isFinite(Number(value)) && Math.abs(Number(value)) <= MAX_MONEY_AMOUNT,
    'El importe no puede superar $9,999,999,999.99.');

export function requiredTextSchema(label: string) {
  return z.string().refine(value => value.trim().length > 0, `${label} no puede estar vacío.`);
}
