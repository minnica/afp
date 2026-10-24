ALTER TABLE money_accounts
ADD COLUMN "annualYield" DECIMAL(8,4) NOT NULL DEFAULT 0,
ADD COLUMN "yieldTaxPercent" DECIMAL(8,4) NOT NULL DEFAULT 0,
ADD COLUMN "yieldBasis" INTEGER NOT NULL DEFAULT 365,
ADD COLUMN "yieldFrequency" TEXT NOT NULL DEFAULT 'DAILY',
ADD COLUMN "yieldPayDay" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "yieldCap" DECIMAL(12,2),
ADD COLUMN "yieldStartDate" DATE,
ADD COLUMN "yieldEndDate" DATE,
ADD COLUMN "yieldIncomeTypeId" TEXT,
ADD CONSTRAINT money_accounts_yield_check CHECK ("annualYield" BETWEEN 0 AND 100 AND "yieldTaxPercent" BETWEEN 0 AND 100 AND "yieldBasis" IN (360,365,366) AND "yieldFrequency" IN ('DAILY','MONTHLY') AND "yieldPayDay" BETWEEN 1 AND 31 AND ("yieldCap" IS NULL OR "yieldCap" > 0) AND ("yieldStartDate" IS NULL OR "yieldEndDate" IS NULL OR "yieldStartDate" <= "yieldEndDate"));
