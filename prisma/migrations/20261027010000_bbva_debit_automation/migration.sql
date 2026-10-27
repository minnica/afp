-- Extensión aditiva. No activa reglas ni registra avisos previos.
ALTER TABLE "capture_money_policies" ADD COLUMN "accountSuffixes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "capture_money_postings" ADD COLUMN "cardPaymentId" TEXT;
ALTER TABLE "capture_money_postings" ADD CONSTRAINT "capture_money_postings_cardPaymentId_fkey"
  FOREIGN KEY ("cardPaymentId") REFERENCES "money_card_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "capture_money_policies" DROP CONSTRAINT "capture_money_policies_kind_check";
ALTER TABLE "capture_money_policies" ADD CONSTRAINT "capture_money_policies_kind_check" CHECK ("kind" IN ('NU_TRANSFER', 'BBVA_WITHDRAWAL', 'BBVA_DEBIT'));
ALTER TABLE "capture_money_policies" DROP CONSTRAINT "capture_money_policies_accounts_check";
ALTER TABLE "capture_money_policies" ADD CONSTRAINT "capture_money_policies_accounts_check" CHECK (
  ("kind" = 'NU_TRANSFER' AND "toAccountId" IS NOT NULL AND "fromAccountId" <> "toAccountId" AND length("destinationLabel") > 0)
  OR ("kind" = 'BBVA_WITHDRAWAL' AND "toAccountId" IS NULL AND "accountLast4" ~ '^[0-9]{4}$')
  OR ("kind" = 'BBVA_DEBIT' AND "toAccountId" IS NULL AND "accountLast4" IS NULL AND "destinationLabel" = ''
      AND cardinality("accountSuffixes") BETWEEN 1 AND 10 AND array_position("accountSuffixes", NULL) IS NULL
      AND array_to_string("accountSuffixes", ',') ~ '^[0-9]{4,5}(,[0-9]{4,5})*$'));
ALTER TABLE "capture_money_postings" DROP CONSTRAINT "capture_money_postings_kind_check";
ALTER TABLE "capture_money_postings" ADD CONSTRAINT "capture_money_postings_kind_check" CHECK (
  ("kind" = 'TRANSFER' AND "transferId" IS NOT NULL AND "withdrawalId" IS NULL AND "expenseId" IS NULL AND "cardPaymentId" IS NULL)
  OR ("kind" = 'WITHDRAWAL' AND "withdrawalId" IS NOT NULL AND "transferId" IS NULL AND "expenseId" IS NULL AND "cardPaymentId" IS NULL)
  OR ("kind" = 'DEBIT_EXPENSE' AND "transferId" IS NULL AND "withdrawalId" IS NULL AND "cardPaymentId" IS NULL)
  OR ("kind" = 'CARD_PAYMENT' AND "transferId" IS NULL AND "withdrawalId" IS NULL AND "expenseId" IS NULL));
