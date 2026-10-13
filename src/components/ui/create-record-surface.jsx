"use client"

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon, Cancel01Icon, FloppyDiskIcon } from "@hugeicons/core-free-icons"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import AppHeader from "@/components/layout/AppHeader"
import { useIsMobile } from "@/hooks/use-mobile"
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
  const mobile = useIsMobile()
  const errorId = providedErrorId ?? `${generatedId}-error`
  const submittingRef = useRef(false)
  // La captura comienza abierta en móvil; los cierres posteriores se respetan.
  const [open, setOpen] = useState(compact)
  const contentRef = useRef(null)
  const formRef = useRef(null)
  const fieldsRef = useRef(null)
  // Conserva el diálogo abierto si cambia la orientación durante la captura.
  const inDialog = compact || open

  const updateViewport = useCallback(() => {
    const content = contentRef.current
    const viewport = window.visualViewport
    if (!content || !viewport) return
    if (mobile) {
      content.style.height = `${Math.max(0, viewport.height)}px`
      content.style.maxHeight = "none"
      content.style.top = `${viewport.offsetTop}px`
    } else {
      content.style.height = ""
      content.style.maxHeight = `${Math.max(0, viewport.height - 32)}px`
      content.style.top = `${viewport.offsetTop + viewport.height / 2}px`
    }
  }, [mobile])

  const setContentRef = useCallback(content => {
    contentRef.current = content
    if (content) updateViewport()
  }, [updateViewport])

  useLayoutEffect(() => {
    if (!open) return
    const viewport = window.visualViewport
    if (!viewport) return
    updateViewport()
    viewport.addEventListener("resize", updateViewport)
    viewport.addEventListener("scroll", updateViewport)
    return () => {
      viewport.removeEventListener("resize", updateViewport)
      viewport.removeEventListener("scroll", updateViewport)
    }
  }, [open, updateViewport])

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

  const capture = (
    <>
      <DialogHeader className="shrink-0 pr-6">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className="sr-only">{description}</DialogDescription>
      </DialogHeader>
      {form}
    </>
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
        ref={setContentRef}
        showCloseButton={!mobile}
        className={cn("flex flex-col", mobile
          ? "top-0 left-0 h-[100dvh] max-h-none max-w-none translate-x-0 translate-y-0 gap-0 rounded-none bg-transparent p-0 ring-0 sm:max-w-none"
          : "max-h-[calc(100dvh-2rem)] sm:max-w-md")}
        style={mobile ? { pointerEvents: "none", "--tw-enter-scale": 1, "--tw-exit-scale": 1 } : undefined}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          contentRef.current?.focus({ preventScroll: true })
        }}
        onInteractOutside={(event) => { if (isSaving) event.preventDefault() }}
        onEscapeKeyDown={(event) => { if (isSaving) event.preventDefault() }}
      >
        {mobile ? (
          <>
            <AppHeader disabled={isSaving} onNavigate={() => setOpen(false)} className="pointer-events-auto z-10 bg-background" />
            <div className="pointer-events-none flex min-h-0 flex-1 items-center justify-center p-4">
              <div data-slot="record-create-panel" className="pointer-events-auto relative flex max-h-full min-h-0 w-full max-w-md flex-col gap-4 rounded-xl bg-popover p-4 ring-1 ring-foreground/10">
                {capture}
                <DialogClose asChild>
                  <Button type="button" variant="ghost" disabled={isSaving} className="absolute top-2 right-2" size="icon-sm" aria-label="Cerrar formulario">
                    <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} aria-hidden="true" />
                  </Button>
                </DialogClose>
              </div>
            </div>
          </>
        ) : capture}
      </DialogContent>
    </Dialog>
  )
}
