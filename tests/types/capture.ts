import type { CaptureDeviceState, CaptureEventV1, CaptureResolution } from '@/lib/captureTypes';
import type { CaptureConfigurationInput } from '@/lib/captureConfiguration';
import { readCaptureJson } from '@/lib/captureProtocol';

export const discard: CaptureResolution = { id: 'movement', action: 'discard' };
export const linked: CaptureResolution = { id: 'movement', action: 'link', expenseId: 'expense' };
// @ts-expect-error Vincular exige identificar el gasto existente.
export const missingExpense: CaptureResolution = { id: 'movement', action: 'link' };
// @ts-expect-error El plazo de una compra a meses es numérico.
export const badMonths: CaptureResolution = { id: 'movement', action: 'convertToInstallments', months: '12' };
// @ts-expect-error Un descarte no es un pago y no admite sus campos.
export const mixedResolution: CaptureResolution = { ...discard, payment: {} };
// @ts-expect-error Una aprobación no es un estado persistido del dispositivo.
export const badState: CaptureDeviceState = 'APPROVED';
// @ts-expect-error El contrato nativo continúa usando exclusivamente la versión 1.
export const badVersion: CaptureEventV1 = { contractVersion: 2, eventId: 'event', sourcePackage: 'bank', notificationKeyHash: 'hash', postedAt: '', receivedAt: '', fields: {} };
// @ts-expect-error La automatización por tarjeta exige la tarjeta y el analizador.
export const missingPolicy: CaptureConfigurationInput = { action: 'automation', mode: 'AUTOMATIC' };
// @ts-expect-error Una transferencia requiere la cuenta de destino explícita.
export const missingDestination: CaptureResolution = { id: 'movement', action: 'registerMoneyTransfer', money: { fromAccountId: 'a', amount: '10', date: '2026-10-28', concept: 'Transferencia', currency: 'MXN' } };
// @ts-expect-error Corregir a pago de tarjeta requiere seleccionar su corte.
export const missingCycle: CaptureResolution = { id: 'movement', action: 'correctDebitType', correction: { kind: 'CARD_PAYMENT' } };
export async function untrustedBody(request: Request) {
  const body = await readCaptureJson(request);
  // @ts-expect-error Leer JSON no valida sus campos ni permite usarlos como resolución.
  const resolution: CaptureResolution = body;
  return resolution;
}
