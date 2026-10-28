import { z } from 'zod';
import { validDay } from '@/lib/money/dates';

const text = z.string().trim().min(1, 'Completa este campo.').max(160, 'Usa hasta 160 caracteres.');
const positive = z.union([z.string(), z.number()])
  .refine(v => /^-?\d{1,10}(\.\d{1,2})?$/.test(String(v)), 'Indica un importe con hasta dos decimales.')
  .transform(Number).refine(v => v > 0, 'El importe debe ser mayor a cero.');
const operationId = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, 'La operación necesita un identificador válido.');

export const transferSchema = z.object({
  fromAccountId: text, toAccountId: text, amount: positive,
  date: z.string().refine(validDay, 'Indica una fecha válida.'), concept: text,
}).refine(v => v.fromAccountId !== v.toAccountId, { path: ['toAccountId'], message: 'Selecciona otra cuenta de destino.' });

export const transferCommandSchema = transferSchema.safeExtend({ action: z.literal('TRANSFER'), operationId });
export const reverseTransferCommandSchema = z.object({
  action: z.literal('REVERSE_TRANSFER'), operationId,
  // La referencia histórica no recorta espacios ni limita la longitud del ID.
  id: z.string({ error: 'Referencia no válida.' }).min(1, 'Referencia no válida.'),
});
export const transferMutationSchema = z.discriminatedUnion('action', [transferCommandSchema, reverseTransferCommandSchema]);

export type TransferFormInput = z.input<typeof transferSchema>;
export type TransferValues = z.output<typeof transferSchema>;
export type TransferCommand = z.input<typeof transferCommandSchema>;
export type ReverseTransferCommand = z.input<typeof reverseTransferCommandSchema>;
export type TransferMutation = TransferCommand | ReverseTransferCommand;
export type ValidatedTransferMutation = z.output<typeof transferMutationSchema>;

export const transferResponseSchema = z.object({ ok: z.literal(true), id: z.string() });
export const reverseTransferResponseSchema = z.object({ ok: z.literal(true) });
export const transferErrorSchema = z.object({ error: z.string() });
export type TransferResponse = z.output<typeof transferResponseSchema>;
export type ReverseTransferResponse = z.output<typeof reverseTransferResponseSchema>;
export type TransferError = z.output<typeof transferErrorSchema>;

export function parseTransferResponse(action: 'TRANSFER', value: unknown): TransferResponse;
export function parseTransferResponse(action: 'REVERSE_TRANSFER', value: unknown): ReverseTransferResponse;
export function parseTransferResponse(action: TransferMutation['action'], value: unknown): TransferResponse | ReverseTransferResponse;
export function parseTransferResponse(action: TransferMutation['action'], value: unknown) {
  return action === 'TRANSFER' ? transferResponseSchema.parse(value) : reverseTransferResponseSchema.parse(value);
}
