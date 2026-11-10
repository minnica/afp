-- Existing withdrawals keep their historical outflow-only behavior.
ALTER TABLE public.money_withdrawals
  ADD COLUMN "cashAccountId" TEXT,
  ADD COLUMN "cashAmount" DECIMAL(12,2);

ALTER TABLE public.money_withdrawals
  ADD CONSTRAINT money_withdrawals_cash_destination_check CHECK (
    ("cashAccountId" IS NULL AND "cashAmount" IS NULL)
    OR ("cashAccountId" IS NOT NULL AND "cashAmount" IS NOT NULL
      AND "cashAccountId" <> "accountId" AND "cashAmount" > 0 AND "cashAmount" <= amount)
  ),
  ADD CONSTRAINT "money_withdrawals_cashAccountId_fkey"
    FOREIGN KEY ("cashAccountId") REFERENCES public.money_accounts(id)
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "money_withdrawals_cashAccountId_date_idx"
  ON public.money_withdrawals("cashAccountId", date);
-- The existing table keeps its RLS and policies; no historical records are changed.
