import { z } from 'zod';
import { accountSchema, reconcileSchema, planSchema, withdrawalSchema, paymentSchema, scenarioSchema } from '@/lib/money/schema';
import { transferSchema } from '@/lib/money/transferContracts';
import { moneyCommandSchema } from '@/lib/money/commands';
export const routeEditorSchema = z.object({ accountId: z.string().min(1, 'Selecciona una cuenta o un tratamiento.'), planChoice: z.string().optional() });
export const editorSchemas = { CREATE_ACCOUNT: accountSchema, UPDATE_ACCOUNT: accountSchema, RECONCILE: reconcileSchema, SAVE_PLAN: planSchema, WITHDRAWAL: withdrawalSchema, CARD_PAYMENT: paymentSchema, TRANSFER: transferSchema, ROUTE: routeEditorSchema, SCENARIO: scenarioSchema };
type Schemas = typeof editorSchemas;
type Action = keyof Schemas;
type KeysOfUnion<T> = T extends unknown ? keyof T : never;
export type EditorInput = z.input<Schemas[Action]>;
export type EditorOutput = z.output<Schemas[Action]>;
export type EditorFieldName = KeysOfUnion<EditorInput> & string;
export type EditorField<Name extends string = EditorFieldName> = {
  name: Name; label: string; type?: 'number' | 'date' | 'checkbox' | 'days'; money?: boolean;
  options?: { value: string; label: string }[]; help?: string; advanced?: boolean; numeric?: boolean; step?: string;
  nullable?: boolean; disabled?: boolean; kinds?: string[]; methods?: string[]; singlePayment?: boolean; recurringDays?: boolean;
};
export type EditorConfiguration = { [A in Action]: {
  action: A; schema: Schemas[A]; values: z.input<Schemas[A]>;
  title: string; description: string; saveLabel?: string;
  fields: EditorField<keyof z.input<Schemas[A]> & string>[];
  extra?: { id?: string; version?: number; key?: string };
} }[Action];
const routeSubmissionSchema = routeEditorSchema.extend({ action: z.literal('ROUTE'), key: z.string(), operationId: z.string() });
const scenarioSubmissionSchema = scenarioSchema.safeExtend({ action: z.literal('SCENARIO'), operationId: z.string() });
export const editorSubmissionSchema = z.union([routeSubmissionSchema, scenarioSubmissionSchema, moneyCommandSchema]);
export type EditorSubmission = z.output<typeof editorSubmissionSchema>;
export const field = <N extends EditorFieldName>(name: N, label: string, extra: Omit<EditorField<N>, 'name' | 'label'> = {}): EditorField<N> => ({ name, label, ...extra });
export const amountField = <N extends EditorFieldName>(name: N, label: string, extra: Omit<EditorField<N>, 'name' | 'label'> = {}): EditorField<N> => field(name, label, { type: 'number', money: true, ...extra });
