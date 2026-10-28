import type { BaseSyntheticEvent, Dispatch, SetStateAction } from 'react';
import type { FieldErrors, SubmitHandler, UseFormProps } from 'react-hook-form';
import type { EditorInput, EditorOutput } from '../../src/components/mi-dinero/editorContracts';

// Ampliar por lote: siempre exports públicos derivados de la fuente real.
export interface SourceModules {
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
