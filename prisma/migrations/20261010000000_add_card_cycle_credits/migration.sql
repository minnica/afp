-- CreateTable
CREATE TABLE "card_cycle_credits" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "incomeId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "card_cycle_credits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "card_cycle_credits_userId_idx" ON "card_cycle_credits"("userId");

-- CreateIndex
CREATE INDEX "card_cycle_credits_incomeId_idx" ON "card_cycle_credits"("incomeId");

-- CreateIndex
CREATE UNIQUE INDEX "card_cycle_credits_cycleId_incomeId_key" ON "card_cycle_credits"("cycleId", "incomeId");

-- AddForeignKey
ALTER TABLE "card_cycle_credits" ADD CONSTRAINT "card_cycle_credits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_cycle_credits" ADD CONSTRAINT "card_cycle_credits_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "card_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_cycle_credits" ADD CONSTRAINT "card_cycle_credits_incomeId_fkey" FOREIGN KEY ("incomeId") REFERENCES "incomes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
