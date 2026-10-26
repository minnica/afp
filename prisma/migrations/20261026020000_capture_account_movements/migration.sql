-- Aditiva: nuevas reglas y evidencias vacías; no modifica saldos ni registra avisos anteriores.

-- AlterTable
ALTER TABLE "daily_expenses" ADD COLUMN     "debitAccountId" TEXT;

-- CreateTable
CREATE TABLE "money_withdrawals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "date" DATE NOT NULL,
    "concept" TEXT NOT NULL,
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "money_withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capture_money_policies" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'OBSERVATION',
    "fromAccountId" TEXT NOT NULL,
    "toAccountId" TEXT,
    "destinationLabel" TEXT NOT NULL DEFAULT '',
    "accountLast4" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "datePolicy" TEXT NOT NULL DEFAULT 'NOTIFICATION_POSTED_AT',
    "acceptedAt" TIMESTAMP(3) NOT NULL,
    "verifiedMovementId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "capture_money_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capture_money_postings" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "movementId" UUID NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "transferId" TEXT,
    "withdrawalId" TEXT,
    "expenseId" TEXT,
    "originalRecordId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capture_money_postings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "money_withdrawals_userId_date_idx" ON "money_withdrawals"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "capture_money_policies_userId_kind_destinationLabel_key" ON "capture_money_policies"("userId", "kind", "destinationLabel");

-- CreateIndex
CREATE UNIQUE INDEX "capture_money_postings_movementId_key" ON "capture_money_postings"("movementId");

-- CreateIndex
CREATE UNIQUE INDEX "capture_money_postings_userId_sourceKey_key" ON "capture_money_postings"("userId", "sourceKey");

-- AddForeignKey
ALTER TABLE "daily_expenses" ADD CONSTRAINT "daily_expenses_debitAccountId_fkey" FOREIGN KEY ("debitAccountId") REFERENCES "money_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_withdrawals" ADD CONSTRAINT "money_withdrawals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_withdrawals" ADD CONSTRAINT "money_withdrawals_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "money_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capture_money_policies" ADD CONSTRAINT "capture_money_policies_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capture_money_policies" ADD CONSTRAINT "capture_money_policies_fromAccountId_fkey" FOREIGN KEY ("fromAccountId") REFERENCES "money_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capture_money_policies" ADD CONSTRAINT "capture_money_policies_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "money_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capture_money_postings" ADD CONSTRAINT "capture_money_postings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capture_money_postings" ADD CONSTRAINT "capture_money_postings_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "capture_movements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capture_money_postings" ADD CONSTRAINT "capture_money_postings_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "money_transfers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capture_money_postings" ADD CONSTRAINT "capture_money_postings_withdrawalId_fkey" FOREIGN KEY ("withdrawalId") REFERENCES "money_withdrawals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capture_money_postings" ADD CONSTRAINT "capture_money_postings_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "daily_expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Nuevas tablas privadas, sin políticas públicas de acceso.
ALTER TABLE "money_withdrawals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "capture_money_policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "capture_money_postings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "money_withdrawals" ADD CONSTRAINT "money_withdrawals_amount_check" CHECK ("amount" > 0);
ALTER TABLE "daily_expenses" ADD CONSTRAINT "daily_expenses_debit_account_check"
  CHECK (("paymentMethod"::text = 'DEBIT') = ("debitAccountId" IS NOT NULL));
ALTER TABLE "capture_money_policies" ADD CONSTRAINT "capture_money_policies_kind_check" CHECK ("kind" IN ('NU_TRANSFER', 'BBVA_WITHDRAWAL'));
ALTER TABLE "capture_money_policies" ADD CONSTRAINT "capture_money_policies_mode_check" CHECK ("mode" IN ('OBSERVATION', 'AUTOMATIC'));
ALTER TABLE "capture_money_policies" ADD CONSTRAINT "capture_money_policies_mxn_check" CHECK ("currency" = 'MXN' AND "datePolicy" = 'NOTIFICATION_POSTED_AT');
ALTER TABLE "capture_money_policies" ADD CONSTRAINT "capture_money_policies_accounts_check" CHECK (
  ("kind" = 'NU_TRANSFER' AND "toAccountId" IS NOT NULL AND "fromAccountId" <> "toAccountId" AND length("destinationLabel") > 0)
  OR ("kind" = 'BBVA_WITHDRAWAL' AND "toAccountId" IS NULL AND "accountLast4" ~ '^[0-9]{4}$'));
ALTER TABLE "capture_money_postings" ADD CONSTRAINT "capture_money_postings_kind_check" CHECK (
  ("kind" = 'TRANSFER' AND "transferId" IS NOT NULL AND "withdrawalId" IS NULL AND "expenseId" IS NULL)
  OR ("kind" = 'WITHDRAWAL' AND "withdrawalId" IS NOT NULL AND "transferId" IS NULL AND "expenseId" IS NULL)
  OR ("kind" = 'DEBIT_EXPENSE' AND "transferId" IS NULL AND "withdrawalId" IS NULL));
