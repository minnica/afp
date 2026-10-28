import { addDays } from '@/lib/money/dates';

export const MINIMUM_PROXIMITY_PERCENT = 5;

export function monthlyMinimumPeriod(month, daily, today) {
  const minimum = Math.round(Number(month.minimum) * 100);
  // El margen usa la magnitud del mínimo también cuando el saldo es negativo.
  // En cero, solo se incluyen los días cuyo saldo también es cero.
  const ceiling = minimum + Math.floor(Math.abs(minimum) * MINIMUM_PROXIMITY_PERCENT / 100);
  const days = daily.filter(day => day.date >= today && day.date.startsWith(`${month.month}-`))
    .map(day => ({ date: day.date, balance: Math.round(Number(day.balance) * 100) }));
  if (!days.some(day => day.balance === minimum)) return { ranges: [], label: null };

  const dates = [...new Set(days.filter(day => day.balance >= minimum && day.balance <= ceiling).map(day => day.date))].sort();
  const ranges = [];
  for (const date of dates) {
    const previous = ranges.at(-1);
    if (previous && date === addDays(previous.to, 1)) previous.to = date;
    else ranges.push({ from: date, to: date });
  }
  const parts = ranges.map(range => {
    const from = Number(range.from.slice(-2)), to = Number(range.to.slice(-2));
    return from === to ? String(from) : `${from}–${to}`;
  });
  const singular = dates.length === 1;
  const label = `${singular ? 'Día' : 'Días'} ${new Intl.ListFormat('es-MX', { style: 'long', type: 'conjunction' }).format(parts)}`;
  return { ranges, label };
}
