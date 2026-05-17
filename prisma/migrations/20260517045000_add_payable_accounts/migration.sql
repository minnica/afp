-- CreateEnum
CREATE TYPE "PayableAccountStatus" AS ENUM ('ACTIVE', 'PAID_OFF', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayableOriginType" AS ENUM ('MANUAL', 'DAILY_EXPENSE');

-- AlterTable
ALTER TABLE "daily_expenses" ADD COLUMN     "payableAccountId" TEXT;

-- CreateTable
CREATE TABLE "payable_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "concept" TEXT NOT NULL,
    "originalAmount" DECIMAL(65,30) NOT NULL,
    "originDate" TIMESTAMP(3) NOT NULL,
    "expectedMonthlyPayment" DECIMAL(65,30),
    "expectedDate" TIMESTAMP(3),
    "notes" TEXT,
    "status" "PayableAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "originType" "PayableOriginType" NOT NULL,
    "originId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payable_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payable_accounts_userId_idx" ON "payable_accounts"("userId");

-- CreateIndex
CREATE INDEX "payable_accounts_personId_idx" ON "payable_accounts"("personId");

-- CreateIndex
CREATE INDEX "daily_expenses_payableAccountId_idx" ON "daily_expenses"("payableAccountId");

-- AddForeignKey
ALTER TABLE "daily_expenses" ADD CONSTRAINT "daily_expenses_payableAccountId_fkey" FOREIGN KEY ("payableAccountId") REFERENCES "payable_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payable_accounts" ADD CONSTRAINT "payable_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payable_accounts" ADD CONSTRAINT "payable_accounts_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
