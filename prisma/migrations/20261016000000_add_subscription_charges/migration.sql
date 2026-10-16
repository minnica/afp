CREATE TYPE "SubscriptionChargeStatus" AS ENUM ('CONFIRMED', 'SKIPPED');

CREATE TABLE "subscription_charges" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "status" "SubscriptionChargeStatus" NOT NULL,
    "expenseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "subscription_charges_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "subscription_charges_month_check" CHECK ("month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    CONSTRAINT "subscription_charges_skipped_check" CHECK ("status" <> 'SKIPPED' OR "expenseId" IS NULL)
);

CREATE UNIQUE INDEX "subscription_charges_expenseId_key" ON "subscription_charges"("expenseId");
CREATE UNIQUE INDEX "subscription_charges_subscriptionId_month_key" ON "subscription_charges"("subscriptionId", "month");
CREATE INDEX "subscription_charges_userId_month_idx" ON "subscription_charges"("userId", "month");
ALTER TABLE "subscription_charges" ADD CONSTRAINT "subscription_charges_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscription_charges" ADD CONSTRAINT "subscription_charges_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscription_charges" ADD CONSTRAINT "subscription_charges_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "daily_expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Solo las API del servidor acceden a estas decisiones; no se expone PostgREST.
ALTER TABLE "subscription_charges" ENABLE ROW LEVEL SECURITY;
