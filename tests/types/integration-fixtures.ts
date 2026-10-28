import type { Prisma,PrismaClient } from '@prisma/client';
import type { CaptureEventV1 } from '../../src/lib/captureTypes';
import { sparseCalculations } from '../helpers/financial-fixtures';
import { integrationLoader,serviceWorkerListeners,transactionFixture,withFixtureDb } from '../helpers/integration-fixtures';

declare const db: PrismaClient;
declare const tx: Prisma.TransactionClient;
declare const event: CaptureEventV1;
const load = integrationLoader();
const duration: typeof import('../../src/app/api/cron/capture-bank-fallback/route').maxDuration = load('src/app/api/cron/capture-bank-fallback/route.ts').maxDuration;
void duration;
const service = load('src/lib/captureService.ts');
const credential = { id: 'device', secretHash: 'hash' };
void service.receiveCaptureEvent(db, credential, event);

// @ts-expect-error El protocolo nativo continúa limitado a la versión uno.
void service.receiveCaptureEvent(db, credential, { ...event, contractVersion: 2 });
// @ts-expect-error Los exports proceden del módulo real, sin métodos inventados.
void service.receiveUnknownCapture;
// @ts-expect-error El secreto requiere texto incluso con persistencia simulada.
void withFixtureDb(service.receiveCaptureEvent, transactionFixture(tx), { id: 'd', secretHash: 12 }, event);
// @ts-expect-error El contenedor transaccional mínimo no es un PrismaClient.
const fullClient: PrismaClient = transactionFixture(tx);
void fullClient;

const dynamic = load(['src/lib', 'captureService.ts'].join('/'));
// @ts-expect-error Una ruta dinámica exige comprobar sus exports antes de usarlos.
void dynamic.receiveCaptureEvent;

integrationLoader({ '@/lib/captureParsers': {
  // @ts-expect-error Las propuestas del parser conservan importes de texto.
  interpretCapture: () => ({ reason: 'PURCHASE', proposal: { amount: 12 } }),
} });
integrationLoader({ '@supabase/supabase-js': { createClient: () => ({ auth: {
  // @ts-expect-error El doble de Auth recibe el token de texto de requireApiUser.
  getUser: async (token: number) => ({ data: { user: { id: String(token) } } }),
} }) } });
integrationLoader({}, {
  // @ts-expect-error El transporte de prueba recibe una URL de texto.
  fetch: async (_url: number) => { void _url; return new Response(); },
});

const listeners = serviceWorkerListeners();
listeners.fetch({ request: {
  // @ts-expect-error El evento usa los modos reales de Request.
  method: 'GET', mode: 'unknown-mode', url: 'http://localhost',
}, respondWith() {} });
// @ts-expect-error waitUntil requiere una promesa, incluso en el contexto vm.
listeners.activate({ waitUntil: (_work: number) => { void _work; } });

const calculations = sparseCalculations({ run: (options: { callback: (value: number) => string }) => options.callback(1) });
calculations.run({ callback: String });
// @ts-expect-error Las proyecciones parciales conservan las firmas de callbacks.
calculations.run({ callback: (value: string) => value });
