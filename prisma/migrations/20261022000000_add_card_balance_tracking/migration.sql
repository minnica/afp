-- Aditiva. Conserva límite, saldo y fecha bancarios. La exposición inicial se
-- guarda para aplicar únicamente diferencias posteriores, sin repetir cargos.
BEGIN;
ALTER TABLE "cards" ADD COLUMN "balanceTracking" JSONB;

WITH snapshot_day AS (
  SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Mexico_City')::date AS day
), exposures AS (
  SELECT c.id, d.day,
    COALESCE((SELECT SUM(ROUND(e.amount, 2) * 100) FROM daily_expenses e
      WHERE e."userId" = c."userId" AND e."cardId" = c.id AND e."paymentMethod" = 'CARD'
        AND e.date::date BETWEEN d.day AND d.day), 0)
    + COALESCE((SELECT SUM(ROUND(p."totalAmount", 2) * 100) FROM installment_purchases p
      WHERE p."userId" = c."userId" AND p."cardId" = c.id AND p.status <> 'CANCELLED'
        AND p."purchaseDate"::date BETWEEN d.day AND d.day), 0)
    - COALESCE((SELECT SUM(ROUND(cy."paidAmount", 2) * 100) FROM card_cycles cy
      WHERE cy."userId" = c."userId" AND cy."cardId" = c.id AND (cy."paidAt" IS NULL OR cy."paidAt"::date <= d.day)), 0)
    - COALESCE((SELECT SUM(ROUND(cy."postCutCreditAmount", 2) * 100) FROM card_cycles cy
      WHERE cy."userId" = c."userId" AND cy."cardId" = c.id AND (cy."postCutCreditDate" IS NULL OR cy."postCutCreditDate"::date <= d.day)), 0)
    - COALESCE((SELECT SUM(ROUND(cr.amount, 2) * 100) FROM card_cycle_credits cr
      JOIN card_cycles cy ON cy.id = cr."cycleId" JOIN incomes i ON i.id = cr."incomeId"
      WHERE cr."userId" = c."userId" AND cy."userId" = c."userId" AND cy."cardId" = c.id AND i.date::date <= d.day), 0) AS cents
  FROM cards c CROSS JOIN snapshot_day d
  WHERE c."creditLimit" IS NOT NULL AND c."usedBalance" IS NOT NULL AND c."balanceAsOf" IS NOT NULL
)
UPDATE cards c SET "balanceTracking" = jsonb_build_object(
  'version', 1, 'day', e.day::text,
  'captureId', gen_random_uuid()::text,
  'startedAt', to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'baseExposureCents', TRUNC(e.cents)::text
) FROM exposures e WHERE e.id = c.id;

ALTER TABLE cards ADD CONSTRAINT cards_balance_tracking_check CHECK (
  "balanceTracking" IS NULL OR (
    "creditLimit" IS NOT NULL AND "usedBalance" IS NOT NULL AND "balanceAsOf" IS NOT NULL
    AND jsonb_typeof("balanceTracking") = 'object'
    AND "balanceTracking" ?& ARRAY['version', 'day', 'startedAt', 'baseExposureCents', 'captureId']
    AND "balanceTracking"->>'version' = '1'
    AND "balanceTracking"->>'day' ~ '^\d{4}-\d{2}-\d{2}$'
    AND "balanceTracking"->>'baseExposureCents' ~ '^-?\d+$'
  )
);
COMMIT;
