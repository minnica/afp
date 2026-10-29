"use client";
import { Button } from './button';
export function HistoryYear({ year, onChange, disabled = false }: { year: number; onChange: (year: number) => void; disabled?: boolean }) {
  return <div className="flex items-center gap-2" aria-label="Año del historial">
    <Button type="button" variant="outline" disabled={disabled || year <= 1900} onClick={() => onChange(year - 1)} aria-label="Año anterior">Anterior</Button>
    <span className="text-sm tabular-nums" role="status">{year}</span>
    <Button type="button" variant="outline" disabled={disabled || year >= 9998} onClick={() => onChange(year + 1)} aria-label="Año siguiente">Siguiente</Button>
  </div>;
}
