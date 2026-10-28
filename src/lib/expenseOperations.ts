import type { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { isRecord } from './financialJson';
import { createHash } from "node:crypto";
import { ApiAccessError } from "@/lib/apiAuth";

// El orden de las propiedades y la identidad enviada por el cliente no alteran el recibo.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && isRecord(value)) {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

export async function runExpenseOperation(db: PrismaClient, userId: string, body: unknown, create: (tx: Prisma.TransactionClient) => Promise<unknown>) {
  if (!isRecord(body)) {
    throw new ApiAccessError("Datos no válidos.", 400);
  }
  const { operationId, userId: ignoredUserId, ...input } = body;
  void ignoredUserId;
  // Compatibilidad con otros clientes; /gastos siempre envía UUID desde la captura.
  if (operationId === undefined) return db.$transaction(create, { isolationLevel: "ReadCommitted" });
  if (typeof operationId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operationId)) {
    throw new ApiAccessError("Identificador de operación no válido.", 400);
  }
  const requestHash = createHash("sha256").update(JSON.stringify(canonical(input))).digest("hex");
  const key = { userId, operationId: operationId.toLowerCase() };
  return db.$transaction(async tx => {
    // La clave única arbitra dos peticiones incluso en servidores distintos.
    // ON CONFLICT espera al commit/rollback de la primera antes de continuar.
    await tx.expenseOperation.createMany({
      data: { ...key, requestHash, response: {} }, skipDuplicates: true,
    });
    const receipt = await tx.expenseOperation.findUnique({ where: { userId_operationId: key } });
    if (!receipt) throw new Error("No se encontró el recibo de la operación.");
    if (receipt.requestHash !== requestHash) {
      throw new ApiAccessError("Esta operación ya corresponde a otro gasto. Conserva el pendiente para revisarlo.", 409);
    }
    if (isRecord(receipt.response) && receipt.response.expense) return receipt.response;
    const response = await create(tx);
    // Serializa Decimal y Date igual que la respuesta HTTP original.
    const serialized = z.record(z.string(), z.json()).parse(JSON.parse(JSON.stringify(response)));
    await tx.expenseOperation.update({ where: { userId_operationId: key }, data: { response: serialized } });
    return serialized;
  }, { isolationLevel: "ReadCommitted" });
}
