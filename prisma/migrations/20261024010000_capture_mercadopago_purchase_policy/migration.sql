-- Amplía las reglas expresas con una tarjeta de crédito Mercado Pago y MXN.
-- Conserva las reglas anteriores y sus filas. No activa formatos ni crea gastos.
ALTER TABLE "capture_automations"
DROP CONSTRAINT "capture_automations_completion_policy_check";

ALTER TABLE "capture_automations" ADD CONSTRAINT "capture_automations_completion_policy_check"
CHECK (("completionPolicy" IS NULL AND "policyAcceptedAt" IS NULL AND "policySubscriptionId" IS NULL)
  OR ("completionPolicy" IS NOT NULL AND "completionPolicy" = 'NU_CFE_MXN' AND "parserKey" = 'nu.cfe-service-payment.es.v2'
    AND "datePolicy" = 'NOTIFICATION_POSTED_AT' AND "policyAcceptedAt" IS NOT NULL)
  OR ("completionPolicy" IS NOT NULL AND "completionPolicy" = 'MERCADOPAGO_CREDIT_MXN' AND "parserKey" = 'mercadopago.card-purchase.es.v1'
    AND "datePolicy" = 'NOTIFICATION_POSTED_AT' AND "policyAcceptedAt" IS NOT NULL AND "policySubscriptionId" IS NULL));
