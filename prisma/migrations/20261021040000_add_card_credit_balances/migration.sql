-- Captura opcional del saldo bancario. No infiere saldos para tarjetas existentes.
ALTER TABLE "cards"
  ADD COLUMN "creditLimit" DECIMAL(12,2),
  ADD COLUMN "usedBalance" DECIMAL(12,2),
  ADD COLUMN "balanceAsOf" DATE;

ALTER TABLE "cards" ADD CONSTRAINT "cards_credit_balance_complete_check" CHECK (
  ("creditLimit" IS NULL AND "usedBalance" IS NULL AND "balanceAsOf" IS NULL)
  OR ("creditLimit" IS NOT NULL AND "creditLimit" BETWEEN 0 AND 9999999999.99
      AND "usedBalance" IS NOT NULL AND "usedBalance" BETWEEN -9999999999.99 AND 9999999999.99
      AND "balanceAsOf" IS NOT NULL)
);
