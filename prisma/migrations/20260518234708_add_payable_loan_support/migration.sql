-- CreateEnum
CREATE TYPE "PayableAccountType" AS ENUM ('SIMPLE', 'LOAN');

-- AlterTable
ALTER TABLE "daily_expenses" ADD COLUMN     "loanBalanceAfterPayment" DECIMAL(65,30),
ADD COLUMN     "loanInterestAmount" DECIMAL(65,30),
ADD COLUMN     "loanPrincipalAmount" DECIMAL(65,30);

-- AlterTable
ALTER TABLE "payable_accounts" ADD COLUMN     "accountType" "PayableAccountType" NOT NULL DEFAULT 'SIMPLE',
ADD COLUMN     "annualInterestRate" DECIMAL(65,30),
ADD COLUMN     "currentBalance" DECIMAL(65,30),
ADD COLUMN     "firstPaymentDate" TIMESTAMP(3),
ADD COLUMN     "paymentAmount" DECIMAL(65,30),
ADD COLUMN     "paymentDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "paymentsMade" INTEGER,
ADD COLUMN     "reimbursementReceivableId" TEXT,
ADD COLUMN     "totalPayments" INTEGER;

-- CreateIndex
CREATE INDEX "daily_expenses_subscriptionId_idx" ON "daily_expenses"("subscriptionId");

-- CreateIndex
CREATE INDEX "payable_accounts_reimbursementReceivableId_idx" ON "payable_accounts"("reimbursementReceivableId");

-- AddForeignKey
ALTER TABLE "payable_accounts" ADD CONSTRAINT "payable_accounts_reimbursementReceivableId_fkey" FOREIGN KEY ("reimbursementReceivableId") REFERENCES "receivable_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
