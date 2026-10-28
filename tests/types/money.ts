import type { z } from 'zod';
import type { MoneyCommand } from '@/lib/money/commands';
import type { MoneyData } from '@/lib/money/data';
import type { MoneyResponse } from '@/lib/money/responses';
import type { accountSchema, planSchema, paymentSchema } from '@/lib/money/schema';
import type { EditorConfiguration } from '@/components/mi-dinero/editorContracts';
import { field } from '@/components/mi-dinero/editorContracts';

export const draftPayment: z.input<typeof paymentSchema>['additional'] = false;
export const draftAmount: z.input<typeof accountSchema>['openingBalance'] = '100.25';
// @ts-expect-error Los importes validados ya son números, no texto de edición.
export const savedAmount: z.output<typeof accountSchema>['openingBalance'] = '100.25';
// @ts-expect-error Una previsión exige cuenta y fechas, no solo importe.
export const incompletePlan: MoneyCommand = { action: 'SAVE_PLAN', operationId: 'uuid', amount: 10 };
// @ts-expect-error Una conciliación exige la versión observada.
export const incompleteReconciliation: MoneyCommand = { action: 'RECONCILE', operationId: 'uuid', accountId: 'a', bankBalance: 10, reason: 'Saldo' };
// @ts-expect-error El estado de una ocurrencia tiene variantes concretas.
export const wrongOccurrence: MoneyCommand = { action: 'OCCURRENCE', operationId: 'uuid', planId: 'p', date: '2026-10-27', status: 'PAID' };
// @ts-expect-error No se permiten nombres de campos ajenos a los formularios.
export const wrongField = field('bankAccount', 'Cuenta');
// @ts-expect-error Los campos del editor de cuentas no pueden ser de planes.
export const wrongAccountField: Extract<EditorConfiguration, { action: 'CREATE_ACCOUNT' }>['fields'][number] = { name: 'frequencyMonths', label: 'Frecuencia' };
// @ts-expect-error Los días de una previsión son números tras validación.
export const wrongPlanDays: z.output<typeof planSchema>['days'] = ['15'];
export function queryContracts(data: MoneyData, response: MoneyResponse) {
  // @ts-expect-error La instantánea tiene propiedades explícitas, no claves arbitrarias.
  void data.nonexistent;
  // @ts-expect-error Las relaciones de Prisma están tipadas.
  void data.accounts[0]?.reconciliations[0]?.nonexistent;
  // @ts-expect-error La respuesta HTTP contiene fechas serializadas, no Date.
  void response.forecast.accounts[0]?.asOf.getUTCDate;
  // @ts-expect-error Un saldo proyectado es numérico.
  void response.forecast.summary.balance.toUpperCase;
}

import { sendMoney } from '@/lib/money/client';
export async function mutationContracts() {
  const saved = await sendMoney({ action: 'WITHDRAWAL', operationId: 'uuid', accountId: 'a', amount: '1.25', date: '2026-10-27', concept: 'Retiro' }, { expectedUserId: 'owner' });
  const id: string = saved.id;
  const reversed = await sendMoney({ action: 'REVERSE_WITHDRAWAL', operationId: 'uuid', id }, { expectedUserId: 'owner' });
  // @ts-expect-error Revertir un retiro no devuelve un ID nuevo.
  void reversed.id;
  // @ts-expect-error El comando exige confirmar que el abono es adicional.
  const invalid: MoneyCommand = { action: 'CARD_PAYMENT', operationId: 'uuid', cycleId: 'c', accountId: 'a', date: '2026-10-27', amount: 1, additional: false };
  return invalid;
}
