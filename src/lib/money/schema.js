import { z } from 'zod';
import { validDay } from '@/lib/money/dates';
const text = z.string().trim().min(1, 'Completa este campo.').max(160, 'Usa hasta 160 caracteres.');
const money = z.union([z.string(), z.number()]).refine(v => /^-?\d{1,10}(\.\d{1,2})?$/.test(String(v)), 'Indica un importe con hasta dos decimales.').transform(Number);
const positive = money.refine(v => v > 0, 'El importe debe ser mayor a cero.');
const date = z.string().refine(validDay, 'Indica una fecha válida.');
export const accountSchema = z.object({
  name: text, kind: z.enum(['BANK', 'SAVINGS', 'CASH']), openingBalance: money, asOf: date,
  reservedAmount: money.refine(v => v >= 0, 'La reserva no puede ser negativa.'),
  annualYield: z.coerce.number().min(0).max(100).default(0), yieldTaxPercent: z.coerce.number().min(0).max(100).default(0),
  yieldBasis: z.coerce.number().refine(v => [360, 365, 366].includes(v), 'Usa una base de 360, 365 o 366 días.').default(365),
  yieldFrequency: z.literal('DAILY').default('DAILY'), yieldPayDay: z.literal(1).default(1),
  autoYield: z.boolean().default(true),
  yieldMethod: z.enum(['NOMINAL', 'DAILY_AMOUNT']).default('NOMINAL'),
  yieldDailyAmount: z.union([money.refine(v => v >= 0, 'El importe no puede ser negativo.'), z.literal(''), z.null()]).optional(),
  yieldExcessRate: z.coerce.number().min(0).max(100).default(0),
  yieldPayout: z.enum(['DAILY', 'MX_BUSINESS']).default('DAILY'),
  yieldRounding: z.enum(['ROUND', 'DOWN']).default('ROUND'),
  yieldInitialPendingDays: z.union([z.literal('').transform(() => null), z.null(), z.coerce.number().int().min(0).max(31)]).optional(),
  yieldCap: z.union([positive, z.literal(''), z.null()]).optional(),
  yieldStartDate: z.union([date, z.literal(''), z.null()]).optional(), yieldEndDate: z.union([date, z.literal(''), z.null()]).optional(), yieldIncomeTypeId: z.string().nullable().optional(),
}).refine(v => !v.yieldStartDate || !v.yieldEndDate || v.yieldStartDate <= v.yieldEndDate, { path: ['yieldEndDate'], message: 'Revisa la vigencia de la tasa.' }).refine(v => v.yieldMethod !== 'DAILY_AMOUNT' || (v.yieldCap > 0 && typeof v.yieldDailyAmount === 'number'), { path: ['yieldDailyAmount'], message: 'Indica el importe diario y el saldo máximo al que corresponde.' }).refine(v => !v.yieldExcessRate || v.yieldCap > 0, { path: ['yieldCap'], message: 'Indica desde qué saldo aplica la tasa del excedente.' });
export const reconcileSchema = z.object({ accountId: text, version: z.number().int().positive(), bankBalance: money, reason: text });
export const planSchema = z.object({
  name: text, kind: z.enum(['PAYROLL', 'INCOME', 'EXPENSE', 'VARIABLE']), amount: positive,
  accountId: text, cardId: z.string().nullable().optional(), incomeTypeId: z.string().nullable().optional(), categoryId: z.string().nullable().optional(),
  startDate: date, endDate: z.union([date, z.literal(''), z.null()]).optional(),
  frequencyMonths: z.number().int().min(0).max(12), days: z.array(z.number().int().min(1).max(31)).max(4), payrollBusinessDays: z.boolean().default(false), isActive: z.boolean().default(true),
}).superRefine((v, ctx) => {
  if (v.endDate && v.endDate < v.startDate) ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'El fin debe ser posterior al inicio.' });
  if (v.frequencyMonths > 0 && !v.days.length && v.kind !== 'VARIABLE') ctx.addIssue({ code: 'custom', path: ['days'], message: 'Indica los días del mes.' });
  if (v.kind === 'VARIABLE' && (!v.categoryId || v.frequencyMonths !== 1)) ctx.addIssue({ code: 'custom', path: ['categoryId'], message: 'El presupuesto variable requiere categoría y frecuencia mensual.' });
  if (v.cardId && ['INCOME', 'PAYROLL'].includes(v.kind)) ctx.addIssue({ code: 'custom', path: ['cardId'], message: 'El ingreso se recibe en una cuenta.' });
});
export const transferSchema = z.object({ fromAccountId: text, toAccountId: text, amount: positive, date, concept: text }).refine(v => v.fromAccountId !== v.toAccountId, { path: ['toAccountId'], message: 'Selecciona otra cuenta de destino.' });
export const paymentSchema = z.object({ cycleId: text, accountId: text, amount: positive, date, additional: z.literal(true, { error: 'Confirma que es un abono nuevo.' }) });
export const scenarioSchema = z.object({ stopPayrollDate: z.union([date, z.literal('')]).default(''), collectionDelay: z.coerce.number().int().min(0).max(180).default(0), variablePercent: z.coerce.number().min(0).max(300).default(100), extraAmount: money.refine(v => v >= 0).default(0), extraDate: z.union([date, z.literal('')]).default(''), extraAccountId: z.string().default('') }).superRefine((v, ctx) => {
  if (v.extraAmount > 0 && !v.extraDate) ctx.addIssue({ code: 'custom', path: ['extraDate'], message: 'Indica cuándo harías la compra.' });
  if (v.extraAmount > 0 && !v.extraAccountId) ctx.addIssue({ code: 'custom', path: ['extraAccountId'], message: 'Selecciona la cuenta de salida.' });
});
