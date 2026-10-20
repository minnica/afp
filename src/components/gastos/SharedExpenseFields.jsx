"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getCashContributionError, getPersonalExpenseAmount } from "@/lib/sharedExpenses";
import { formatMoney } from "@/lib/analysisPresentation";

export default function SharedExpenseFields({ id, enabled, onEnabledChange, amount, contribution, onContributionChange, disabled, linkedAccount = false, error }) {
  const validation = enabled && contribution !== "" ? getCashContributionError({ amount, cashContributionAmount: contribution }) : null;
  const message = error || validation;
  const canPreview = enabled && contribution !== "" && Number(contribution) > 0 && !validation;
  return (
    <FieldGroup className="gap-2" data-slot="shared-expense-fields">
      <Field orientation="horizontal" data-disabled={disabled || linkedAccount}>
        <Checkbox id={`${id}-shared`} checked={enabled} onCheckedChange={(value) => onEnabledChange(value === true)} disabled={disabled || linkedAccount} aria-describedby={`${id}-help`} />
        <FieldLabel htmlFor={`${id}-shared`} className="min-h-11 flex-1">Gasto compartido</FieldLabel>
        <Badge variant={enabled && !linkedAccount ? "success" : "secondary"}>Efectivo</Badge>
      </Field>
      {linkedAccount ? <FieldDescription id={`${id}-help`}>Registra el abono en la cuenta vinculada.</FieldDescription> : enabled ? (
        <>
          <Field data-invalid={Boolean(message)} data-disabled={disabled}>
            <FieldLabel htmlFor={id}>Efectivo recibido</FieldLabel>
            <Input id={id} type="number" formatNumber min="0.01" max={Number(amount) > 0 ? amount : undefined} step="0.01" inputMode="decimal" placeholder="0.00" value={contribution} onChange={(event) => onContributionChange(event.target.value)} disabled={disabled} aria-invalid={Boolean(message)} aria-describedby={`${id}-help${message ? ` ${id}-error` : ""}`} />
            {message ? <FieldError id={`${id}-error`}>{message}</FieldError> : null}
          </Field>
          <span id={`${id}-help`} className="sr-only">Dinero que ya te dieron para este gasto. Tu parte se refleja en Análisis.</span>
          {canPreview ? (
            <p className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-md bg-success/10 px-3 py-2.5 text-sm text-success" role="status" aria-atomic="true" data-slot="shared-expense-preview">
              <span>Tu parte</span>
              <strong className="tabular-nums">{formatMoney(getPersonalExpenseAmount({ amount, cashContributionAmount: contribution }))}</strong>
            </p>
          ) : null}
        </>
      ) : <span id={`${id}-help`} className="sr-only">Activa si ya te aportaron efectivo para este gasto.</span>}
    </FieldGroup>
  );
}
