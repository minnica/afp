"use client"


import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

const PAYMENT_METHODS = [
  { value: "CASH", label: "Efectivo" },
  { value: "CARD", label: "Tarjeta" },
]

function PaymentMethodSelector({ id, value, onValueChange, disabled = false, includeDebit = false, className }: { id: string; value: string; onValueChange: (value: string) => void; cardLabel?: string; debitLabel?: string; includeDebit?: boolean; disabled?: boolean; className?: string }) {
  return (
    <RadioGroup
      id={id}
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      orientation="horizontal"
      aria-labelledby={`${id}-label`}
      data-slot="payment-method-selector"
      className={cn("inline-flex w-auto max-w-full flex-wrap gap-6", className)}
    >
      {[...PAYMENT_METHODS, ...(includeDebit ? [{ value: "DEBIT", label: "Débito" }] : [])].map((method) => (
        <Label
          key={method.value}
          htmlFor={`${id}-${method.value}`}
          className={cn(
            "min-h-7 min-w-0 cursor-pointer gap-2 rounded-md py-1 text-xs/relaxed font-normal max-md:min-h-12 [@media(pointer:coarse)]:min-h-12",
            disabled && "cursor-not-allowed opacity-50",
          )}
        >
          <RadioGroupItem
            id={`${id}-${method.value}`}
            value={method.value}
            disabled={disabled}
            className="size-3.5 border-muted-foreground [&_[data-slot=radio-group-indicator]]:size-3.5 [&_[data-slot=radio-group-indicator]>span]:size-1.5"
          />
          <span>{method.label}</span>
        </Label>
      ))}
    </RadioGroup>
  )
}

export { PaymentMethodSelector };
