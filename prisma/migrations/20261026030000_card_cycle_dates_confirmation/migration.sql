-- Las fechas generadas no prueban que el propietario revisó el estado de cuenta.
-- Los ciclos existentes permanecen sin confirmar hasta guardar sus fechas reales.
ALTER TABLE "card_cycles" ADD COLUMN "datesConfirmedAt" TIMESTAMP(3);
