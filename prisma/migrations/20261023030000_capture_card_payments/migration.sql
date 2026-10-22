BEGIN;
-- Aditiva: conserva intactos los acumulados y fechas de pagos anteriores.
-- CreateTable
CREATE TABLE "card_cycle_payments" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "movementId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "date" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "card_cycle_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "card_cycle_payments_movementId_key" ON "card_cycle_payments"("movementId");

-- CreateIndex
CREATE INDEX "card_cycle_payments_userId_cycleId_idx" ON "card_cycle_payments"("userId", "cycleId");

-- AddForeignKey
ALTER TABLE "card_cycle_payments" ADD CONSTRAINT "card_cycle_payments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_cycle_payments" ADD CONSTRAINT "card_cycle_payments_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "card_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_cycle_payments" ADD CONSTRAINT "card_cycle_payments_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "capture_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "card_cycle_payments" ADD CONSTRAINT "card_cycle_payments_amount_check" CHECK ("amount" > 0);
ALTER TABLE "card_cycle_payments" ADD CONSTRAINT "card_cycle_payments_kind_check" CHECK ("kind" IN ('CAPTURE', 'EXISTING'));
ALTER TABLE "card_cycle_payments" ENABLE ROW LEVEL SECURITY;
COMMIT;
