"use client"


import { Calendar03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { format } from "date-fns";
import { useState, useSyncExternalStore } from "react";
import { es } from "react-day-picker/locale";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const TOUCH_POINTER_QUERY = "(pointer: coarse)"

function subscribeToPointer(onChange: () => void) {
  const mediaQuery = window.matchMedia(TOUCH_POINTER_QUERY)
  mediaQuery.addEventListener("change", onChange)
  return () => mediaQuery.removeEventListener("change", onChange)
}

function hasTouchPointer() {
  return window.matchMedia(TOUCH_POINTER_QUERY).matches
}

function getServerPointerSnapshot() {
  return false
}

function DatePicker({
  id,
  value,
  onChange,
  className,
  clearable = false,
  disabled = false,
  placeholder = "Seleccionar fecha",
  "aria-label": ariaLabel = "Fecha",
}: { id?: string; value?: string | null; onChange: (value: string) => void; className?: string; clearable?: boolean; disabled?: boolean; placeholder?: string; "aria-label"?: string }) {
  const [open, setOpen] = useState(false)
  // Match the server during hydration, then use the device's primary pointer.
  const useNativePicker = useSyncExternalStore(
    subscribeToPointer,
    hasTouchPointer,
    getServerPointerSnapshot,
  )
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "")
  const selectedDate = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : undefined

  if (useNativePicker) {
    return (
      <div className={cn("flex w-full min-w-0 items-center gap-1", className)}>
        <Input
          id={id}
          type="date"
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          aria-label={ariaLabel}
          className="flex-1 text-left tabular-nums [color-scheme:light] dark:[color-scheme:dark] [&::-webkit-date-and-time-value]:text-left"
        />
        {clearable && value ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            aria-label={`Limpiar ${ariaLabel.toLowerCase()}`}
            onClick={() => onChange("")}
          >
            Limpiar
          </Button>
        ) : null}
      </div>
    )
  }

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

export { DatePicker };
