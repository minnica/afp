import { z } from 'zod';
import { accountSchema, reconcileSchema, planSchema, withdrawalSchema, paymentSchema } from './schema';
import { transferCommandSchema, reverseTransferCommandSchema } from './transferContracts';
const operationId = z.string();
const id = z.string();
const version = z.number();
export const moneyCommandSchema = z.union([
  accountSchema.safeExtend({ action: z.literal('CREATE_ACCOUNT'), operationId }),
  z.object(accountSchema.shape).partial().safeExtend({ action: z.literal('UPDATE_ACCOUNT'), operationId, id, version }),
  reconcileSchema.extend({ action: z.literal('RECONCILE'), operationId }),
  planSchema.safeExtend({ action: z.literal('SAVE_PLAN'), operationId, id: id.optional(), version: version.optional() }),
  withdrawalSchema.extend({ action: z.literal('WITHDRAWAL'), operationId }),
  paymentSchema.extend({ additional: z.literal(true), action: z.literal('CARD_PAYMENT'), operationId }),
  transferCommandSchema, reverseTransferCommandSchema,
  z.object({ action: z.literal('REVERSE_WITHDRAWAL'), operationId, id }),
  z.object({ action: z.literal('REVERSE_PAYMENT'), operationId, id }),
  z.object({ action: z.literal('OCCURRENCE'), operationId, planId: id, date: z.string(), status: z.enum(['SKIPPED', 'CLOSED', 'RESTORE']) }),
  z.object({ action: z.literal('ROUTE'), operationId, key: z.string(), clear: z.literal(true) }),
  z.object({ action: z.literal('ROUTE'), operationId, key: z.string(), clear: z.literal(false).optional(), excluded: z.boolean(), accountId: z.string().nullable(), planId: z.string().nullable().optional(), occurrenceDate: z.string().nullable().optional() }),
]);
export type MoneyCommand = z.input<typeof moneyCommandSchema>;
export const mutationResponseSchema = z.object({ ok: z.literal(true), id: z.string().optional() }).catchall(z.json());
export type MoneyMutationResponse = z.output<typeof mutationResponseSchema>;

export type MoneyResult<C extends MoneyCommand> = C extends { action: 'CREATE_ACCOUNT' | 'WITHDRAWAL' | 'CARD_PAYMENT' | 'TRANSFER' }
  ? { ok: true; id: string }
  : C extends { action: 'SAVE_PLAN' }
    ? C extends { id: string } ? { ok: true } : 'id' extends keyof C ? MoneyMutationResponse : { ok: true; id: string }
    : { ok: true };
export function parseMoneyResponse<C extends MoneyCommand>(command: C, value: unknown): MoneyResult<C>;
export function parseMoneyResponse(command: MoneyCommand, value: unknown): MoneyMutationResponse {
  const createsRecord = ['CREATE_ACCOUNT', 'WITHDRAWAL', 'CARD_PAYMENT', 'TRANSFER'].includes(command.action)
    || (command.action === 'SAVE_PLAN' && !command.id);
  return createsRecord ? mutationResponseSchema.required().parse(value) : mutationResponseSchema.parse(value);
}
