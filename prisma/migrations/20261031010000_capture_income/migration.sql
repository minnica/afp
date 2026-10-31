-- Aditiva: sin activar reglas ni registrar avisos históricos.
ALTER TABLE "incomes" ADD COLUMN "isEstimated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "capture_money_postings" ADD COLUMN "incomeId" TEXT;
ALTER TABLE "capture_money_postings" ADD CONSTRAINT "capture_money_postings_incomeId_fkey" FOREIGN KEY ("incomeId") REFERENCES "incomes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "capture_money_postings" DROP CONSTRAINT "capture_money_postings_kind_check";
ALTER TABLE "capture_money_postings" ADD CONSTRAINT "capture_money_postings_kind_check" CHECK (
 ("kind" = 'TRANSFER' AND "transferId" IS NOT NULL AND "withdrawalId" IS NULL AND "expenseId" IS NULL AND "cardPaymentId" IS NULL AND "incomeId" IS NULL)
 OR ("kind" = 'WITHDRAWAL' AND "withdrawalId" IS NOT NULL AND "transferId" IS NULL AND "expenseId" IS NULL AND "cardPaymentId" IS NULL AND "incomeId" IS NULL)
 OR ("kind" = 'DEBIT_EXPENSE' AND "transferId" IS NULL AND "withdrawalId" IS NULL AND "cardPaymentId" IS NULL AND "incomeId" IS NULL)
 OR ("kind" = 'CARD_PAYMENT' AND "transferId" IS NULL AND "withdrawalId" IS NULL AND "expenseId" IS NULL AND "incomeId" IS NULL)
 OR ("kind" = 'INCOME' AND "transferId" IS NULL AND "withdrawalId" IS NULL AND "expenseId" IS NULL AND "cardPaymentId" IS NULL));
CREATE TABLE "capture_income_policies" (
 "id" UUID NOT NULL PRIMARY KEY,
 "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "parserKey" TEXT NOT NULL,
 "accountSuffix" TEXT NOT NULL CHECK ("accountSuffix" ~ '^[0-9]{4,5}$'),
 "accountId" TEXT NOT NULL REFERENCES "money_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "incomeTypeId" TEXT NOT NULL REFERENCES "income_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "mode" TEXT NOT NULL DEFAULT 'OBSERVATION' CHECK ("mode" IN ('OBSERVATION', 'AUTOMATIC')),
 "currency" TEXT NOT NULL DEFAULT 'MXN' CHECK ("currency" = 'MXN'),
 "datePolicy" TEXT NOT NULL DEFAULT 'NOTIFICATION_POSTED_AT' CHECK ("datePolicy" = 'NOTIFICATION_POSTED_AT'),
 "verifiedMovementId" UUID REFERENCES "capture_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "estimatedFirstHalfAmount" DECIMAL(12,2) CHECK ("estimatedFirstHalfAmount" > 0),
 "estimatedSecondHalfAmount" DECIMAL(12,2) CHECK ("estimatedSecondHalfAmount" > 0),
 "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "capture_income_policy_sample_check" CHECK ("mode" <> 'AUTOMATIC' OR "verifiedMovementId" IS NOT NULL)
);
CREATE UNIQUE INDEX "capture_income_policies_userId_parserKey_accountSuffix_key" ON "capture_income_policies"("userId", "parserKey", "accountSuffix");
ALTER TABLE "capture_income_policies" ENABLE ROW LEVEL SECURITY;
