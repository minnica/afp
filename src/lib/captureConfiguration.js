import { z } from "zod";
import { ApiAccessError, requireOwnedReferences } from "@/lib/apiAuth";
import { capturePackages } from "@/lib/captureProtocol";
import { captureParsers, normalizeMerchant } from "@/lib/captureParsers";
import { lockDebtAccounts } from "@/lib/debtAccountService";
import { buildCaptureRollout, captureRolloutMovements, captureFormatReadiness, captureActivationReasons } from "@/lib/captureRollout";

const bankPackages = capturePackages.filter(value => value !== "com.google.android.apps.walletnfcrel");
const lastFour = z.string().regex(/^\d{4}$/);
export const captureInventorySchema = z.object({ version: z.literal(1), cards: z.array(z.object({
  name: z.string().min(1).max(100), bankPackage: z.enum(bankPackages), physical: z.array(lastFour).max(20),
  digital: z.array(lastFour).max(20), wallet: z.array(lastFour).max(20), verified: z.boolean(), evidence: z.string().max(500),
}).strict()).max(100) }).strict();

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("alias"), cardId: z.string().min(1), sourcePackage: z.enum(capturePackages), kind: z.enum(["PHYSICAL", "DIGITAL", "WALLET"]), value: lastFour, verified: z.boolean(), evidence: z.string().trim().max(500) }).strict(),
  z.object({ action: z.literal("deleteAlias"), id: z.uuid() }).strict(),
  z.object({ action: z.literal("deleteRule"), id: z.uuid() }).strict(),
  z.object({ action: z.literal("importAliases"), inventory: captureInventorySchema }).strict(),
  z.object({ action: z.literal("automation"), cardId: z.string().min(1), parserKey: z.string(), mode: z.enum(["OBSERVATION", "AUTOMATIC"]),
    datePolicy: z.enum(["BANK_OPERATION", "NOTIFICATION_POSTED_AT"]).optional() }).strict(),
  z.object({ action: z.literal("rule"), cardId: z.string().min(1), merchant: z.string().trim().min(1).max(200), categoryId: z.string().min(1), subscriptionId: z.string().nullable().optional() }).strict(),
]);

export async function configureCapture(db, userId, input) {
  const parsed = actionSchema.safeParse(input);
  if (!parsed.success) throw new ApiAccessError("Configuración no válida. Revisa el formato de los datos.", 400);
  const data = parsed.data;
  return db.$transaction(async tx => {
    await lockDebtAccounts(tx, userId);
    if (["deleteAlias", "deleteRule"].includes(data.action)) {
      const model = data.action === "deleteAlias" ? tx.captureCardAlias : tx.captureMerchantRule;
      if (!(await model.deleteMany({ where: { id: data.id, userId } })).count) throw new ApiAccessError("Registro no encontrado.", 404);
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
        for (const [field, kind] of [["physical", "PHYSICAL"], ["digital", "DIGITAL"], ["wallet", "WALLET"]]) {
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
    if (data.action === "automation") {
      const parser = captureParsers.find(parser => parser.key === data.parserKey);
      if (!parser) {
        // Retirar un analizador nunca debe impedir detener su automatización.
        const identity = { userId, cardId: data.cardId, parserKey: data.parserKey };
        const existing = await tx.captureAutomation.findUnique({ where: { userId_cardId_parserKey: identity } });
        if (!existing || data.mode !== "OBSERVATION") throw new ApiAccessError("Formato no disponible.", 400);
        return tx.captureAutomation.update({ where: { id: existing.id }, data: { mode: "OBSERVATION" } });
      }
      if (data.mode === "AUTOMATIC") {
        if (!parser.verified) throw new ApiAccessError("Este formato aún no tiene muestras reales verificadas. Conserva observación.", 409);
        if (parser.dateSource === "NOTIFICATION_POSTED_AT" && data.datePolicy !== "NOTIFICATION_POSTED_AT") {
          throw new ApiAccessError("Confirma el uso de la fecha del aviso de Wallet en hora de México para habilitar este formato.", 409);
        }
        const aliases = await tx.captureCardAlias.findMany({ where: { userId } });
        const movements = await captureRolloutMovements(tx, userId, { cardId: data.cardId, parserKey: parser.key });
        const readiness = captureFormatReadiness(parser, data.cardId, aliases, movements);
        if (!readiness.canEnable) throw new ApiAccessError(captureActivationReasons[readiness.blockers[0]], 409);
      }
      const identity = { userId, cardId: data.cardId, parserKey: data.parserKey };
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

export async function captureConfiguration(db, userId) {
  const [cards, aliases, automations, rules, categories, subscriptions] = await Promise.all([
    db.card.findMany({ where: { userId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.captureCardAlias.findMany({ where: { userId } }), db.captureAutomation.findMany({ where: { userId } }),
    db.captureMerchantRule.findMany({ where: { userId } }),
    db.category.findMany({ where: { userId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.subscription.findMany({ where: { userId, paymentMethod: "CARD" }, select: { id: true, name: true, cardId: true }, orderBy: { name: "asc" } }),
  ]);
  const movements = await captureRolloutMovements(db, userId);
  return { cards, aliases, automations, rules, categories, subscriptions,
    rollout: buildCaptureRollout(cards, aliases, automations, captureParsers, movements),
    parsers: captureParsers.filter(parser => parser.evidence !== "REAL_OUT_OF_SCOPE").map(({ key, sourcePackage, verified, dateSource }) => ({ key, sourcePackage, verified, dateSource: dateSource || "BANK_OPERATION" })) };
}
