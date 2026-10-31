import type { Prisma } from '@prisma/client';
import type { MoneyData } from './data';

export type MoneyValue = Prisma.Decimal | number | string | null | undefined;
export type DateValue = Date | string;
// Calculations accept both database Decimal/Date and the edited values before
// persistence. All model fields and relations still originate in Prisma queries.
export type CalculationValues<T> = T extends Prisma.Decimal ? Prisma.Decimal | number | string
  : T extends Date ? DateValue : T extends readonly (infer U)[] ? CalculationValues<U>[]
  : T extends object ? { [K in keyof T]: CalculationValues<T[K]> } : T;
export type CalculationData = CalculationValues<MoneyData>;
export type MoneyAccount = CalculationData['accounts'][number];
export type MoneyPlan = CalculationData['plans'][number];
export type MoneyRoute = Partial<Pick<CalculationData['routes'][number], 'accountId' | 'excluded' | 'planId' | 'occurrenceDate'>>;
export type EventStatus = 'ACTUAL' | 'CALCULATED' | 'REGISTERED_FUTURE' | 'EXPECTED' | 'ESTIMATED' | 'COMMITTED';
export interface MoneyEvent {
  key: string; date: string | null; cents: number; label: string; kind: string;
  accountId?: string | null; excluded?: boolean; status?: EventStatus;
  planId?: string | null; occurrenceDate?: string | null; incomeTypeId?: string | null;
  receivableId?: string | null; payableId?: string | null; subscriptionId?: string | null;
  categoryId?: string | null; cardId?: string | null; route?: string;
  transferId?: string; withdrawalId?: string; debitExpenseId?: string; ownPaymentId?: string | null;
  paymentGroup?: string; approximateDate?: boolean; automaticYield?: boolean;
  estimatedIncome?: boolean;
  originalDate?: string; includedInReference?: boolean; needsAccount?: boolean;
}
export type DatedEvent = MoneyEvent & { date: string };
export interface MoneyIssue { key: string; message: string; scope?: 'HISTORICAL' | 'PROJECTION' }
export type Exposure = Record<string, Record<string, number>>;
