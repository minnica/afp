-- Aditiva: conserva los cargos existentes y comienza sin aportaciones registradas.
ALTER TABLE "daily_expenses" ADD COLUMN "cashContributionAmount" DECIMAL(65,30) NOT NULL DEFAULT 0;

ALTER TABLE "daily_expenses" ADD CONSTRAINT "daily_expenses_cash_contribution_check"
CHECK (
  "cashContributionAmount" >= 0
  AND "cashContributionAmount" = ROUND("cashContributionAmount", 2)
  AND ("cashContributionAmount" = 0 OR "cashContributionAmount" <= "amount")
);
