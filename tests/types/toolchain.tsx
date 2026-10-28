// Contratos de infraestructura: no declaran migrado ningún flujo financiero.
import type { Prisma } from '@prisma/client';
import type { ReactElement } from 'react';
import { z } from 'zod';

export const amountSchema = z.string().transform(value => Number(value));
export const input: z.input<typeof amountSchema> = '12.50';
export const output: z.output<typeof amountSchema> = 12.5;
// @ts-expect-error La entrada de una transformación sigue siendo texto.
export const invalidInput: z.input<typeof amountSchema> = 12.5;
// @ts-expect-error La salida validada debe ser un número.
export const invalidOutput: z.output<typeof amountSchema> = '12.50';

type SelectedUser = Prisma.UserGetPayload<{ select: { id: true } }>;
export const selected: SelectedUser = { id: 'fictitious' };
// @ts-expect-error Una consulta con select no devuelve campos sin seleccionar.
export const missingSelection = selected satisfies { id: string; email: string };
// @ts-expect-error El resultado de Prisma conserva los campos obligatorios.
export const missingId: SelectedUser = {};

export function Label({ value }: { value: string }): ReactElement {
  return <span>{value}</span>;
}
export const label = <Label value="Prueba" />;
// @ts-expect-error Las props de TSX conservan su tipo en la configuración heredada.
export const invalidLabel = <Label value={12} />;
const rows: string[] = [];
// @ts-expect-error noUncheckedIndexedAccess obliga a comprobar índices ausentes.
export const uncheckedRow: string = rows[0];
// @ts-expect-error strictNullChecks rechaza nulos donde se exige texto.
export const nullText: string = null;
