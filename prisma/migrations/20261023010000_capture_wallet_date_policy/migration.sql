-- Política explícita para formatos Wallet sin fecha bancaria. Las decisiones
-- anteriores conservan la política de fecha de operación; no se activan modos.
ALTER TABLE "capture_automations"
ADD COLUMN "datePolicy" TEXT NOT NULL DEFAULT 'BANK_OPERATION';
ALTER TABLE "capture_automations" ADD CONSTRAINT "capture_automations_datePolicy_check"
CHECK ("datePolicy" IN ('BANK_OPERATION', 'NOTIFICATION_POSTED_AT'));

-- Reinterpretación solicitada: conserva análisis previos sin reescribir el
-- aviso, su interpretación de recepción ni el recibo idempotente de Android.
ALTER TABLE "capture_movements" ADD COLUMN "analysisHistory" JSONB;
