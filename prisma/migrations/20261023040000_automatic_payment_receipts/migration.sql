BEGIN;
-- Política explícita por propietario/tarjeta; no activa ni altera pagos previos.
-- CreateTable
CREATE TABLE "capture_payment_policies" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "destinationLast4" TEXT,
    "destinationHash" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'OBSERVATION',
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capture_payment_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "capture_payment_policies_userId_cardId_source_key" ON "capture_payment_policies"("userId", "cardId", "source");

-- CreateIndex
CREATE UNIQUE INDEX "capture_payment_policies_userId_source_destinationLast4_key" ON "capture_payment_policies"("userId", "source", "destinationLast4");

-- AddForeignKey
ALTER TABLE "capture_payment_policies" ADD CONSTRAINT "capture_payment_policies_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capture_payment_policies" ADD CONSTRAINT "capture_payment_policies_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "capture_payment_policies" ADD CONSTRAINT "capture_payment_policies_source_check" CHECK ("source" IN ('BBVA_RECEIPT', 'NU_NOTICE'));
ALTER TABLE "capture_payment_policies" ADD CONSTRAINT "capture_payment_policies_mode_check" CHECK ("mode" IN ('OBSERVATION', 'AUTOMATIC') AND ("mode" <> 'AUTOMATIC' OR "acceptedAt" IS NOT NULL));
ALTER TABLE "capture_payment_policies" ADD CONSTRAINT "capture_payment_policies_destination_check" CHECK (("source" = 'NU_NOTICE' AND "destinationLast4" IS NULL AND "destinationHash" IS NULL) OR ("source" = 'BBVA_RECEIPT' AND "destinationLast4" ~ '^[0-9]{4}$' AND ("destinationHash" IS NULL OR "destinationHash" ~ '^[a-f0-9]{64}$')));
ALTER TABLE "capture_payment_policies" ENABLE ROW LEVEL SECURITY;
COMMIT;
