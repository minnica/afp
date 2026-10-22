-- Una regla expresa completa únicamente el formato Nu/CFE. No se infieren
-- tarjeta, moneda ni suscripción a partir del nombre del banco.
ALTER TABLE "capture_automations"
ADD COLUMN "completionPolicy" TEXT,
ADD COLUMN "policyAcceptedAt" TIMESTAMP(3),
ADD COLUMN "policySubscriptionId" TEXT;

ALTER TABLE "capture_automations" ADD CONSTRAINT "capture_automations_completion_policy_check"
CHECK (("completionPolicy" IS NULL AND "policyAcceptedAt" IS NULL AND "policySubscriptionId" IS NULL)
  OR ("completionPolicy" IS NOT NULL AND "completionPolicy" = 'NU_CFE_MXN' AND "parserKey" = 'nu.cfe-service-payment.es.v2'
    AND "datePolicy" = 'NOTIFICATION_POSTED_AT' AND "policyAcceptedAt" IS NOT NULL));

-- PostgreSQL permite varios NULL: las automatizaciones anteriores no cambian.
-- Solo puede haber una tarjeta destinataria para la regla de cada propietario.
CREATE UNIQUE INDEX "capture_automations_owner_format_policy_key"
ON "capture_automations"("userId", "parserKey", "completionPolicy");

ALTER TABLE "capture_automations" ADD CONSTRAINT "capture_automations_policySubscriptionId_fkey"
FOREIGN KEY ("policySubscriptionId") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
