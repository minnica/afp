-- CreateTable
CREATE TABLE "money_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'BANK',
    "openingBalance" DECIMAL(12,2) NOT NULL,
    "asOf" DATE NOT NULL,
    "baseline" JSONB NOT NULL,
    "reservedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "money_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "money_reconciliations" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "previousBalance" DECIMAL(12,2) NOT NULL,
    "bankBalance" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "money_reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "money_routes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "accountId" TEXT,
    "excluded" BOOLEAN NOT NULL DEFAULT false,
    "planId" TEXT,
    "occurrenceDate" DATE,

    CONSTRAINT "money_routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "money_plans" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "accountId" TEXT NOT NULL,
    "cardId" TEXT,
    "incomeTypeId" TEXT,
    "categoryId" TEXT,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "frequencyMonths" INTEGER NOT NULL DEFAULT 1,
    "days" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "money_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "money_occurrences" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "money_occurrences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "money_transfers" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fromAccountId" TEXT NOT NULL,
    "toAccountId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "date" DATE NOT NULL,
    "concept" TEXT NOT NULL,
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "money_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "money_card_payments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "date" DATE NOT NULL,
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "money_card_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "money_operations" (
    "userId" TEXT NOT NULL,
    "operationId" UUID NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "money_operations_pkey" PRIMARY KEY ("userId","operationId")
);

-- CreateIndex
CREATE UNIQUE INDEX "money_accounts_userId_name_key" ON "money_accounts"("userId", "name");

-- CreateIndex
CREATE INDEX "money_reconciliations_accountId_createdAt_idx" ON "money_reconciliations"("accountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "money_routes_userId_key_key" ON "money_routes"("userId", "key");

-- CreateIndex
CREATE INDEX "money_plans_userId_idx" ON "money_plans"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "money_occurrences_planId_date_key" ON "money_occurrences"("planId", "date");

-- CreateIndex
CREATE INDEX "money_transfers_userId_date_idx" ON "money_transfers"("userId", "date");

-- CreateIndex
CREATE INDEX "money_card_payments_userId_cycleId_idx" ON "money_card_payments"("userId", "cycleId");

-- AddForeignKey
ALTER TABLE "money_accounts" ADD CONSTRAINT "money_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_reconciliations" ADD CONSTRAINT "money_reconciliations_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "money_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_routes" ADD CONSTRAINT "money_routes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_routes" ADD CONSTRAINT "money_routes_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "money_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_routes" ADD CONSTRAINT "money_routes_planId_fkey" FOREIGN KEY ("planId") REFERENCES "money_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_plans" ADD CONSTRAINT "money_plans_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_plans" ADD CONSTRAINT "money_plans_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "money_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_occurrences" ADD CONSTRAINT "money_occurrences_planId_fkey" FOREIGN KEY ("planId") REFERENCES "money_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_transfers" ADD CONSTRAINT "money_transfers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_transfers" ADD CONSTRAINT "money_transfers_fromAccountId_fkey" FOREIGN KEY ("fromAccountId") REFERENCES "money_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_transfers" ADD CONSTRAINT "money_transfers_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "money_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_card_payments" ADD CONSTRAINT "money_card_payments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_card_payments" ADD CONSTRAINT "money_card_payments_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "card_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_card_payments" ADD CONSTRAINT "money_card_payments_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "money_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_operations" ADD CONSTRAINT "money_operations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Tablas privadas: la API valida la identidad; no se habilita acceso público.
ALTER TABLE money_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_card_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_accounts ADD CONSTRAINT money_accounts_kind_check CHECK (kind IN ('BANK', 'SAVINGS', 'CASH'));
ALTER TABLE money_accounts ADD CONSTRAINT money_accounts_reserve_check CHECK ("reservedAmount" >= 0 AND version > 0);
ALTER TABLE money_routes ADD CONSTRAINT money_routes_target_check CHECK ((excluded AND "accountId" IS NULL) OR (NOT excluded AND "accountId" IS NOT NULL));
ALTER TABLE money_routes ADD CONSTRAINT money_routes_occurrence_check CHECK (("planId" IS NULL) = ("occurrenceDate" IS NULL));
ALTER TABLE money_plans ADD CONSTRAINT money_plans_values_check CHECK (amount > 0 AND kind IN ('INCOME', 'PAYROLL', 'EXPENSE', 'VARIABLE') AND "frequencyMonths" BETWEEN 0 AND 12 AND version > 0 AND ("endDate" IS NULL OR "endDate" >= "startDate") AND days <@ ARRAY[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31]);
ALTER TABLE money_occurrences ADD CONSTRAINT money_occurrences_status_check CHECK (status IN ('SKIPPED', 'CLOSED'));
ALTER TABLE money_transfers ADD CONSTRAINT money_transfers_values_check CHECK (amount > 0 AND "fromAccountId" <> "toAccountId");
ALTER TABLE money_card_payments ADD CONSTRAINT money_card_payments_amount_check CHECK (amount > 0);

-- Un acumulado no puede borrar abonos individuales registrados desde Mi dinero.
-- También impide vincular por segunda vez evidencia de un abono ya identificado.
CREATE FUNCTION afp_money_payment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_id text; recorded numeric; identified numeric;
BEGIN
  IF TG_TABLE_NAME = 'card_cycles' THEN target_id := NEW.id;
  ELSE target_id := NEW."cycleId"; END IF;
  SELECT COALESCE("paidAmount", 0) INTO recorded FROM card_cycles WHERE id = target_id FOR UPDATE;
  SELECT COALESCE(SUM(amount), 0) INTO identified FROM (
    SELECT amount FROM money_card_payments WHERE "cycleId" = target_id AND "reversedAt" IS NULL
    UNION ALL
    SELECT amount FROM card_cycle_payments WHERE "cycleId" = target_id AND "reversedAt" IS NULL
  ) p;
  IF identified > recorded THEN RAISE EXCEPTION 'El total no puede ser menor que los abonos identificados; revierte primero el abono.' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END; $$;
CREATE CONSTRAINT TRIGGER money_payment_total_guard AFTER INSERT OR UPDATE ON money_card_payments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION afp_money_payment_guard();
CREATE CONSTRAINT TRIGGER money_capture_total_guard AFTER INSERT OR UPDATE ON card_cycle_payments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION afp_money_payment_guard();
CREATE CONSTRAINT TRIGGER money_cycle_total_guard AFTER UPDATE ON card_cycles DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION afp_money_payment_guard();
