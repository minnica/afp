-- Extiende únicamente los tipos de regla permitidos. No activa reglas ni
-- reinterpreta avisos históricos. Conserva las políticas y RLS existentes.
ALTER TABLE "capture_money_policies" DROP CONSTRAINT "capture_money_policies_kind_check";
ALTER TABLE "capture_money_policies" ADD CONSTRAINT "capture_money_policies_kind_check"
  CHECK ("kind" IN ('NU_TRANSFER', 'BBVA_WITHDRAWAL', 'BBVA_DEBIT', 'BBVA_NU_TRANSFER'));
ALTER TABLE "capture_money_policies" DROP CONSTRAINT "capture_money_policies_accounts_check";
ALTER TABLE "capture_money_policies" ADD CONSTRAINT "capture_money_policies_accounts_check" CHECK (
  ("kind" = 'NU_TRANSFER' AND "toAccountId" IS NOT NULL AND "fromAccountId" <> "toAccountId" AND length("destinationLabel") > 0)
  OR ("kind" = 'BBVA_WITHDRAWAL' AND "toAccountId" IS NULL AND "accountLast4" ~ '^[0-9]{4}$')
  OR ("kind" = 'BBVA_DEBIT' AND "toAccountId" IS NULL AND "accountLast4" IS NULL AND "destinationLabel" = ''
      AND cardinality("accountSuffixes") BETWEEN 1 AND 10 AND array_position("accountSuffixes", NULL) IS NULL
      AND array_to_string("accountSuffixes", ',') ~ '^[0-9]{4,5}(,[0-9]{4,5})*$')
  OR ("kind" = 'BBVA_NU_TRANSFER' AND "toAccountId" IS NOT NULL AND "fromAccountId" <> "toAccountId"
      AND "accountLast4" IS NULL AND "destinationLabel" = '' AND cardinality("accountSuffixes") BETWEEN 1 AND 10
      AND array_position("accountSuffixes", NULL) IS NULL
      AND array_to_string("accountSuffixes", ',') ~ '^[0-9]{4,5}(,[0-9]{4,5})*$')
);
