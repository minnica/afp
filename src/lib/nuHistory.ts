import type { PrismaClient, InstallmentPurchase } from '@prisma/client';
import { buildCurrentCardUsageWaivers } from './calculations/cardUsageWaivers';
import { getUsageExclusion, usageExclusionPattern, nuNonPurchasePattern } from './calculations/cardUsageWaivers';
import { isRecord } from './financialJson';
import { todayInMexico } from './financialDates';

// Búsqueda por lotes: conserva la última compra válida aunque sea anterior a la
// ventana. Una comisión/captura pendiente nunca desplaza esa referencia.
export async function nuHistoryReferences(db: PrismaClient, userId: string, cards: { id: string; name: string; usagePolicy: unknown }[], now: Date) {
  const expenseIds: string[] = [], purchaseIds: string[] = [], cycleIds: string[] = [];
  for (const card of cards.filter(card => isRecord(card.usagePolicy) && card.usagePolicy.productKey === 'NU')) {
    const end = new Date(`${todayInMexico(now)}T23:59:59.999Z`);
    let before: { date: Date; id: string } | null = null;
    for (;;) {
      const rows: { id: string; concept: string; notes: string | null; date: Date }[] = await db.dailyExpense.findMany({ where: { userId, cardId: card.id, paymentMethod: 'CARD', amount: { gt: 0 },
        reconciliationStatus: { not: 'PENDING' }, date: { lte: end },
        ...(before ? { OR: [{ date: { lt: before.date } }, { date: before.date, id: { lt: before.id } }] } : {}),
      }, select: { id: true, concept: true, notes: true, date: true }, orderBy: [{ date: 'desc' }, { id: 'desc' }], take: 100 });
      let found = false;
      for (const row of rows) {
        if (getUsageExclusion(row) || nuNonPurchasePattern.test(row.concept.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim())) continue;
        const exclusions = await db.cardCycle.findMany({ where: { userId, cardId: card.id,
          usageReconciliation: { path: ['excludedExpenseIds'], array_contains: [row.id] } },
          select: { id: true, year: true, month: true, startDate: true, cutDate: true, dueDate: true, cardId: true, usageReconciliation: true } });
        // La misma validación de evidencia y clasificación que usa la vista.
        const [usage] = buildCurrentCardUsageWaivers({ cards: [card], cyclesWithAmounts: exclusions,
          expenses: [{ ...row, cardId: card.id, paymentMethod: 'CARD', amount: 1 }], subscriptions: [], purchases: [], now });
        cycleIds.push(...exclusions.map(cycle => cycle.id));
        if (usage && 'lastPurchase' in usage && usage.lastPurchase) { expenseIds.push(row.id); found = true; break; }
      }
      if (found || rows.length < 100) break;
      before = rows.at(-1)!;
    }
    // Las MSI cuentan por su compra, aunque ya estén liquidadas. Solo hace falta
    // el último candidato que cumpla las reglas de Turbo.
    let purchaseBefore: { purchaseDate: Date; id: string } | null = null;
    for (;;) {
      const rows: InstallmentPurchase[] = await db.installmentPurchase.findMany({ where: { userId, cardId: card.id, status: { not: 'CANCELLED' },
        reconciliationStatus: { not: 'PENDING' }, totalAmount: { gt: 0 }, purchaseDate: { lte: end },
        ...(purchaseBefore ? { OR: [{ purchaseDate: { lt: purchaseBefore.purchaseDate } }, { purchaseDate: purchaseBefore.purchaseDate, id: { lt: purchaseBefore.id } }] } : {}),
      }, orderBy: [{ purchaseDate: 'desc' }, { id: 'desc' }], take: 100 });
      const row = rows.find(purchase => {
        const [usage] = buildCurrentCardUsageWaivers({ cards: [card], cyclesWithAmounts: [], expenses: [], subscriptions: [], purchases: [purchase], now });
        return usage && 'lastPurchase' in usage && usage.lastPurchase;
      });
      if (row) { purchaseIds.push(row.id); break; }
      if (rows.length < 100) break;
      purchaseBefore = rows.at(-1)!;
    }
    // El JSON histórico también puede ser el último comprobante válido. La
    // consulta devuelve un solo corte por recibo más reciente, sin traer el JSON
    // de todos los estados a Node.
    const receipts = await db.$queryRaw<{ id: string }[]>`
      WITH receipts AS (
        SELECT c.id, r->>'date' AS day FROM card_cycles c CROSS JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(c."usageReconciliation"->'subscriptionCharges') = 'array' THEN c."usageReconciliation"->'subscriptionCharges' ELSE '[]'::jsonb END) r
        LEFT JOIN subscriptions s ON s.id = r->>'subscriptionId' AND s."userId" = ${userId}
        WHERE c."userId" = ${userId} AND c."cardId" = ${card.id}
          AND jsonb_typeof(c."usageReconciliation"->'version') = 'number' AND c."usageReconciliation"->>'version' = '1' AND c."usageReconciliation"->>'sourceSha256' ~ '^[a-f0-9]{64}$'
          AND jsonb_typeof(c."usageReconciliation"->'source') = 'string' AND length(trim(c."usageReconciliation"->>'source')) > 0
          AND jsonb_typeof(c."usageReconciliation"->'sourceSha256') = 'string'
          AND pg_input_is_valid(c."usageReconciliation"->>'startDate', 'date')
          AND pg_input_is_valid(c."usageReconciliation"->>'cutDate', 'date')
          AND pg_input_is_valid(r->>'date', 'date')
          AND c."usageReconciliation"->>'startDate' ~ '^\\d{4}-\\d{2}-\\d{2}$'
          AND c."usageReconciliation"->>'cutDate' ~ '^\\d{4}-\\d{2}-\\d{2}$'
          AND substring(c."usageReconciliation"->>'cutDate', 1, 4) = c.year::text
          AND substring(c."usageReconciliation"->>'cutDate', 6, 2) = lpad(c.month::text, 2, '0')
          AND r->>'date' >= c."usageReconciliation"->>'startDate' AND r->>'date' <= c."usageReconciliation"->>'cutDate'
          AND r->>'date' ~ '^\\d{4}-\\d{2}-\\d{2}$' AND r->>'date' <= ${todayInMexico(now)}
          AND (CASE WHEN pg_input_is_valid(r->>'amount', 'numeric') AND lower(r->>'amount') NOT IN ('infinity', '-infinity', 'nan') THEN (r->>'amount')::numeric ELSE 0 END) > 0
          AND length(trim(r->>'subscriptionId')) > 0
          AND upper(translate(trim(coalesce(nullif(r->>'name', ''), s.name, 'Suscripción')), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) !~ ${usageExclusionPattern.source.replaceAll('\\b', '\\y')}
          AND upper(translate(trim(coalesce(nullif(r->>'name', ''), s.name, 'Suscripción')), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) !~ ${nuNonPurchasePattern.source.replaceAll('\\b', '\\y')}
          AND NOT EXISTS (SELECT 1 FROM daily_expenses e WHERE e."userId" = ${userId} AND e."cardId" = ${card.id}
            AND e."paymentMethod" = 'CARD' AND e."subscriptionId" = r->>'subscriptionId' AND to_char(e.date, 'YYYY-MM') = substring(r->>'date', 1, 7))
      ) SELECT DISTINCT id FROM receipts WHERE day >= ${new Date(end.getTime() - 30 * 86400000).toISOString().slice(0, 10)}
        OR day = (SELECT max(day) FROM receipts)`;
    cycleIds.push(...receipts.map(row => row.id));
    const recentExclusions = await db.$queryRaw<{ id: string }[]>`
      SELECT DISTINCT c.id FROM card_cycles c CROSS JOIN LATERAL jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(c."usageReconciliation"->'excludedExpenseIds') = 'array' THEN c."usageReconciliation"->'excludedExpenseIds' ELSE '[]'::jsonb END) x(id)
      JOIN daily_expenses e ON e.id = x.id AND e."userId" = ${userId} AND e."cardId" = ${card.id}
      WHERE c."userId" = ${userId} AND c."cardId" = ${card.id} AND e.date >= ${new Date(end.getTime() - 31 * 86400000)}`;
    cycleIds.push(...recentExclusions.map(row => row.id));
  }
  return { expenseIds, purchaseIds, cycleIds };
}
