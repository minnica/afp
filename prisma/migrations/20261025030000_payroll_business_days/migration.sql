-- Opción de calendario para nómina; conserva fechas y planes anteriores.
ALTER TABLE money_plans
ADD COLUMN "payrollBusinessDays" BOOLEAN NOT NULL DEFAULT false;
