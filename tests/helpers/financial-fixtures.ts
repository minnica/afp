import type { Prisma } from '@prisma/client';
import assert from 'node:assert/strict';

// Los escenarios históricos pasan proyecciones parciales a cálculos internos.
// Esta frontera conserva exactamente las claves omitidas: no completa fixtures
// ni afirma que sean modelos Prisma íntegros. Los tipos escalares y resultados
// se derivan de la función real; el cast del retorno solo salva Reflect.apply.
export type Sparse<T> = T extends (...args: never[]) => unknown ? T : T extends Prisma.Decimal ? Prisma.Decimal | string | number : T extends Date ? Date | string
  : T extends readonly (infer Item)[] ? Sparse<Item>[]
  : T extends object ? { [K in keyof T]?: Sparse<T[K]> } : T;
type SparseArgs<A extends unknown[]> = { [K in keyof A]: Sparse<A[K]> };

type Jsonified<T> = T extends { toJSON(): infer J } ? J : T extends readonly (infer I)[] ? Jsonified<I>[] : T extends object ? { [K in keyof T]: Jsonified<T[K]> } : T;
export function plain<T>(value: T): Jsonified<T> {
  const result: unknown = JSON.parse(JSON.stringify(value));
  return result as Jsonified<T>;
}
export function present<T>(value: T | null | undefined): T {
  assert.ok(value !== null && value !== undefined);
  return value;
}

import { record } from './dynamic-values';
import { sourceLoader } from './load-source';
import type { SourceGlobals, SourceModules } from './source-contracts';
export interface TestReply { body: Record<string, unknown>; status: number; headers: Headers }
export type TestRequest = Partial<Pick<Request, 'url' | 'json' | 'method'>> & { headers?: { get(name: string): string | null | undefined } };
export type TestHandler = (request: TestRequest) => Promise<TestReply>;
type AdaptedModule<P extends keyof SourceModules> = P extends `src/app/api/${string}`
  ? { [K in keyof SourceModules[P]]: TestHandler } : SourceModules[P];
export function testReply(body: unknown, init: ResponseInit = {}): TestReply {
  return { body: record(plain(body)), status: init.status || 200, headers: new Headers(init.headers) };
}
// Los handlers históricos reciben solo la parte de Request que consultan. El
// adaptador comprueba la respuesta del doble sin hacerla pasar por NextResponse.
// Los exports de librerías conservan los tipos reales del cargador principal.
export function financialLoader(mocks: Record<string, unknown> = {}, globals: SourceGlobals = {}) {
  const load = sourceLoader(mocks, globals);
  function financialLoad<P extends keyof SourceModules>(file: P): AdaptedModule<P>;
  function financialLoad(file: string): unknown;
  function financialLoad(file: string): unknown {
    const value = load(file);
    if (!file.startsWith('src/app/api/') || !file.endsWith('.ts')) return value;
    return Object.fromEntries(Object.entries(record(value)).map(([method, fn]) => [method, testHandler(fn)]));
  }
  return financialLoad;
}

export function dynamicRoute(value: unknown) {
  const exports = record(value);
  return { GET: (request: TestRequest) => testHandler(exports.GET)(request), POST: (request: TestRequest) => testHandler(exports.POST)(request), PATCH: (request: TestRequest) => testHandler(exports.PATCH)(request), DELETE: (request: TestRequest) => testHandler(exports.DELETE)(request) };
}

// Solo cálculos puros: el programa de tipos sigue comprobando escalares, enums
// y resultados reales. Nunca se usa para convertir persistencia en PrismaClient.
type Persistence = import('@prisma/client').PrismaClient | Prisma.TransactionClient;
export type SparseModule<M> = { [K in keyof M]: M[K] extends (...args: infer A) => infer R
  ? Extract<A[number], Persistence> extends never ? <Args extends SparseArgs<A>>(...args: Args) => R : M[K]
  : M[K] };
export function sparseCalculations<M extends object>(module: M): SparseModule<M> {
  return module as SparseModule<M>;
}

export function stringValue(value: unknown): string {
  assert.equal(typeof value, 'string');
  if (typeof value !== 'string') throw new Error('Se esperaba texto');
  return value;
}
export function numberValue(value: unknown): number {
  assert.equal(typeof value, 'number');
  if (typeof value !== 'number') throw new Error('Se esperaba número');
  return value;
}
export type TestMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';
export function testHandler(value: unknown): TestHandler {
  assert.equal(typeof value, 'function');
  if (typeof value !== 'function') throw new Error('Se esperaba un handler');
  return async request => {
    const response = record(await Reflect.apply(value, undefined, [request]));
    assert.equal(typeof response.status, 'number');
    if (typeof response.status !== 'number') throw new Error('Estado HTTP inválido');
    return { body: record(response.body), status: response.status, headers: response.headers instanceof Headers ? response.headers : new Headers() };
  };
}
export function fixedDate(now: Date) {
  return class extends Date {
    constructor(...args: unknown[]) {
      super();
      const value: unknown = Reflect.construct(Date, args.length ? args : [now], new.target);
      assert.ok(value instanceof Date);
      return value;
    }
  };
}

import { z } from 'zod';
import { moneyResponseSchema } from '../../src/lib/money/responses';
type MoneyReplyBody = z.output<typeof moneyResponseSchema>;
function isMoneyBody(value: unknown): value is MoneyReplyBody { return moneyResponseSchema.safeParse(value).success; }
export function moneyBody(value: unknown): MoneyReplyBody { assert.ok(isMoneyBody(value)); return value; }
export type MoneyFixtureData = Sparse<import('../../src/lib/money/types').CalculationData> & { [K in 'accounts' | 'routes' | 'plans' | 'transfers' | 'cards' | 'cycles' | 'incomes' | 'expenses' | 'subscriptions' | 'purchases' | 'receivables' | 'payables']: NonNullable<Sparse<import('../../src/lib/money/types').CalculationData>[K]> };
type UnionKeys<T> = T extends unknown ? keyof T : never;
export function branch<T, K extends UnionKeys<T>>(value: T, key: K): Extract<T, Record<K, unknown>> {
  assert.ok(key in record(value));
  return value as Extract<T, Record<K, unknown>>;
}

// Inyección acotada de datos deliberadamente inválidos o proyecciones mínimas
// en funciones internas estrictas. Nunca valida/normaliza la entrada antes de
// ejecutar la operación probada; el retorno sigue derivado de esa función.
export function uncheckedFixture<F extends (...args: never[]) => unknown>(fn: F, ...args: unknown[]): ReturnType<F> {
  const result: unknown = Reflect.apply(fn, undefined, args);
  return result as ReturnType<F>;
}

const jsonSchema = z.json();
function isJsonValue(value: unknown): value is Prisma.JsonValue { return jsonSchema.safeParse(value).success; }
export function jsonValue(value: unknown): Prisma.JsonValue { assert.ok(isJsonValue(value)); return value; }

export function dateValue(value: unknown): Date {
  assert.ok(value instanceof Date);
  return value;
}
