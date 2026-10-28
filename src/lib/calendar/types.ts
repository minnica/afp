import type { z } from 'zod';
import type { loadCalendarData } from './events';
import type { googleResourceSchema, googleLabelPropertiesSchema } from './responses';

export type CalendarData = Awaited<ReturnType<typeof loadCalendarData>>;
export type CalendarEventType = 'cuts' | 'cardPayments' | 'subscriptions' | 'receivables' | 'payables';
export type CalendarPreferences = { types: CalendarEventType[]; showAmounts: boolean; reminders: boolean }
export interface CalendarEvent {
  key: string; type: CalendarEventType; date: string; title: string; detail: string; route: string;
  settled: boolean; informational?: boolean; reviewed?: boolean; partial?: boolean; overdue?: boolean;
  amount?: number | null;
}
export type GoogleResource = z.output<typeof googleResourceSchema>;
export type GoogleLabelProperties = z.output<typeof googleLabelPropertiesSchema>;
export interface CalendarClient {
  request(path: string, method?: string, body?: unknown, headers?: Record<string, string>): Promise<GoogleResource>;
  all(path: string): Promise<GoogleResource[]>;
  rotatedToken?: string;
}
export type CalendarSyncResult =
  | { status: 'UNCONFIGURED' | 'SKIPPED' | 'BUSY' }
  | { status: 'DISCONNECTED'; writes?: number }
  | { status: 'SYNCED'; writes: number; events: number }
  | { status: 'PENDING'; code?: string }
  | { status: 'ERROR'; code: string };
