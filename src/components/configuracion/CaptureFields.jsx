"use client";
import { Controller } from "react-hook-form";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { ResponsiveSelect } from "@/components/ui/responsive-select";

export default function CaptureFields({ form, configuration, disabled = false, prefix = "capture-edit" }) {
  return <FieldGroup>
    {[['merchant', 'Concepto'], ['amount', 'Importe en MXN'], ['date', 'Fecha'], ['cardId', 'Tarjeta'], ['categoryId', 'Categoría']].map(([name, label]) => {
      const error = form.formState.errors[name];
      const id = `${prefix}-${name}`;
      return <Field key={name} data-invalid={Boolean(error)}>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {['cardId', 'categoryId'].includes(name) ? <Controller name={name} control={form.control} render={({ field }) => <ResponsiveSelect className="min-h-11" id={id} value={field.value} onValueChange={field.onChange} disabled={disabled}
          aria-invalid={Boolean(error)} aria-label={label} searchable="auto" options={(name === 'cardId' ? configuration.cards : configuration.categories).map(row => ({ value: row.id, label: row.name }))} />}
        /> : name === 'date' ? <Controller name="date" control={form.control} render={({ field }) => <DatePicker id={id} className="min-h-11" value={field.value} onChange={field.onChange} disabled={disabled} aria-label={label} />} />
          : name === 'amount' ? <Controller name="amount" control={form.control} render={({ field }) => <Input {...field} id={id} className="min-h-11" type="number" formatNumber min="0.01" step="0.01" disabled={disabled} aria-invalid={Boolean(error)} />} />
            : <Input id={id} className="min-h-11" disabled={disabled} aria-invalid={Boolean(error)} {...form.register(name)} />}
        <FieldError errors={[error]} />
      </Field>;
    })}
  </FieldGroup>;
}
