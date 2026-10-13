"use client"

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon, FloppyDiskIcon } from "@hugeicons/core-free-icons"

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

export function useCreateDialogMode() {
  return useSyncExternalStore(subscribeToDialogMode, () => window.matchMedia(DIALOG_QUERY).matches, () => false)
}

export default function CreateRecordSurface({
  compact, children, title, saveLabel, description = "Guarda un registro y continúa con el siguiente.",
  error, errorId: providedErrorId, isSaving, notice, onSubmit, actionSlot = "record-create-action",
}) {
  const generatedId = useId()
  const errorId = providedErrorId ?? `${generatedId}-error`
  const submittingRef = useRef(false)
  // La captura comienza abierta en móvil; los cierres posteriores se respetan.
  const [open, setOpen] = useState(compact)
  const contentRef = useRef(null)
  const formRef = useRef(null)
  const fieldsRef = useRef(null)
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
    if (isSaving || submittingRef.current) return
    submittingRef.current = true
    try {
      const saved = await onSubmit()
      if (saved && fieldsRef.current) fieldsRef.current.scrollTop = 0
    } finally {
      submittingRef.current = false
    }
  }

  const form = (
    <form ref={formRef} noValidate onSubmit={handleSubmit} className={cn(inDialog ? "flex min-h-0 flex-1 flex-col" : "space-y-4 md:space-y-5")}>
      <div ref={fieldsRef} className={cn("space-y-4 md:space-y-5", inDialog && "min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 pb-2")}>
        {error ? (
          <Alert id={errorId} role="alert" variant="destructive">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : null}
        {inDialog && notice ? (
          <Alert role="status">
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        ) : null}
        <fieldset disabled={isSaving} className="min-w-0 space-y-4 md:space-y-5">
          {typeof children === "function" ? children({ compact: inDialog }) : children}
        </fieldset>
      </div>
      <DialogFooter className={cn(inDialog ? "mt-4 shrink-0 flex-row gap-2" : "")}>
        {inDialog ? (
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isSaving} className="h-11">Cerrar</Button>
          </DialogClose>
        ) : null}
        <Button type="submit" disabled={isSaving} className={cn("w-full", inDialog && "h-11 flex-1")}>
          {isSaving ? <Spinner /> : <HugeiconsIcon icon={FloppyDiskIcon} strokeWidth={2} aria-hidden="true" />}
          {isSaving ? "Guardando…" : saveLabel}
        </Button>
      </DialogFooter>
    </form>
  )

  if (!inDialog) {
    return (
      <Card className="rounded-2xl border-border bg-card">
        <CardHeader>
          <CardTitle className="text-center text-lg font-semibold uppercase">{title}</CardTitle>
        </CardHeader>
        <CardContent>{form}</CardContent>
      </Card>
    )
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!isSaving) setOpen(nextOpen) }}>
      <div data-slot={actionSlot} className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <DialogTrigger asChild>
          <Button variant="outline" className="mx-auto flex h-12 w-full max-w-lg text-sm" disabled={isSaving}>
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} aria-hidden="true" />
            {title}
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
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {form}
      </DialogContent>
    </Dialog>
  )
}
