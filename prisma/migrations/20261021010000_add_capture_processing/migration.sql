-- AlterTable
ALTER TABLE "daily_expenses" ADD COLUMN     "reconciliationStatus" TEXT NOT NULL DEFAULT 'CONFIRMED';

-- AlterTable
ALTER TABLE "capture_events" ADD COLUMN     "interpretation" JSONB,
ADD COLUMN     "movementId" UUID;

-- CreateTable
CREATE TABLE "capture_card_aliases" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "sourcePackage" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "evidence" TEXT,

    CONSTRAINT "capture_card_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capture_automations" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "parserKey" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'OBSERVATION',

    CONSTRAINT "capture_automations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capture_merchant_rules" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "merchant" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "subscriptionId" TEXT,

    CONSTRAINT "capture_merchant_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capture_movements" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REVIEW',
    "reason" TEXT NOT NULL,
    "parserKey" TEXT,
    "proposal" JSONB NOT NULL,
    "cardId" TEXT,
    "amount" DECIMAL(65,30),
    "operationDate" TIMESTAMP(3),
    "referenceKey" TEXT,
    "expenseId" TEXT,
    "originalExpenseId" TEXT,
    "installmentPurchaseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "capture_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_tombstones" (
    "expenseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cardId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "concept" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_tombstones_pkey" PRIMARY KEY ("expenseId")
);

-- CreateIndex
CREATE INDEX "capture_card_aliases_userId_sourcePackage_kind_value_idx" ON "capture_card_aliases"("userId", "sourcePackage", "kind", "value");

-- CreateIndex
CREATE UNIQUE INDEX "capture_card_aliases_userId_cardId_sourcePackage_kind_value_key" ON "capture_card_aliases"("userId", "cardId", "sourcePackage", "kind", "value");

-- CreateIndex
CREATE UNIQUE INDEX "capture_automations_userId_cardId_parserKey_key" ON "capture_automations"("userId", "cardId", "parserKey");

-- CreateIndex
CREATE UNIQUE INDEX "capture_merchant_rules_userId_cardId_merchant_key" ON "capture_merchant_rules"("userId", "cardId", "merchant");

-- CreateIndex
CREATE INDEX "capture_movements_userId_status_createdAt_idx" ON "capture_movements"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "capture_movements_userId_cardId_operationDate_idx" ON "capture_movements"("userId", "cardId", "operationDate");

-- CreateIndex
CREATE UNIQUE INDEX "capture_movements_userId_referenceKey_key" ON "capture_movements"("userId", "referenceKey");

-- CreateIndex
CREATE INDEX "expense_tombstones_userId_cardId_date_idx" ON "expense_tombstones"("userId", "cardId", "date");

-- CreateIndex
CREATE INDEX "capture_events_deviceId_sourcePackage_notificationKeyHash_p_idx" ON "capture_events"("deviceId", "sourcePackage", "notificationKeyHash", "postedAt");

-- AddForeignKey
ALTER TABLE "capture_events" ADD CONSTRAINT "capture_events_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "capture_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capture_card_aliases" ADD CONSTRAINT "capture_card_aliases_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capture_card_aliases" ADD CONSTRAINT "capture_card_aliases_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capture_automations" ADD CONSTRAINT "capture_automations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capture_automations" ADD CONSTRAINT "capture_automations_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capture_merchant_rules" ADD CONSTRAINT "capture_merchant_rules_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capture_merchant_rules" ADD CONSTRAINT "capture_merchant_rules_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capture_movements" ADD CONSTRAINT "capture_movements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capture_movements" ADD CONSTRAINT "capture_movements_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "daily_expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capture_movements" ADD CONSTRAINT "capture_movements_installmentPurchaseId_fkey" FOREIGN KEY ("installmentPurchaseId") REFERENCES "installment_purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_tombstones" ADD CONSTRAINT "expense_tombstones_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Valores históricos conservan la confirmación previa; las capturas nuevas son PENDING.
ALTER TABLE daily_expenses ADD CONSTRAINT daily_expenses_reconciliation_check
  CHECK ("reconciliationStatus" IN ('CONFIRMED', 'PENDING'));
ALTER TABLE capture_automations ADD CONSTRAINT capture_automations_mode_check
  CHECK (mode IN ('OBSERVATION', 'AUTOMATIC'));
ALTER TABLE capture_card_aliases ADD CONSTRAINT capture_alias_check
  CHECK (kind IN ('PHYSICAL', 'DIGITAL', 'WALLET') AND value ~ '^[0-9]{4}$');
ALTER TABLE capture_movements ADD CONSTRAINT capture_movements_status_check
  CHECK (status IN ('REVIEW', 'OBSERVED', 'REGISTERED', 'LINKED', 'DISCARDED', 'CONVERTED'));

ALTER TABLE capture_card_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE capture_automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE capture_merchant_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE capture_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_tombstones ENABLE ROW LEVEL SECURITY;
