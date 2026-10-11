-- Datos opcionales para consumo mínimo; conserva los cálculos y pagos existentes.
ALTER TABLE "cards" ADD COLUMN "usagePolicy" JSONB;
ALTER TABLE "card_cycles" ADD COLUMN "usageReconciliation" JSONB;
