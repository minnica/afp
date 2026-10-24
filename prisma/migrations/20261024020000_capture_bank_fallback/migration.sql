-- AlterTable
ALTER TABLE "capture_movements" ADD COLUMN     "fallbackDueAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "capture_bank_fallbacks" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "bankSourcePackage" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'OBSERVATION',
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "bankDatePolicy" TEXT NOT NULL,
    "purchasesOnly" BOOLEAN NOT NULL,
    "waitMinutes" INTEGER NOT NULL DEFAULT 15,
    "acceptedAt" TIMESTAMP(3) NOT NULL,
    "evidenceMovementId" UUID NOT NULL,

    CONSTRAINT "capture_bank_fallbacks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "capture_bank_fallbacks_userId_cardId_key" ON "capture_bank_fallbacks"("userId", "cardId");

-- CreateIndex
CREATE INDEX "capture_movements_fallbackDueAt_idx" ON "capture_movements"("fallbackDueAt");

-- AddForeignKey
ALTER TABLE "capture_bank_fallbacks" ADD CONSTRAINT "capture_bank_fallbacks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capture_bank_fallbacks" ADD CONSTRAINT "capture_bank_fallbacks_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capture_bank_fallbacks" ADD CONSTRAINT "capture_bank_fallbacks_evidenceMovementId_fkey" FOREIGN KEY ("evidenceMovementId") REFERENCES "capture_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Acceso financiero únicamente a través del servidor autenticado.
ALTER TABLE "capture_bank_fallbacks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "capture_bank_fallbacks" ADD CONSTRAINT "capture_bank_fallbacks_policy_check" CHECK (
  "mode" IN ('OBSERVATION', 'AUTOMATIC') AND "currency" = 'MXN' AND "purchasesOnly" = true AND "waitMinutes" = 15
  AND (("bankSourcePackage" IN ('com.citibanamex.banamexmobile', 'mx.bancosantander.supermovil') AND "bankDatePolicy" = 'BANK_OPERATION')
    OR ("bankSourcePackage" = 'com.nu.production' AND "bankDatePolicy" = 'NOTIFICATION_POSTED_AT'))
);
