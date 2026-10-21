BEGIN;
ALTER TABLE "capture_devices" ADD COLUMN "pausedPackages" JSONB NOT NULL DEFAULT '[]', ADD COLUMN "reportedState" JSONB, ADD COLUMN "reportedAt" TIMESTAMP(3);
ALTER TABLE "capture_movements" ADD COLUMN "correction" JSONB;
ALTER TABLE "daily_expenses" ADD COLUMN "reconciledAt" TIMESTAMP(3);
ALTER TABLE "installment_purchases" ADD COLUMN "reconciledAt" TIMESTAMP(3);
CREATE TABLE "capture_statements" (
  "id" UUID NOT NULL,
  "userId" TEXT NOT NULL,
  "cardId" TEXT NOT NULL,
  "startDate" TEXT NOT NULL,
  "endDate" TEXT NOT NULL,
  "chargesTotal" DECIMAL(65,30),
  "notes" TEXT NOT NULL DEFAULT '',
  "matches" JSONB NOT NULL DEFAULT '{}',
  "operations" JSONB NOT NULL DEFAULT '{}',
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "capture_statements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "capture_statements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "capture_statements_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "capture_statements_period_check" CHECK ("startDate" <= "endDate" AND ("chargesTotal" IS NULL OR "chargesTotal" >= 0))
);
CREATE UNIQUE INDEX "capture_statements_userId_cardId_startDate_endDate_key" ON "capture_statements"("userId", "cardId", "startDate", "endDate");
ALTER TABLE "capture_statements" ENABLE ROW LEVEL SECURITY;
COMMIT;
