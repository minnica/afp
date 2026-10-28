import { sourceLoader, resolveSource, transformSource, checkSourceExports } from '../helpers/load-source';
import { buildBrowserModule } from '../helpers/browser-module';
import type { TransferCommand } from '../../src/lib/money/transferContracts';

const load = sourceLoader();
const client = load('src/lib/money/transferClient.ts');
const command: TransferCommand = { action: 'TRANSFER', operationId: '00000000-0000-4000-8000-000000000001', fromAccountId: 'a', toAccountId: 'b', amount: '12.50', date: '2026-10-28', concept: 'Prueba' };
const result: Promise<{ ok: true; id: string }> = client.sendTransfer(command, { expectedUserId: 'owner' });
void result;

// @ts-expect-error La función real exige cuenta esperada en las opciones.
client.sendTransfer(command, {});
// @ts-expect-error No existe este export en el módulo de producción.
export type MissingPublicExport = typeof client.missingExport;
// @ts-expect-error El importe real admite texto o número, nunca booleanos.
client.sendTransfer({ ...command, amount: true }, { expectedUserId: 'owner' });
// @ts-expect-error Una respuesta de transferencia es una promesa, no un número.
const wrongResult: number = client.sendTransfer(command, { expectedUserId: 'owner' });
void wrongResult;
const reversed = client.sendTransfer({ action: 'REVERSE_TRANSFER', operationId: command.operationId, id: 'saved' }, { expectedUserId: 'owner' });
void reversed;
// @ts-expect-error La reversión tiene otro resultado y no devuelve un ID nuevo.
export type ReversedId = Awaited<typeof reversed>['id'];

declare const dynamicPath: string;
const dynamic = load(dynamicPath);
void dynamic;
// @ts-expect-error Una ruta dinámica no permite usar exports sin validarlos.
export type DynamicExport = typeof dynamic.sendTransfer;
// @ts-expect-error El parámetro genérico identifica una ruta, no un contrato inventado.
load<{ invented: () => number }>(dynamicPath);
// @ts-expect-error Una ruta dinámica tampoco acepta escoger un contrato registrado.
load<'src/lib/money/transferClient.ts'>(dynamicPath);
const privateExports = load('src/app/api/money/route.ts', ['failure']);
void privateExports;
// @ts-expect-error Los exports privados no adquieren el contrato público de la ruta.
export type PrivateExport = typeof privateExports.failure;
// @ts-expect-error Los handlers conservan Request como entrada real.
load('src/app/api/money/route.ts').POST({ json: async () => command });
// @ts-expect-error Los exports conocidos no aceptan argumentos incompatibles.
load('src/lib/money/dates.ts').addDays('2026-10-28', 'mañana');
// @ts-expect-error El mock HTTP debe devolver una Response real.
sourceLoader({}, { fetch: async () => ({ ok: true }) });
// @ts-expect-error El mock de Auth debe conservar el ID de usuario textual.
sourceLoader({ '@/lib/supabase': { supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: 7 }, access_token: 'fake' } } }) } } } });
// @ts-expect-error Un doble de NextResponse no es un objeto con body inventado.
sourceLoader({ 'next/server': { NextResponse: { json: () => ({ body: {}, status: 200 }) } } });
// @ts-expect-error Los globals de entorno solo admiten valores textuales.
sourceLoader({}, { process: { env: { TOKEN: 1 } } });
// @ts-expect-error La resolución requiere una ruta textual.
resolveSource(123);
// @ts-expect-error La transformación restringe los formatos de esbuild.
transformSource('', 'fixture.ts', 'invalid-format');
// @ts-expect-error Los mocks del navegador son fuentes JavaScript textuales.
buildBrowserModule(dynamicPath, { module: false });
// @ts-expect-error El generador entrega código textual, no un módulo tipado.
const browser: Promise<{ run: () => void }> = buildBrowserModule(dynamicPath);
void browser;
// @ts-expect-error Solo pueden comprobarse contratos registrados de rutas reales.
checkSourceExports('src/invented.ts', {});
