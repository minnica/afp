"use client"

import { useState } from "react"
import { format } from "date-fns"
import { es } from "react-day-picker/locale"
import { Calendar03Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

function DatePicker({
  id,
  value,
  onChange,
  className,
  clearable = false,
  disabled = false,
  placeholder = "Seleccionar fecha",
  "aria-label": ariaLabel = "Fecha",
}) {
  const [open, setOpen] = useState(false)
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "")
  const selectedDate = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={selectedDate ? `${ariaLabel}: ${format(selectedDate, "PPP", { locale: es })}` : ariaLabel}
          className={cn(
            "h-7 w-full justify-between border-input bg-input/20 px-2 text-left text-sm font-normal tabular-nums md:text-xs dark:bg-input/30",
            className,
          )}
        >
          <span className={cn(!selectedDate && "text-muted-foreground")}>
            {selectedDate ? format(selectedDate, "dd/MM/yyyy") : placeholder}
          </span>
          <HugeiconsIcon icon={Calendar03Icon} strokeWidth={2} className="size-4 text-muted-foreground" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" collisionPadding={16} className="w-auto max-w-[calc(100vw-2rem)] gap-0 p-0">
        <Calendar
          mode="single"
          required
          selected={selectedDate}
          defaultMonth={selectedDate}
          onSelect={(nextDate) => {
            if (!nextDate) return
            onChange(format(nextDate, "yyyy-MM-dd"))
            setOpen(false)
          }}
          locale={es}
          weekStartsOn={0}
        />
        {clearable && value ? (
          <div className="border-t border-border p-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() => {
                onChange("")
                setOpen(false)
              }}
            >
              Limpiar fecha
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

export { DatePicker }
