import type { FinancialCycle } from './types';
// Expone problemas de los períodos guardados sin reasignar cargos ni fechas.
export function getCyclePeriodWarnings(cycle: FinancialCycle, cycles: FinancialCycle[]) {
  const previous = cycles
    .filter((item) => item.cardId === cycle.cardId && item.id !== cycle.id
      && new Date(item.cutDate).getTime() < new Date(cycle.cutDate).getTime())
    .sort((a, b) => new Date(b.cutDate).getTime() - new Date(a.cutDate).getTime())[0];
  if (!previous) return [];

  const start = new Date(cycle.startDate).toISOString().slice(0, 10);
  const previousCut = new Date(previous.cutDate).toISOString().slice(0, 10);
  const distance = Math.round((Date.parse(start) - Date.parse(previousCut)) / 86400000);
  if (distance <= 0) {
    return [`El período se superpone con el corte anterior (${previousCut}). Un movimiento de esos días puede aparecer en ambos desgloses; revisa las fechas contra tus estados de cuenta.`];
  }
  if (distance > 1) {
    return [`Hay ${distance - 1} día(s) sin cubrir entre el corte anterior (${previousCut}) y este período. Los movimientos de esos días quedan fuera del cálculo; revisa las fechas contra tus estados de cuenta.`];
  }
  return [];
}
