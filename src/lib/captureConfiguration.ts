import { incomePolicySchema, configureIncomeCapture } from './captureIncome';
import type { PrismaClient } from '@prisma/client';
import { captureInput } from '@/lib/captureJson';
import { configureMoneyCapture, moneyPolicySchema } from "@/lib/captureMoney";
import { z } from "zod";
import { ApiAccessError, requireOwnedReferences } from "@/lib/apiAuth";
import { capturePackages } from "@/lib/captureProtocol";
import { reviewOnlyCapturePackages } from "@/lib/captureSourcePolicy";
import { captureParsers, normalizeMerchant } from "@/lib/captureParsers";
import { lockDebtAccounts } from "@/lib/debtAccountService";
import { buildCaptureRollout, captureRolloutMovements, captureFormatReadiness, captureActivationReasons } from "@/lib/captureRollout";
import { matchesCapturePolicy } from "@/lib/captureFormatPolicy";

import { bankFallbackFormats, bankFallbackOptions, configureBankFallback } from "@/lib/captureBankFallback";

const cardPackages = capturePackages.filter(value => !reviewOnlyCapturePackages.includes(value) && value !== 'com.google.android.gm');
const bankPackages = cardPackages.filter(value => value !== "com.google.android.apps.walletnfcrel");
const lastFour = z.string().regex(/^\d{4}$/);
export const captureInventorySchema = z.object({ version: z.literal(1), cards: z.array(z.object({
  name: z.string().min(1).max(100), bankPackage: z.enum(bankPackages), physical: z.array(lastFour).max(20),
  digital: z.array(lastFour).max(20), wallet: z.array(lastFour).max(20), verified: z.boolean(), evidence: z.string().max(500),
}).strict()).max(100) }).strict();

export const actionSchema = z.discriminatedUnion("action", [
  moneyPolicySchema,
  incomePolicySchema,
  z.object({ action: z.literal("bankFallback"), cardId: z.string().min(1), mode: z.enum(["OBSERVATION", "AUTOMATIC"]),
    bankSourcePackage: z.enum(["com.citibanamex.banamexmobile", "com.nu.production", "mx.bancosantander.supermovil"]),
    bankDatePolicy: z.enum(["BANK_OPERATION", "NOTIFICATION_POSTED_AT"]), currency: z.literal("MXN"),
    purchasesOnly: z.literal(true), waitMinutes: z.literal(15), evidenceMovementId: z.uuid() }).strict(),
  z.object({ action: z.literal("paymentAutomation"), id: z.uuid(), mode: z.enum(["OBSERVATION", "AUTOMATIC"]) }).strict(),
  z.object({ action: z.literal("alias"), cardId: z.string().min(1), sourcePackage: z.enum(cardPackages), kind: z.enum(["PHYSICAL", "DIGITAL", "WALLET"]), value: lastFour, verified: z.boolean(), evidence: z.string().trim().max(500) }).strict(),
  z.object({ action: z.literal("deleteAlias"), id: z.uuid() }).strict(),
  z.object({ action: z.literal("deleteRule"), id: z.uuid() }).strict(),
  z.object({ action: z.literal("importAliases"), inventory: captureInventorySchema }).strict(),
  z.object({ action: z.literal("automation"), cardId: z.string().min(1), parserKey: z.string(), mode: z.enum(["OBSERVATION", "AUTOMATIC"]),
    datePolicy: z.enum(["BANK_OPERATION", "NOTIFICATION_POSTED_AT", "RECEIPT_OPERATION"]).optional() }).strict(),
  z.object({ action: z.literal("formatPolicy"), cardId: z.string().min(1), parserKey: z.enum(["nu.cfe-service-payment.es.v2", "mercadopago.card-purchase.es.v1"]),
    completionPolicy: z.enum(["NU_CFE_MXN", "MERCADOPAGO_CREDIT_MXN"]), datePolicy: z.literal("NOTIFICATION_POSTED_AT"), subscriptionId: z.string().min(1).optional() }).strict(),
  z.object({ action: z.literal("rule"), cardId: z.string().min(1), merchant: z.string().trim().min(1).max(200), categoryId: z.string().min(1), subscriptionId: z.string().nullable().optional() }).strict(),
]);

export async function configureCapture(db: PrismaClient, userId: string, rawInput: unknown) {
  const input = captureInput(rawInput);
  const parsed = actionSchema.safeParse(input);
  if (!parsed.success) throw new ApiAccessError("Configuración no válida. Revisa el formato de los datos.", 400);
  const data = parsed.data;
  return db.$transaction(async tx => {
    await lockDebtAccounts(tx, userId);
    if (data.action === "incomePolicy") return configureIncomeCapture(tx, userId, data);
    if (data.action === "moneyPolicy") return configureMoneyCapture(tx, userId, data);
    if (data.action === "paymentAutomation") {
      const policy = await tx.capturePaymentPolicy.findFirst({ where: { id: data.id, userId } });
      if (!policy) throw new ApiAccessError("Regla de pagos no encontrada.", 404);
      if (!policy.acceptedAt && data.mode === "AUTOMATIC") throw new ApiAccessError("Revisa la tarjeta, moneda y fechas de esta regla antes de activarla.", 409);
      return tx.capturePaymentPolicy.update({ where: { id: policy.id }, data: { mode: data.mode } });
    }
    if (data.action === "deleteAlias" || data.action === "deleteRule") {
      const args = { where: { id: data.id, userId } };
      const deleted = data.action === "deleteAlias" ? await tx.captureCardAlias.deleteMany(args) : await tx.captureMerchantRule.deleteMany(args);
      if (!deleted.count) throw new ApiAccessError("Registro no encontrado.", 404);
      return { deleted: true };
    }
    if (data.action === "alias") {
      await requireOwnedReferences(tx, userId, data, ["cardId"]);
      if ((data.kind === "WALLET") !== (data.sourcePackage === "com.google.android.apps.walletnfcrel")) throw new ApiAccessError("Selecciona la fuente y el tipo de terminación correspondientes.", 400);
      if (data.verified && !data.evidence) throw new ApiAccessError("Indica dónde verificaste esta terminación.", 400);
      const identity = { userId, cardId: data.cardId, sourcePackage: data.sourcePackage, kind: data.kind, value: data.value };
      const verification = { verifiedAt: data.verified ? new Date() : null, evidence: data.evidence || null };
      return tx.captureCardAlias.upsert({ where: { userId_cardId_sourcePackage_kind_value: identity }, create: { ...identity, ...verification }, update: verification });
    }
    if (data.action === "importAliases") {
      if (new Set(data.inventory.cards.map(card => card.name)).size !== data.inventory.cards.length) throw new ApiAccessError("No repitas el nombre de una tarjeta.", 400);
      let imported = 0;
      for (const card of data.inventory.cards) {
        const existing = await tx.card.findUnique({ where: { userId_name: { userId, name: card.name } } });
        if (!existing) throw new ApiAccessError("Una tarjeta no existe en tu cuenta. Conserva sus nombres exactos de AFP.", 404);
        if (card.verified && !card.evidence.trim()) throw new ApiAccessError("Indica dónde verificaste las terminaciones.", 400);
        // Importación aditiva: un archivo parcial/vacío nunca borra alias anteriores.
        for (const [field, kind] of [["physical", "PHYSICAL"], ["digital", "DIGITAL"], ["wallet", "WALLET"]] as const) {
          const sourcePackage = kind === "WALLET" ? "com.google.android.apps.walletnfcrel" : card.bankPackage;
          for (const value of new Set(card[field])) {
            const identity = { userId, cardId: existing.id, sourcePackage, kind, value };
            const verification = { verifiedAt: card.verified ? new Date() : null, evidence: card.evidence.trim() || null };
            await tx.captureCardAlias.upsert({ where: { userId_cardId_sourcePackage_kind_value: identity }, create: { ...identity, ...verification }, update: verification });
            imported++;
          }
        }
      }
      return { imported };
    }
    await requireOwnedReferences(tx, userId, data, ["cardId", "categoryId", "subscriptionId"]);
    if (data.action === "bankFallback") return configureBankFallback(tx, userId, data);
    if (data.action === "formatPolicy") {
      const parser = captureParsers.find(parser => parser.key === data.parserKey && parser.completionPolicy === data.completionPolicy);
      if (!parser) throw new ApiAccessError("Regla de formato no disponible.", 400);
      if (Boolean(parser.policyRequiresSubscription) !== Boolean(data.subscriptionId)) throw new ApiAccessError("Revisa si la regla requiere una suscripción.", 400);
      const aliases = await tx.captureCardAlias.findMany({ where: { userId, cardId: data.cardId, sourcePackage: parser.sourcePackage, verifiedAt: { not: null } } });
      if (!aliases.length) throw new ApiAccessError("Configura y verifica la fuente bancaria de esta tarjeta antes de guardar la regla.", 409);
      const existing = await tx.captureAutomation.findFirst({ where: { userId, parserKey: parser.key, completionPolicy: parser.completionPolicy } });
      const subscriptionId = data.subscriptionId || null;
      if (existing?.cardId === data.cardId && existing.policySubscriptionId === subscriptionId && matchesCapturePolicy(existing, parser)) return existing;
      // Cambiar el destinatario detiene la automatización anterior y exige un
      // piloto propio. Nunca hay dos tarjetas receptoras para este aviso sin alias.
      await tx.captureAutomation.updateMany({ where: { userId, parserKey: parser.key }, data: {
        mode: "OBSERVATION", completionPolicy: null, policyAcceptedAt: null, policySubscriptionId: null,
      } });
      const identity = { userId, cardId: data.cardId, parserKey: parser.key };
      const policy = { mode: "OBSERVATION", datePolicy: data.datePolicy, completionPolicy: data.completionPolicy,
        policyAcceptedAt: new Date(), policySubscriptionId: subscriptionId };
      return tx.captureAutomation.upsert({ where: { userId_cardId_parserKey: identity }, create: { ...identity, ...policy }, update: policy });
    }
    if (data.action === "automation") {
      const parser = captureParsers.find(parser => parser.key === data.parserKey);
      if (parser?.moneyOnly || parser?.paymentOnly || parser?.refundOnly) throw new ApiAccessError("Este formato corresponde a pagos o devoluciones. Usa su revisión específica.", 409);
      if (!parser) {
        // Retirar un analizador nunca debe impedir detener su automatización.
        const identity = { userId, cardId: data.cardId, parserKey: data.parserKey };
        const existing = await tx.captureAutomation.findUnique({ where: { userId_cardId_parserKey: identity } });
        if (!existing || data.mode !== "OBSERVATION") throw new ApiAccessError("Formato no disponible.", 400);
        return tx.captureAutomation.update({ where: { id: existing.id }, data: { mode: "OBSERVATION" } });
      }
      if (data.mode === "AUTOMATIC") {
        if (parser.dateSource === 'RECEIPT_OPERATION' && data.datePolicy !== 'RECEIPT_OPERATION') {
          throw new ApiAccessError('Confirma el uso de la fecha del viaje indicada en el recibo de Uber.', 409);
        }
        if (bankFallbackFormats.some(row => row.keys.includes(data.parserKey)) && await tx.captureBankFallback.findUnique({ where: { userId_cardId: { userId, cardId: data.cardId } } })) {
          throw new ApiAccessError("Esta tarjeta usa Wallet principal y respaldo bancario de 15 minutos. Administra su respaldo en esa sección.", 409);
        }
        if (!parser.verified) throw new ApiAccessError("Este formato aún no tiene muestras reales verificadas. Conserva observación.", 409);
        if (parser.dateSource === "NOTIFICATION_POSTED_AT" && data.datePolicy !== "NOTIFICATION_POSTED_AT") {
          throw new ApiAccessError("Confirma el uso de la fecha del aviso en hora de México para habilitar este formato.", 409);
        }
        const aliases = await tx.captureCardAlias.findMany({ where: { userId } });
        const automations = await tx.captureAutomation.findMany({ where: { userId } });
        if (parser.completionPolicy && !automations.some(policy => policy.cardId === data.cardId && matchesCapturePolicy(policy, parser))) {
          throw new ApiAccessError("Confirma la regla de este formato: tarjeta, MXN, fecha del aviso y suscripción cuando corresponda.", 409);
        }
        const movements = await captureRolloutMovements(tx, userId, { cardId: data.cardId, parserKey: parser.key });
        const readiness = captureFormatReadiness(parser, data.cardId, aliases, movements, automations);
        if (!readiness.canEnable) throw new ApiAccessError(captureActivationReasons[readiness.blockers[0]!], 409);
      }
      const identity = { userId, cardId: data.cardId, parserKey: data.parserKey };
      if (parser.completionPolicy && data.datePolicy === "BANK_OPERATION") throw new ApiAccessError("Esta regla usa la fecha del aviso aceptada. Conserva esa política o vuelve a observación.", 409);
      return tx.captureAutomation.upsert({ where: { userId_cardId_parserKey: identity },
        create: { ...identity, mode: data.mode, ...(data.datePolicy ? { datePolicy: data.datePolicy } : {}) },
        update: { mode: data.mode, ...(data.datePolicy ? { datePolicy: data.datePolicy } : {}) } });
    }
    if (data.subscriptionId) {
      const subscription = await tx.subscription.findFirst({ where: { id: data.subscriptionId, userId, cardId: data.cardId, paymentMethod: "CARD" } });
      if (!subscription) throw new ApiAccessError("La suscripción debe usar la misma tarjeta.", 409);
    }
    const identity = { userId, cardId: data.cardId, merchant: normalizeMerchant(data.merchant) };
    return tx.captureMerchantRule.upsert({ where: { userId_cardId_merchant: identity },
      create: { ...identity, categoryId: data.categoryId, subscriptionId: data.subscriptionId || null },
      update: { categoryId: data.categoryId, subscriptionId: data.subscriptionId || null } });
  }, { isolationLevel: "ReadCommitted" });
}

export async function captureConfiguration(db: PrismaClient, userId: string) {
  const [cards, aliases, automations, rules, categories, subscriptions] = await Promise.all([
    db.card.findMany({ where: { userId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.captureCardAlias.findMany({ where: { userId } }), db.captureAutomation.findMany({ where: { userId } }),
    db.captureMerchantRule.findMany({ where: { userId } }),
    db.category.findMany({ where: { userId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.subscription.findMany({ where: { userId }, select: { id: true, name: true, cardId: true, paymentMethod: true }, orderBy: { name: "asc" } }),
  ]);
  const movements = await captureRolloutMovements(db, userId);
  const paymentPolicies = await db.capturePaymentPolicy.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
  const fallbackPolicies = await db.captureBankFallback.findMany({ where: { userId } });
  const fallbackOptions = await bankFallbackOptions(db, userId);
  const moneyAccounts = await db.moneyAccount.findMany({ where: { userId }, select: { id: true, name: true, kind: true, asOf: true } });
  const moneyPolicies = await db.captureMoneyPolicy.findMany({ where: { userId } });
  const moneyWithdrawalSamples = await db.captureMovement.findMany({ where: { userId, parserKey: "bbva.atm-withdrawal.es.v1", status: "REGISTERED", moneyPosting: { is: { kind: "WITHDRAWAL" } } }, select: { id: true, proposal: true, moneyPosting: { select: { snapshot: true, withdrawal: { select: { reversedAt: true } } } } } });
  const incomePolicies = await db.captureIncomePolicy.findMany({ where: { userId } });
  const incomeTypes = await db.incomeType.findMany({ where: { userId }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
  const incomeSamples = await db.captureMovement.findMany({ where: { userId, parserKey: { in: ['bbva.payroll.es.v1', 'bbva.account-deposit.es.v1'] }, status: { not: 'DISCARDED' } }, select: { id: true, parserKey: true, proposal: true, reason: true }, orderBy: { createdAt: 'desc' }, take: 100 });
  return { incomePolicies, incomeTypes, incomeSamples, moneyWithdrawalSamples, moneyAccounts, moneyPolicies, cards, aliases, automations, rules, categories, subscriptions, paymentPolicies, fallbackPolicies, fallbackOptions,
    rollout: buildCaptureRollout(cards, aliases, automations, captureParsers, movements),
    parsers: captureParsers.filter(parser => parser.evidence !== "REAL_OUT_OF_SCOPE" && !parser.incomeOnly && !parser.moneyOnly && !parser.paymentOnly && !parser.refundOnly).map(({ key, sourcePackage, verified, dateSource }) => ({ key, sourcePackage, verified, dateSource: dateSource || "BANK_OPERATION" })) };
}

export type CaptureConfigurationInput = z.input<typeof actionSchema>;
