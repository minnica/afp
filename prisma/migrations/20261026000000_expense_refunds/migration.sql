-- Aditiva: comienza sin devoluciones, no modifica importes ni reglas existentes.
ALTER TABLE "daily_expenses" ADD COLUMN "refundOriginalAmount" DECIMAL(65,30);

CREATE TABLE "expense_refunds" (
  "id" UUID NOT NULL,
  "userId" TEXT NOT NULL,
  "expenseId" TEXT,
  "originalExpenseId" TEXT NOT NULL,
  "movementId" UUID NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "date" DATE NOT NULL,
  "expenseSnapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reversedAt" TIMESTAMP(3),
  CONSTRAINT "expense_refunds_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "expense_refunds_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "expense_refunds_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "daily_expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "expense_refunds_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "capture_movements"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "expense_refunds_amount_check" CHECK ("amount" > 0)
);
CREATE UNIQUE INDEX "expense_refunds_movementId_key" ON "expense_refunds"("movementId");
CREATE INDEX "expense_refunds_userId_originalExpenseId_idx" ON "expense_refunds"("userId", "originalExpenseId");
ALTER TABLE "expense_refunds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "daily_expenses" ADD CONSTRAINT "daily_expenses_refund_amount_check"
  CHECK ("refundOriginalAmount" IS NULL OR ("refundOriginalAmount" > 0 AND "amount" >= 0 AND "amount" <= "refundOriginalAmount"));
