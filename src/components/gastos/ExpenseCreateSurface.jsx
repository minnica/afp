"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon } from "@hugeicons/core-free-icons"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

const DIALOG_QUERY = "(width < 768px), (pointer: coarse)"

function subscribeToDialogMode(onChange) {
  const query = window.matchMedia(DIALOG_QUERY)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

export function useExpenseDialogMode() {
  return useSyncExternalStore(subscribeToDialogMode, () => window.matchMedia(DIALOG_QUERY).matches, () => false)
}

export default function ExpenseCreateSurface({ compact, children, error, isSaving, isOnline, onSubmit }) {
  // La captura comienza abierta en móvil; los cierres posteriores se respetan.
  const [open, setOpen] = useState(compact)
  const contentRef = useRef(null)
  const formRef = useRef(null)
  // Conserva el diálogo abierto si cambia la orientación durante la captura.
  const inDialog = compact || open

  useEffect(() => {
    if (!open) return
    const viewport = window.visualViewport
    if (!viewport) return
    const updateViewport = () => {
      const content = contentRef.current
      if (!content) return
      content.style.maxHeight = `${Math.max(0, viewport.height - 32)}px`
      content.style.top = `${viewport.offsetTop + viewport.height / 2}px`
    }
    updateViewport()
    viewport.addEventListener("resize", updateViewport)
    viewport.addEventListener("scroll", updateViewport)
    return () => {
      viewport.removeEventListener("resize", updateViewport)
      viewport.removeEventListener("scroll", updateViewport)
    }
  }, [open])

  useEffect(() => {
    if (error?.field) formRef.current?.querySelector(`#${error.field}`)?.focus()
  }, [error])

  async function handleSubmit(event) {
    event.preventDefault()
    if (isSaving) return
    const saved = await onSubmit()
    if (saved) setOpen(false)
  }

  const form = (
    <form ref={formRef} noValidate onSubmit={handleSubmit} className={cn(inDialog ? "flex min-h-0 flex-1 flex-col" : "space-y-4 md:space-y-5")}>
      <div className={cn("space-y-4 md:space-y-5", inDialog && "min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 pb-2")}>
        {error ? (
          <Alert id="create-expense-error" role="alert" variant="destructive">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : null}
        {inDialog && !isOnline ? (
          <Alert role="status">
            <AlertDescription>Sin conexión. El gasto quedará pendiente hasta recuperar internet.</AlertDescription>
          </Alert>
        ) : null}
        {children({ compact: inDialog })}
      </div>
      <DialogFooter className={cn(inDialog ? "mt-4 shrink-0 flex-row gap-2" : "")}>
        {inDialog ? (
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isSaving} className="h-11">Cancelar</Button>
          </DialogClose>
        ) : null}
        <Button type="submit" disabled={isSaving} className={cn("w-full", inDialog && "h-11 flex-1")}>
          {isSaving ? <Spinner /> : <HugeiconsIcon icon={Add01Icon} strokeWidth={2} aria-hidden="true" />}
          {isSaving ? "Guardando…" : "Guardar gasto"}
        </Button>
      </DialogFooter>
    </form>
  )

  if (!inDialog) {
    return (
      <Card className="rounded-2xl border-border bg-card">
        <CardHeader>
          <CardTitle className="text-center text-lg font-semibold uppercase">Nuevo gasto</CardTitle>
        </CardHeader>
        <CardContent>{form}</CardContent>
      </Card>
    )
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!isSaving) setOpen(nextOpen) }}>
      <div data-slot="expense-create-action" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <DialogTrigger asChild>
          <Button className="mx-auto flex h-12 w-full max-w-lg text-sm" disabled={isSaving}>
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} aria-hidden="true" />
            Nuevo gasto
          </Button>
        </DialogTrigger>
      </div>
      <DialogContent
        ref={contentRef}
        className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-md"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          contentRef.current?.focus({ preventScroll: true })
        }}
        onInteractOutside={(event) => { if (isSaving) event.preventDefault() }}
        onEscapeKeyDown={(event) => { if (isSaving) event.preventDefault() }}
      >
        <DialogHeader className="shrink-0 pr-6">
          <DialogTitle>Nuevo gasto</DialogTitle>
          <DialogDescription>Completa los datos y guarda tu gasto.</DialogDescription>
        </DialogHeader>
        {form}
      </DialogContent>
    </Dialog>
  )
}
