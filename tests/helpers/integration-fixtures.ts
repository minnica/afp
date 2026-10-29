import { historyFixtureMocks } from "./history-fixture";
import assert from 'node:assert/strict';
import { record } from './dynamic-values';
import type { Sparse,TestRequest } from './financial-fixtures';
import { fixtureSourceLoader } from './load-source';
import type { SourceGlobals,SourceMocks,SourceModules } from './source-contracts';

// Respuestas deliberadamente mínimas; no se presentan como Response/NextResponse.
export interface FixtureReply { body: Record<string, unknown>; status: number; headers?: Headers; url?: string; cookies?: unknown }
type Handler = (request: TestRequest & { body?: unknown; cookies?: { get(name: string): { value: string } | undefined } }) => Promise<FixtureReply>;
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
const httpMethods = new Set<string>(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
type IntegrationModule<P extends keyof SourceModules> = P extends `src/app/api/${string}`
  ? { [K in keyof SourceModules[P]]: K extends HttpMethod ? Handler : SourceModules[P][K] } : SourceModules[P];
export type AuthFixtureResult = {
  data?: { user?: { id: string } | null };
  error?: Partial<Pick<import('@supabase/supabase-js').AuthError, 'name' | 'status'>> | null;
};
type AsyncMocks<M> = { [K in keyof M]?: M[K] extends (...args: infer A) => Promise<infer R> ? (...args: A) => Promise<Sparse<R>> : M[K] };
export interface IntegrationMocks extends Record<string, unknown> {
  'next/server'?: { NextResponse: { json?: (body: unknown, options?: ResponseInit) => unknown; redirect?: (url: string, status: number) => unknown } };
  '@supabase/supabase-js'?: { createClient: () => { auth: { getUser: (token: string) => Promise<AuthFixtureResult> } } };
  '@/lib/supabase'?: SourceMocks['@/lib/supabase'];
  '@/lib/prisma'?: { prisma: object };
  '@/lib/apiAuth'?: { ApiAccessError?: new (...args: never[]) => Error; requireApiUser?: (request?: TestRequest) => Promise<{ id: string }>; apiAccessErrorResponse?: (error?: unknown) => unknown; apiResponse?: { json: (body: unknown, options?: ResponseInit) => unknown } };
  '@/lib/captureParsers'?: Partial<SourceModules['src/lib/captureParsers.ts']>;
  '@/lib/captureService'?: AsyncMocks<SourceModules['src/lib/captureService.ts']>;
  '@/lib/captureProcessing'?: AsyncMocks<SourceModules['src/lib/captureProcessing.ts']>;
  '@/lib/calendar/service'?: {
    calendarStatus?: (...args: Parameters<SourceModules['src/lib/calendar/service.ts']['calendarStatus']>) => Promise<Sparse<Awaited<ReturnType<SourceModules['src/lib/calendar/service.ts']['calendarStatus']>>>>;
    updateCalendarPreferences?: (...args: Parameters<SourceModules['src/lib/calendar/service.ts']['updateCalendarPreferences']>) => Promise<unknown>;
    completeCalendarOAuth?: SourceModules['src/lib/calendar/service.ts']['completeCalendarOAuth'];
  };
  '@/lib/calendar/schedule'?: { scheduleCalendarSync: (userId: string) => unknown };
}
export interface IntegrationGlobals extends Omit<SourceGlobals, 'fetch'> { fetch?: (url: string, init: RequestInit) => Promise<unknown> }

// Solo adapta el transporte del mock. Las funciones de dominio mantienen sus
// firmas reales; rutas dinámicas conservan unknown y requieren inspección.
export function integrationLoader(mocks: IntegrationMocks = {}, globals: IntegrationGlobals = {}) {
  // El cargador vm acepta globals de prueba, incluidos transportes incompletos.
  const load = fixtureSourceLoader(historyFixtureMocks(mocks), globals);
  function integrationLoad<P extends keyof SourceModules>(file: P): IntegrationModule<P>;
  function integrationLoad(file: string): unknown;
  function integrationLoad(file: string): unknown {
    const value = load(file);
    if (!file.startsWith('src/app/api/')) return value;
    return Object.fromEntries(Object.entries(record(value)).map(([key, fn]) => {
      // Next exporta también metadatos; conservar sus valores y tipos reales.
      if (!httpMethods.has(key)) return [key, fn];
      return [key, async (request: TestRequest) => {
      assert.equal(typeof fn, 'function');
      if (typeof fn !== 'function') throw new Error('Handler inválido');
      const reply = record(await Reflect.apply(fn, undefined, [request]));
      assert.equal(typeof reply.status, 'number');
      return reply;
      }];
    }));
  }
  return integrationLoad;
}

export type SessionFixture = { user: { id: string }; access_token: string } | null;
export type NoticeSample = { event: Pick<CaptureInput, 'sourcePackage' | 'postedAt' | 'receivedAt' | 'fields'> };
export type CaptureInput = import('../../src/lib/captureTypes').CaptureEventV1;
export function parseJson(text: string): unknown { const value: unknown = JSON.parse(text); return value; }

export function serviceWorkerListeners() {
  const handlers = new Map<string, unknown>();
  const register = (name: string, listener: unknown) => { assert.equal(typeof listener, 'function'); handlers.set(name, listener); };
  const invoke = (name: string, event: unknown) => {
    const handler = handlers.get(name); assert.equal(typeof handler, 'function');
    if (typeof handler !== 'function') throw new Error('Listener ausente');
    Reflect.apply(handler, undefined, [event]);
  };
  return { register,
    fetch: (event: { request: Pick<Request, 'method' | 'mode' | 'url'>; respondWith(response: Promise<Response>): void }) => invoke('fetch', event),
    activate: (event: { waitUntil(work: Promise<unknown>): void }) => invoke('activate', event),
  };
}

// Fixtures de persistencia incompletos y clientes interceptados: conservar el
// resto de los argumentos reales, sin convertir el doble en PrismaClient.
type AfterDb<F> = F extends (db: never, ...args: infer A) => unknown ? A : never;
export function withFixtureDb<F extends (...args: never[]) => unknown>(fn: F, db: object, ...args: AfterDb<F>): ReturnType<F> {
  const result: unknown = Reflect.apply(fn, undefined, [db, ...args]);
  return result as ReturnType<F>;
}
export type CalendarDataFixture = { [K in keyof import('../../src/lib/calendar/types').CalendarData]: NonNullable<import('./financial-fixtures').Sparse<import('../../src/lib/calendar/types').CalendarData[K]>> };

export function routeHandlers(value: unknown): Record<string, Handler> {
  return Object.fromEntries(Object.entries(record(value)).filter(([name]) => httpMethods.has(name)).map(([name, handler]) => {
    assert.equal(typeof handler, 'function');
    if (typeof handler !== 'function') throw new Error('Handler inválido');
    return [name, async (request: TestRequest) => {
      const result = record(await Reflect.apply(handler, undefined, [request]));
      assert.equal(typeof result.status, 'number');
      if (typeof result.status !== 'number') throw new Error('Respuesta HTTP inválida');
      return { ...result, body: record(result.body), status: result.status, headers: result.headers instanceof Headers ? result.headers : undefined };
    }] as const;
  }));
}
export async function readFixtureJson(reply: unknown): Promise<unknown> {
  const response = record(reply); assert.equal(typeof response.json, 'function');
  if (typeof response.json !== 'function') throw new Error('Transporte sin JSON');
  const body: unknown = await Reflect.apply(response.json, reply, []); return body;
}

// El trabajador se prueba con su estado mínimo y resultados parciales de sync;
// se mantienen callbacks, reloj y wait derivados de la implementación real.
type Worker = typeof import('../../src/lib/calendar/worker').runCalendarSync;
type WorkerOptions = NonNullable<Parameters<Worker>[1]>;
type WorkerFixtureOptions = Omit<WorkerOptions, 'db' | 'sync'> & {
  db: { googleCalendarConnection: { findUnique(): Promise<import('./financial-fixtures').Sparse<import('@prisma/client').GoogleCalendarConnection>> } };
  sync: (userId: string, options?: Parameters<typeof import('../../src/lib/calendar/sync').syncGoogleCalendar>[1]) => Promise<import('./financial-fixtures').Sparse<import('../../src/lib/calendar/types').CalendarSyncResult>>;
};
export function fixtureWorker(worker: Worker) {
  return (userId: string, options: WorkerFixtureOptions): ReturnType<Worker> => {
    const result: unknown = Reflect.apply(worker, undefined, [userId, options]);
    return result as ReturnType<Worker>;
  };
}
export function transactionFixture(tx: import('@prisma/client').Prisma.TransactionClient) {
  return { $transaction: <T>(run: (transaction: typeof tx) => Promise<T>) => run(tx) };
}
export function rawHandlers(value: unknown): Record<string, (request: TestRequest) => Promise<unknown>> {
  return Object.fromEntries(Object.entries(record(value)).map(([method, handler]) => {
    assert.equal(typeof handler, 'function');
    if (typeof handler !== 'function') throw new Error('Handler inválido');
    return [method, async (request: TestRequest): Promise<unknown> => Reflect.apply(handler, undefined, [request])] as const;
  }));
}

export function noticeSample(value: unknown): NoticeSample['event'] {
  assert.ok(isNotice(value));
  return value;
}
function isNotice(value: unknown): value is NoticeSample['event'] {
  if (!value || typeof value !== 'object' || !('sourcePackage' in value) || typeof value.sourcePackage !== 'string'
    || !('postedAt' in value) || typeof value.postedAt !== 'string' || !('receivedAt' in value) || typeof value.receivedAt !== 'string'
    || !('fields' in value) || !value.fields || typeof value.fields !== 'object' || Array.isArray(value.fields)) return false;
  return Object.values(record(value.fields)).every(field => typeof field === 'string');
}

export type CaptureConfigurationResult = Awaited<ReturnType<SourceModules['src/lib/captureConfiguration.ts']['configureCapture']>>;
