"use client";

import { ResponsiveSelect } from "@/components/ui/responsive-select";
import { MONTH_NAMES } from "@/lib/analysisPresentation";

export default function MonthSelector({ value, onChange, year, label = "Mes del período", ...props }) {
  return (
    <ResponsiveSelect
      value={String(value)}
      onValueChange={(value) => onChange(Number(value))}
      aria-label={label}
      title={label}
      className="h-11 w-full md:h-9"
      options={MONTH_NAMES.map((name, index) => ({ value: String(index), label: year ? `${name} ${year}` : name, shortLabel: year ? `${name.slice(0, 3)} ${year}` : name }))}
      {...props}
    />
  );
}
