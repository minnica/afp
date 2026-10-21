-- AlterTable
ALTER TABLE "installment_purchases" ADD COLUMN     "reconciliationStatus" TEXT NOT NULL DEFAULT 'CONFIRMED';

ALTER TABLE installment_purchases ADD CONSTRAINT installment_purchases_reconciliation_check
  CHECK ("reconciliationStatus" IN ('CONFIRMED', 'PENDING'));
