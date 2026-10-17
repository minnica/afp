-- Devoluciones confirmadas que reducen el pago de un estado ya emitido.
-- Aditiva: conserva los estados de cuenta, pagos y bonificaciones existentes.
ALTER TABLE "card_cycles"
ADD COLUMN "postCutCreditAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN "postCutCreditDate" TIMESTAMP(3),
ADD COLUMN "postCutCreditNotes" TEXT;
