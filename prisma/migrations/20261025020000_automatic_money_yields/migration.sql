-- Reglas de cálculo; no modifica saldos ni crea ingresos bancarios.
ALTER TABLE money_accounts
ADD COLUMN "autoYield" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "yieldMethod" TEXT NOT NULL DEFAULT 'NOMINAL',
ADD COLUMN "yieldDailyAmount" DECIMAL(12,2),
ADD COLUMN "yieldExcessRate" DECIMAL(8,4) NOT NULL DEFAULT 0,
ADD COLUMN "yieldPayout" TEXT NOT NULL DEFAULT 'DAILY',
ADD COLUMN "yieldRounding" TEXT NOT NULL DEFAULT 'ROUND',
ADD COLUMN "yieldInitialPendingDays" INTEGER,
ADD COLUMN "yieldHistory" JSONB NOT NULL DEFAULT '[]',
ADD CONSTRAINT money_accounts_automatic_yield_check CHECK (
  "yieldMethod" IN ('NOMINAL','DAILY_AMOUNT') AND
  "yieldPayout" IN ('DAILY','MX_BUSINESS') AND
  "yieldRounding" IN ('ROUND','DOWN') AND
  "yieldExcessRate" BETWEEN 0 AND 100 AND
  ("yieldDailyAmount" IS NULL OR "yieldDailyAmount" >= 0) AND
  ("yieldInitialPendingDays" IS NULL OR "yieldInitialPendingDays" BETWEEN 0 AND 31) AND
  ("yieldMethod" <> 'DAILY_AMOUNT' OR ("yieldDailyAmount" IS NOT NULL AND "yieldCap" IS NOT NULL AND "yieldCap" > 0)) AND
  ("yieldExcessRate" = 0 OR ("yieldCap" IS NOT NULL AND "yieldCap" > 0)) AND
  jsonb_typeof("yieldHistory") = 'array'
);
