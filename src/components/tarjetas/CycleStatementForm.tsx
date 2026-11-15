"use client";

import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { DatePicker } from '@/components/ui/date-picker';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { cardStatementSchema, type CardStatementDraft } from '@/lib/cardStatementPrefill';
import type { Cycle } from '@/lib/uiTypes';

export default function CycleStatementForm({ cycle, isSaving, onSubmit }: {
  cycle: Cycle; isSaving: boolean; onSubmit: (values: CardStatementDraft) => Promise<void>;
}) {
  const form = useForm<CardStatementDraft>({
    resolver: zodResolver(cardStatementSchema),
    mode: 'onBlur',
    defaultValues: {
      statementAmount: cycle.statementAmount == null ? '' : String(cycle.statementAmount),
      startDate: cycle.startDate.slice(0, 10),
      cutDate: cycle.cutDate.slice(0, 10),
      dueDate: cycle.dueDate.slice(0, 10),
    },
  });

  return (
    <form id="cycle-statement-form" noValidate onSubmit={form.handleSubmit(onSubmit)}>
      <FieldGroup className="gap-3">
        <Controller control={form.control} name="statementAmount" render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="cycle-statement-amount">Monto estado de cuenta</FieldLabel>
            <Input {...field} id="cycle-statement-amount" type="number" formatNumber min="0" step="0.01"
              className="min-h-11" disabled={isSaving} aria-invalid={fieldState.invalid}
              aria-describedby={fieldState.invalid ? 'cycle-statement-amount-error' : undefined} placeholder="0.00" />
            <FieldError id="cycle-statement-amount-error" errors={[fieldState.error]} />
          </Field>
        )} />
        {([
          ['startDate', 'Inicio', 'Fecha de inicio'],
          ['cutDate', 'Corte', 'Fecha de corte'],
          ['dueDate', 'Límite de pago', 'Fecha límite de pago'],
        ] as const).map(([name, label, ariaLabel]) => (
          <Controller key={name} control={form.control} name={name} render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`cycle-statement-${name}`}>{label}</FieldLabel>
              <DatePicker id={`cycle-statement-${name}`} aria-label={ariaLabel} className="min-h-11" disabled={isSaving}
                value={field.value} onChange={field.onChange} onBlur={field.onBlur} aria-invalid={fieldState.invalid}
                aria-describedby={fieldState.invalid ? `cycle-statement-${name}-error` : undefined} />
              <FieldError id={`cycle-statement-${name}-error`} errors={[fieldState.error]} />
            </Field>
          )} />
        ))}
      </FieldGroup>
    </form>
  );
}
