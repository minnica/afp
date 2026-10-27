-- Opcional: los planes existentes conservan su cuenta o tarjeta fija.
ALTER TABLE money_plans ADD COLUMN "paymentMix" JSONB;
ALTER TABLE money_plans ADD CONSTRAINT money_plans_payment_mix_check
  CHECK ("paymentMix" IS NULL OR (kind = 'VARIABLE'
    AND jsonb_typeof("paymentMix") = 'object'
    AND "paymentMix" @> '{"version":1}'::jsonb));
