ALTER TABLE "receivable_accounts"
ADD COLUMN "expectedChargeDays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];

UPDATE "receivable_accounts"
SET "expectedChargeDays" = ARRAY["expectedChargeDay"]
WHERE "expectedChargeDay" IS NOT NULL;

ALTER TABLE "receivable_accounts"
DROP COLUMN "expectedChargeDay";