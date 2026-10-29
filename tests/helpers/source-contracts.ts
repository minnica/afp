import type { BaseSyntheticEvent,Dispatch,SetStateAction } from 'react';
import type { FieldErrors,SubmitHandler,UseFormProps } from 'react-hook-form';
import type { EditorInput,EditorOutput } from '../../src/components/mi-dinero/editorContracts';

// Ampliar por lote: siempre exports públicos derivados de la fuente real.
export interface SourceModules {
  'src/lib/expenseReader.ts': typeof import('../../src/lib/expenseReader');
  'src/lib/financialContracts.ts': typeof import('../../src/lib/financialContracts');
  'src/lib/money/transferContracts.ts': typeof import('../../src/lib/money/transferContracts');
  'src/lib/captureReview.ts': typeof import('../../src/lib/captureReview');
  'src/app/api/captures/reconciliation/route.ts': typeof import('../../src/app/api/captures/reconciliation/route');
  'src/app/api/captures/pairings/route.ts': typeof import('../../src/app/api/captures/pairings/route');
  'src/app/api/captures/devices/route.ts': typeof import('../../src/app/api/captures/devices/route');
  'src/lib/calendar/types.ts': typeof import('../../src/lib/calendar/types');
  'src/lib/calendar/schedule.ts': typeof import('../../src/lib/calendar/schedule');
  'src/lib/calendar/responses.ts': typeof import('../../src/lib/calendar/responses');
  'src/lib/offlineExpenseObserver.ts': typeof import('../../src/lib/offlineExpenseObserver');
  'src/app/api/calendar/google/route.ts': typeof import('../../src/app/api/calendar/google/route');
  'src/app/api/calendar/google/callback/route.ts': typeof import('../../src/app/api/calendar/google/callback/route');
  'src/app/api/cron/calendar-sync/route.ts': typeof import('../../src/app/api/cron/calendar-sync/route');
  'src/lib/calendar/google.ts': typeof import('../../src/lib/calendar/google');
  'src/lib/calendar/events.ts': typeof import('../../src/lib/calendar/events');
  'src/lib/calendar/pending.ts': typeof import('../../src/lib/calendar/pending');
  'src/lib/calendar/palette.ts': typeof import('../../src/lib/calendar/palette');
  'src/lib/calendar/sync.ts': typeof import('../../src/lib/calendar/sync');
  'src/lib/calendar/service.ts': typeof import('../../src/lib/calendar/service');
  'src/lib/calendar/config.ts': typeof import('../../src/lib/calendar/config');
  'src/lib/calendar/worker.ts': typeof import('../../src/lib/calendar/worker');
  'src/lib/captureApi.ts': typeof import('../../src/lib/captureApi');
  'src/app/api/captures/device/route.ts': typeof import('../../src/app/api/captures/device/route');
  'src/lib/captureRefundParsers.ts': typeof import('../../src/lib/captureRefundParsers');
  'src/lib/captureRefunds.ts': typeof import('../../src/lib/captureRefunds');
  'src/lib/captureRollout.ts': typeof import('../../src/lib/captureRollout');
  'src/lib/captureFormatPolicy.ts': typeof import('../../src/lib/captureFormatPolicy');
  'src/lib/capturePaymentParsers.ts': typeof import('../../src/lib/capturePaymentParsers');
  'src/lib/capturePayments.ts': typeof import('../../src/lib/capturePayments');
  'src/app/api/cron/capture-bank-fallback/route.ts': typeof import('../../src/app/api/cron/capture-bank-fallback/route');
  'src/app/api/captures/configuration/route.ts': typeof import('../../src/app/api/captures/configuration/route');
  'src/lib/captureBankFallbackWorker.ts': typeof import('../../src/lib/captureBankFallbackWorker');
  'src/lib/captureParsers.ts': typeof import('../../src/lib/captureParsers');
  'src/app/api/captures/movements/route.ts': typeof import('../../src/app/api/captures/movements/route');
  'src/app/api/captures/events/route.ts': typeof import('../../src/app/api/captures/events/route');
  'src/lib/captureReconciliation.ts': typeof import('../../src/lib/captureReconciliation');
  'src/lib/captureConfiguration.ts': typeof import('../../src/lib/captureConfiguration');
  'src/lib/captureProcessing.ts': typeof import('../../src/lib/captureProcessing');
  'src/lib/captureSourcePolicy.ts': typeof import('../../src/lib/captureSourcePolicy');
  'src/app/api/captures/payment-receipts/route.ts': typeof import('../../src/app/api/captures/payment-receipts/route');
  'src/lib/paymentReceipts.ts': typeof import('../../src/lib/paymentReceipts');
  'src/lib/captureService.ts': typeof import('../../src/lib/captureService');
  'src/lib/offlineExpenses.ts': typeof import('../../src/lib/offlineExpenses');
  'src/lib/apiFetch.ts': typeof import('../../src/lib/apiFetch');
  'src/lib/androidNotices.ts': typeof import('../../src/lib/androidNotices');
  'src/app/api/captures/notices/route.ts': typeof import('../../src/app/api/captures/notices/route');
  'src/lib/calculations/installmentStatements.ts': typeof import('../../src/lib/calculations/installmentStatements');
  'src/lib/calculations/cardCredits.ts': typeof import('../../src/lib/calculations/cardCredits');
  'src/lib/calculations/subscriptionStatements.ts': typeof import('../../src/lib/calculations/subscriptionStatements');
  'src/lib/calculations/cycleDataQuality.ts': typeof import('../../src/lib/calculations/cycleDataQuality');

  'src/app/api/card-cycles/route.ts': typeof import('../../src/app/api/card-cycles/route');
  'src/app/api/cards/route.ts': typeof import('../../src/app/api/cards/route');
  'src/app/api/dashboard/route.ts': typeof import('../../src/app/api/dashboard/route');
  'src/app/api/expenses/route.ts': typeof import('../../src/app/api/expenses/route');
  'src/app/api/installment-purchases/route.ts': typeof import('../../src/app/api/installment-purchases/route');
  'src/app/api/notice-dismissals/route.ts': typeof import('../../src/app/api/notice-dismissals/route');
  'src/app/api/subscription-charges/route.ts': typeof import('../../src/app/api/subscription-charges/route');
  'src/components/mi-dinero/monthlyMinimumPeriod.ts': typeof import('../../src/components/mi-dinero/monthlyMinimumPeriod');
  'src/components/mi-dinero/monthlySummaryStatus.ts': typeof import('../../src/components/mi-dinero/monthlySummaryStatus');
  'src/components/mi-dinero/projectionBreakdown.ts': typeof import('../../src/components/mi-dinero/projectionBreakdown');
  'src/lib/analysisPresentation.ts': typeof import('../../src/lib/analysisPresentation');
  'src/lib/apiAuth.ts': typeof import('../../src/lib/apiAuth');
  'src/lib/calculations/cardCyclePayments.ts': typeof import('../../src/lib/calculations/cardCyclePayments');
  'src/lib/calculations/cardCycles.ts': typeof import('../../src/lib/calculations/cardCycles');
  'src/lib/calculations/cardUsageWaivers.ts': typeof import('../../src/lib/calculations/cardUsageWaivers');
  'src/lib/calculations/debtAccounts.ts': typeof import('../../src/lib/calculations/debtAccounts');
  'src/lib/captureProtocol.ts': typeof import('../../src/lib/captureProtocol');
  'src/lib/cardBalanceTracking.ts': typeof import('../../src/lib/cardBalanceTracking');
  'src/lib/cardBalances.ts': typeof import('../../src/lib/cardBalances');
  'src/lib/cardPaymentPresentation.ts': typeof import('../../src/lib/cardPaymentPresentation');
  'src/lib/cardUsagePresentation.ts': typeof import('../../src/lib/cardUsagePresentation');
  'src/lib/expenseFilters.ts': typeof import('../../src/lib/expenseFilters');
  'src/lib/expenseOperations.ts': typeof import('../../src/lib/expenseOperations');
  'src/lib/financialResponses.ts': typeof import('../../src/lib/financialResponses');
  'src/lib/importantNotices.ts': typeof import('../../src/lib/importantNotices');
  'src/lib/money/budgets.ts': typeof import('../../src/lib/money/budgets');
  'src/lib/money/commands.ts': typeof import('../../src/lib/money/commands');
  'src/lib/money/data.ts': typeof import('../../src/lib/money/data');
  'src/lib/money/forecast.ts': typeof import('../../src/lib/money/forecast');
  'src/lib/money/persisted.ts': typeof import('../../src/lib/money/persisted');
  'src/lib/money/responses.ts': typeof import('../../src/lib/money/responses');
  'src/lib/money/schema.ts': typeof import('../../src/lib/money/schema');
  'src/lib/money/service.ts': typeof import('../../src/lib/money/service');
  'src/lib/money/sources.ts': typeof import('../../src/lib/money/sources');
  'src/lib/money/transfers.ts': typeof import('../../src/lib/money/transfers');
  'src/lib/money/yieldRules.ts': typeof import('../../src/lib/money/yieldRules');
  'src/lib/noticeDismissals.ts': typeof import('../../src/lib/noticeDismissals');
  'src/lib/payablesSummary.ts': typeof import('../../src/lib/payablesSummary');
  'src/lib/sharedExpenses.ts': typeof import('../../src/lib/sharedExpenses');
  'src/lib/subscriptionChargeService.ts': typeof import('../../src/lib/subscriptionChargeService');
  'src/lib/subscriptionCharges.ts': typeof import('../../src/lib/subscriptionCharges');
  'src/lib/uiClient.ts': typeof import('../../src/lib/uiClient');
  'src/lib/uiResponseSchemas.ts': typeof import('../../src/lib/uiResponseSchemas');
  'src/lib/money/transferClient.ts': typeof import('../../src/lib/money/transferClient');
  'src/lib/money/client.ts': typeof import('../../src/lib/money/client');
  'src/lib/money/dates.ts': typeof import('../../src/lib/money/dates');
  'src/lib/requestRecovery.ts': typeof import('../../src/lib/requestRecovery');
  'src/components/mi-dinero/transferEditor.ts': typeof import('../../src/components/mi-dinero/transferEditor');
  'src/components/mi-dinero/MoneyEditor.tsx': typeof import('../../src/components/mi-dinero/MoneyEditor');
  'src/app/api/money/route.ts': typeof import('../../src/app/api/money/route');
}

type SessionRead = Awaited<ReturnType<typeof import('../../src/lib/supabase').supabase.auth.getSession>>;
type UserRead = Awaited<ReturnType<ReturnType<typeof import('@supabase/supabase-js').createClient>['auth']['getUser']>>;

// Dobles mínimos: no se presentan como clientes Supabase, React o RHF completos.
// Los métodos omitidos fallan al usarse. Se derivan los campos que lee el piloto.
export interface SourceMocks extends Record<string, unknown> {
  '@/lib/supabase'?: { supabase: { auth: { getSession: () => Promise<{
    data: { session: null | { user: Pick<NonNullable<SessionRead['data']['session']>['user'], 'id'>; access_token: string } };
    error?: SessionRead['error'];
  }> } } };
  '@supabase/supabase-js'?: { createClient: (...args: Parameters<typeof import('@supabase/supabase-js').createClient>) => {
    auth: { getUser: (token?: string) => Promise<{ data: { user: Pick<NonNullable<UserRead['data']['user']>, 'id'> | null }; error?: UserRead['error'] }> };
  } };
  '@/lib/prisma'?: { prisma: Pick<Exclude<import('../../src/lib/money/service').MoneyTransactionRunner, import('@prisma/client').PrismaClient>, '$transaction'> };
  '@/lib/calendar/schedule'?: Pick<typeof import('../../src/lib/calendar/schedule'), 'scheduleCalendarSync'>;
  'next/server'?: { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response } };
  '@/lib/money/client'?: Pick<typeof import('../../src/lib/money/client'), 'errorMessage'>;
  react?: {
    useRef: <T>(current: T) => { current: T };
    useState: <T>(initial: T | (() => T)) => [T, Dispatch<SetStateAction<T>>];
  };
  'react-hook-form'?: {
    useForm: (options: UseFormProps<EditorInput, unknown, EditorOutput>) => {
      control: Record<string, never>;
      formState: { errors: FieldErrors<EditorInput> };
      handleSubmit: (submit: SubmitHandler<EditorOutput>) => (event?: BaseSyntheticEvent) => void;
    };
    useWatch: (options: { control: unknown; name: string }) => unknown;
  };
  '@hookform/resolvers/zod'?: { zodResolver: (schema: unknown) => unknown };
}

export interface SourceGlobals extends Record<string, unknown> {
  fetch?: typeof fetch;
  Response?: typeof Response;
  Request?: typeof Request;
  process?: { env: Record<string, string | undefined> };
  crypto?: Pick<Crypto, 'randomUUID'>;
}
