-- Conciliación no monetaria; cero conserva los saldos existentes.
ALTER TABLE "receivable_accounts"
ADD COLUMN "balanceAdjustment" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN "balanceAdjustmentNotes" TEXT;
