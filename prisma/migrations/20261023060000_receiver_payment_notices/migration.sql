BEGIN;
-- Ampliación aditiva de fuentes admitidas. No crea reglas ni modifica pagos.
ALTER TABLE "capture_payment_policies" DROP CONSTRAINT "capture_payment_policies_source_check";
ALTER TABLE "capture_payment_policies" ADD CONSTRAINT "capture_payment_policies_source_check"
  CHECK ("source" IN ('BBVA_RECEIPT', 'NU_NOTICE', 'BANAMEX_NOTICE', 'MERCADOPAGO_NOTICE'));
ALTER TABLE "capture_payment_policies" DROP CONSTRAINT "capture_payment_policies_destination_check";
ALTER TABLE "capture_payment_policies" ADD CONSTRAINT "capture_payment_policies_destination_check"
  CHECK (("source" IN ('NU_NOTICE', 'BANAMEX_NOTICE', 'MERCADOPAGO_NOTICE') AND "destinationLast4" IS NULL AND "destinationHash" IS NULL)
    OR ("source" = 'BBVA_RECEIPT' AND "destinationLast4" ~ '^[0-9]{4}$' AND ("destinationHash" IS NULL OR "destinationHash" ~ '^[a-f0-9]{64}$')));
COMMIT;
