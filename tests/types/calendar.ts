import type { CalendarPreferences, CalendarEvent, CalendarSyncResult } from '@/lib/calendar/types';
import { googleRequest } from '@/lib/calendar/google';

export const preferences: CalendarPreferences = { types: ['cuts', 'receivables'], showAmounts: false, reminders: true };
// @ts-expect-error La agenda solo admite los tipos de evento existentes.
export const wrongType: CalendarPreferences = { ...preferences, types: ['expenses'] };
// @ts-expect-error Los importes visibles son una preferencia booleana.
export const wrongAmounts: CalendarPreferences = { ...preferences, showAmounts: 'yes' };
// @ts-expect-error Un evento usa un día bancario serializado, no un timestamp Date.
export const wrongDay: CalendarEvent = { key: 'k', type: 'cuts', date: new Date(), title: 'Corte', detail: '', route: '/tarjetas', settled: false };
// @ts-expect-error Una sincronización completa debe indicar escrituras y eventos.
export const incompleteSync: CalendarSyncResult = { status: 'SYNCED' };
export async function providerData() {
  const data = await googleRequest('https://example.test');
  // @ts-expect-error Una respuesta de transporte no garantiza que exista un token.
  const token: string = data.access_token;
  return token;
}
