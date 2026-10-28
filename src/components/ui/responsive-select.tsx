"use client"

import type * as React from "react";

import { Cancel01Icon, Tick02Icon, UnfoldMoreIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";

import { Button } from "@/components/ui/button";
import {
Command,
CommandEmpty,
CommandGroup,
CommandInput,
CommandItem,
CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
Sheet,
SheetClose,
SheetContent,
SheetDescription,
SheetHeader,
SheetTitle,
SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export type SelectOption = { value: string; label: string; shortLabel?: string; pinned?: boolean; disabled?: boolean };
export type ResponsiveSelectProps = Pick<React.ComponentProps<"button">, "id" | "className" | "disabled" | "aria-label" | "aria-invalid" | "aria-describedby" | "aria-labelledby"> & { value?: string; onValueChange: (value: string) => void; onSelectionComplete?: () => void; options: SelectOption[]; title?: string; placeholder?: string; searchPlaceholder?: string; searchable?: boolean | "auto"; sortOptions?: boolean };
type OptionListProps = { options: SelectOption[]; value: string; onSelect: (value: string) => void; title: string; isSheet: boolean };
const SHEET_QUERY = "(width < 768px), (pointer: coarse)"
const collator = new Intl.Collator("es", { sensitivity: "base", numeric: true })

function subscribeToSheetQuery(onChange: () => void) {
  const query = window.matchMedia(SHEET_QUERY)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

function getSheetSnapshot() {
  return window.matchMedia(SHEET_QUERY).matches
}

function getServerSnapshot() {
  return false
}

function normalizeSearch(text: string) {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("es").trim()
}

// Busca en las etiquetas visibles; conserva los IDs como valores.
function filterOption(_value: string, search: string, keywords: string[] = []) {
  const label = normalizeSearch(keywords.join(" "))
  return normalizeSearch(search).split(/\s+/).every((word) => label.includes(word)) ? 1 : 0
}

function OptionList({ options, value, onSelect, title, searchPlaceholder, isSheet }: OptionListProps & { searchPlaceholder: string }) {
  return (
    <Command
      label={searchPlaceholder}
      defaultValue={value}
      filter={filterOption}
      className={cn(
        "searchable-select-options h-auto min-h-0 rounded-none p-2",
        isSheet && "max-h-[calc(var(--selector-max-height)-4rem-env(safe-area-inset-bottom))]",
      )}
    >
      <CommandInput
        aria-label={searchPlaceholder}
        placeholder={searchPlaceholder}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        inputGroupClassName={isSheet ? "h-12!" : "h-11!"}
        className={cn("placeholder:text-muted-foreground", isSheet ? "text-base" : "text-sm")}
      />
      <CommandList
        label={title}
        className={cn(
          "mt-2 min-h-0 overscroll-contain",
          isSheet ? "max-h-none flex-1" : "max-h-[min(20rem,var(--radix-popover-content-available-height))]",
        )}
      >
        <CommandEmpty className="px-4 text-sm">
          {options.length ? "No se encontraron opciones. Prueba con otra palabra." : "No hay opciones disponibles."}
        </CommandEmpty>
        <CommandGroup>
          {options.map((option) => (
            <CommandItem
              key={option.value}
              value={option.value}
              keywords={[option.label]}
              disabled={option.disabled}
              data-checked={option.value === value}
              onSelect={() => onSelect(option.value)}
              className={cn(
                "cursor-pointer gap-3 py-2 text-sm",
                isSheet && "min-h-12 py-3 text-base",
                option.value === value && "bg-accent",
              )}
            >
              <span className="min-w-0 flex-1 whitespace-normal break-words">
                {option.label}
                {option.value === value && <span className="sr-only"> (seleccionada)</span>}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  )
}

function CompactOptionList({ options, value, onSelect, title, isSheet }: OptionListProps) {
  const [activeValue, setActiveValue] = useState(value)
  const listRef = useRef<HTMLDivElement | null>(null)
  const typeaheadRef = useRef({ text: "", time: 0 })
  const id = useId()
  const enabledOptions = options.filter((option) => !option.disabled)
  const active = enabledOptions.some((option) => option.value === activeValue)
    ? activeValue
    : enabledOptions[0]?.value

  useEffect(() => {
    const list = listRef.current
    const selected = list?.querySelector('[aria-selected="true"]')
    if (!selected || !list) return

    // Abre la lista alrededor de la selección sin desplazar la página ni mover el foco.
    const listRect = list.getBoundingClientRect()
    const selectedRect = selected.getBoundingClientRect()
    list.scrollTop += selectedRect.top - listRect.top - (list.clientHeight - selectedRect.height) / 2
  }, [value])

  function focusOption(nextValue: string) {
    const index = options.findIndex((option) => option.value === nextValue)
    listRef.current?.querySelectorAll<HTMLElement>('[role="option"]')[index]?.focus()
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const index = enabledOptions.findIndex((option) => option.value === active)
    let nextIndex
    if (event.key === "ArrowDown") nextIndex = (index + 1) % enabledOptions.length
    if (event.key === "ArrowUp") nextIndex = (index - 1 + enabledOptions.length) % enabledOptions.length
    if (event.key === "Home") nextIndex = 0
    if (event.key === "End") nextIndex = enabledOptions.length - 1
    if (nextIndex !== undefined) {
      event.preventDefault()
      if (enabledOptions[nextIndex]) focusOption(enabledOptions[nextIndex]!.value)
    } else if (event.key.length === 1 && event.key !== " " && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = Date.now()
      const previous = typeaheadRef.current
      const text = now - previous.time < 700 ? previous.text + event.key : event.key
      typeaheadRef.current = { text, time: now }
      const orderedOptions = [...enabledOptions.slice(index + 1), ...enabledOptions.slice(0, index + 1)]
      const match = orderedOptions.find((option) => normalizeSearch(option.label).startsWith(normalizeSearch(text)))
      if (match) {
        event.preventDefault()
        focusOption(match.value)
      }
    }
  }

  if (!options.length) {
    return <p role="status" className="p-6 text-center text-sm text-muted-foreground">No hay opciones disponibles.</p>
  }

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label={title}
      data-slot="compact-option-list"
      onKeyDown={handleKeyDown}
      className={cn(
        "min-h-0 overflow-y-auto overscroll-contain p-2",
        isSheet && "max-h-[calc(var(--selector-max-height)-4rem-env(safe-area-inset-bottom))]",
      )}
    >
      {options.map((option, index) => (
        <Button
          key={option.value}
          id={`${id}-${index}`}
          type="button"
          variant="ghost"
          role="option"
          aria-selected={option.value === value}
          disabled={option.disabled}
          tabIndex={option.value === active ? 0 : -1}
          onFocus={() => setActiveValue(option.value)}
          onClick={() => onSelect(option.value)}
          className={cn(
            "h-auto min-h-12 w-full justify-between gap-3 px-3 py-3 text-left text-base font-normal whitespace-normal",
            option.value === value && "bg-accent",
          )}
        >
          <span className="min-w-0 flex-1 break-words">{option.label}</span>
          <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} aria-hidden="true" className={cn("size-4 shrink-0", option.value !== value && "invisible")} />
        </Button>
      ))}
    </div>
  )
}

function MobileOptions({ title, open, searchable, children, onCloseAutoFocus }: React.PropsWithChildren<{ title: string; open: boolean; searchable: boolean; onCloseAutoFocus?: React.ComponentProps<typeof SheetContent>["onCloseAutoFocus"] }>) {
  const contentRef = useRef<HTMLDivElement | null>(null)
  const titleRef = useRef<HTMLHeadingElement | null>(null)

  useEffect(() => {
    if (!open) return
    const viewport = window.visualViewport
    if (!viewport) return

    // Mantiene el panel sobre el teclado de Android, incluso al mover el viewport.
    const updateViewport = () => {
      const content = contentRef.current
      if (!content) return
      content.style.setProperty("--selector-viewport-height", `${Math.max(0, viewport.height - 16)}px`)
      content.style.bottom = `${Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)}px`
    }
    updateViewport()
    viewport.addEventListener("resize", updateViewport)
    viewport.addEventListener("scroll", updateViewport)
    return () => {
      viewport.removeEventListener("resize", updateViewport)
      viewport.removeEventListener("scroll", updateViewport)
    }
  }, [open])

  return (
    <SheetContent
      ref={contentRef}
      side="bottom"
      showCloseButton={false}
      data-slot="searchable-select-sheet"
      className="[--selector-max-height:min(70dvh,var(--selector-viewport-height,100dvh))] data-[side=bottom]:h-auto max-h-(--selector-max-height) gap-0 overflow-hidden rounded-t-xl pb-[env(safe-area-inset-bottom)] outline-none"
      onOpenAutoFocus={(event) => {
        event.preventDefault()
        const searchInput = searchable
          ? contentRef.current?.querySelector<HTMLInputElement>('[data-slot="command-input"]')
          : null
        const focusTarget = searchInput ?? titleRef.current
        focusTarget?.focus({ preventScroll: true })
      }}
      onCloseAutoFocus={onCloseAutoFocus}
    >
      <SheetHeader className="relative shrink-0 p-4 pr-16 text-left">
        <SheetTitle ref={titleRef} tabIndex={-1} className="text-base outline-none">
          {title}
        </SheetTitle>
        <SheetDescription className="sr-only">
          {searchable ? "Busca o recorre las opciones. Toca una para seleccionarla." : "Toca una opción para seleccionarla."}
        </SheetDescription>
        <SheetClose asChild>
          <Button type="button" variant="ghost" size="icon" aria-label="Cerrar selector" className="absolute top-2 right-2 size-12">
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} aria-hidden="true" />
          </Button>
        </SheetClose>
      </SheetHeader>
      {children}
    </SheetContent>
  )
}

/** Opciones: { value: string, label: string, shortLabel?: string, pinned?: boolean, disabled?: boolean }[]. */
function ResponsiveSelect({
  id,
  value = "",
  onValueChange,
  onSelectionComplete,
  options,
  title = "Seleccionar opción",
  placeholder = "Selecciona una opción",
  searchPlaceholder = "Buscar…",
  searchable = false,
  sortOptions = false,
  className,
  disabled = false,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  "aria-labelledby": ariaLabelledBy,
}: ResponsiveSelectProps) {
  const [open, setOpen] = useState(false)
  const selectedOnCloseRef = useRef(false)
  const [searchOnOpen, setSearchOnOpen] = useState(false)
  const isSheet = useSyncExternalStore(subscribeToSheetQuery, getSheetSnapshot, getServerSnapshot)
  const selectedOption = options.find((option) => option.value === value)
  const shouldSearch = searchable === true || (searchable === "auto" && options.filter((option) => !option.pinned).length > 8)
  const canSearch = open ? searchOnOpen : shouldSearch
  const sortedOptions = sortOptions ? [...options].sort((a, b) =>
    Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || collator.compare(a.label, b.label),
  ) : options

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      selectedOnCloseRef.current = false
      setSearchOnOpen(shouldSearch)
    }
    setOpen(nextOpen)
  }

  function handleSelect(nextValue: string) {
    selectedOnCloseRef.current = true
    if (isSheet && onSelectionComplete) {
      // Conserva el gesto del usuario para abrir selectores nativos (showPicker).
      flushSync(() => {
        onValueChange(nextValue)
        setOpen(false)
      })
      onSelectionComplete()
      return
    }
    onValueChange(nextValue)
    setOpen(false)
  }

  // Las listas cortas mantienen el Select oficial en escritorio.
  if (!isSheet && !canSearch) {
    return (
      <Select value={value} onValueChange={onValueChange} disabled={disabled} open={open} onOpenChange={handleOpenChange}>
        <SelectTrigger id={id} aria-label={ariaLabel} aria-labelledby={ariaLabelledBy} aria-invalid={ariaInvalid} aria-describedby={ariaDescribedBy} className={cn("w-full min-w-0", className)}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent position="popper" align="start">
          {!sortedOptions.length && <p role="status" className="p-4 text-sm text-muted-foreground">No hay opciones disponibles.</p>}
          <SelectGroup>
            {sortedOptions.map((option) => (
              <SelectItem key={option.value} value={option.value} disabled={option.disabled}>{option.label}</SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    )
  }
  const trigger = (
    <Button
      id={id}
      type="button"
      variant="outline"
      disabled={disabled}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-invalid={ariaInvalid}
      aria-describedby={ariaDescribedBy}
      aria-haspopup="dialog"
      aria-expanded={open}
      data-slot="searchable-select-trigger"
      className={cn(
        "relative h-7 w-full min-w-0 justify-between border-input bg-input/20 text-left text-sm font-normal md:text-xs/relaxed dark:bg-input/30",
        className,
        // Amplía el área táctil sin agrandar el campo visible respecto a Input.
        isSheet && "after:absolute after:inset-x-0 after:-inset-y-2",
      )}
    >
      <span className={cn("truncate", !selectedOption && "text-muted-foreground")}>
        {(isSheet ? selectedOption?.shortLabel ?? selectedOption?.label : selectedOption?.label) ?? placeholder}
      </span>
      <HugeiconsIcon icon={UnfoldMoreIcon} strokeWidth={2} className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Button>
  )
  const list = canSearch ? (
    <OptionList
      options={sortedOptions}
      value={value}
      onSelect={handleSelect}
      title={title}
      searchPlaceholder={searchPlaceholder}
      isSheet={isSheet}
    />
  ) : <CompactOptionList options={sortedOptions} value={value} onSelect={handleSelect} title={title} isSheet={isSheet} />

  if (isSheet) {
    return (
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <MobileOptions title={title} open={open} searchable={canSearch} onCloseAutoFocus={(event) => {
          if (selectedOnCloseRef.current && onSelectionComplete) {
            event.preventDefault()
            selectedOnCloseRef.current = false
          }
        }}>{list}</MobileOptions>
      </Sheet>
    )
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        aria-label={title}
        align="start"
        collisionPadding={16}
        className="w-[max(18rem,var(--radix-popover-trigger-width))] max-w-[calc(100vw-2rem)] max-h-(--radix-popover-content-available-height) gap-0 overflow-hidden p-0"
      >
        {list}
      </PopoverContent>
    </Popover>
  )
}

export { ResponsiveSelect };
