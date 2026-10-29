"use client"


import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { mobileNavItems } from "@/lib/navigation";
import { useLogout } from "./LogoutProvider";
import { cn } from "@/lib/utils";
import { Check, LogOut, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

export default function MobileNavigationSheet({ disabled = false, onNavigate, className }: { disabled?: boolean; onNavigate?: () => void; className?: string }) {
  const mobile = useIsMobile()
  const pathname = usePathname()
  const openLogout = useLogout()
  const [open, setOpen] = useState(false)
  const navigatingRef = useRef(false)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const titleRef = useRef<HTMLDivElement | null>(null)

  const updateViewport = useCallback(() => {
    const content = contentRef.current
    const viewport = window.visualViewport
    if (!content || !viewport) return
    content.style.maxHeight = `${Math.max(0, viewport.height - 16)}px`
    content.style.top = `${Math.max(0, viewport.offsetTop)}px`
  }, [])

  const setContentRef = useCallback((content: HTMLDivElement | null) => {
    contentRef.current = content
    if (content) updateViewport()
  }, [updateViewport])

  useEffect(() => {
    if (!mobile) {
      if (open) {
        let cancelled = false
        queueMicrotask(() => { if (!cancelled) setOpen(false) })
        return () => { cancelled = true }
      }
      return
    }
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
  }, [mobile, open, updateViewport])

  function handleLogout() {
    navigatingRef.current = true
    setOpen(false)
    openLogout()
  }

  if (!mobile) return null

  return (
    <Sheet open={open} onOpenChange={nextOpen => {
      if (nextOpen) {
        navigatingRef.current = false
      }
      setOpen(nextOpen)
    }}>
      <SheetTrigger asChild>
        <Button type="button" variant="ghost" disabled={disabled} className={cn("h-11 gap-2 border-0 px-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground aria-expanded:bg-transparent aria-expanded:text-foreground dark:hover:bg-transparent", className)}>
          <Menu className="size-4" aria-hidden="true" />
          Cambiar sección
        </Button>
      </SheetTrigger>
      <SheetContent
        ref={setContentRef}
        side="top"
        data-mobile-navigation=""
        showCloseButton={false}
        className="max-h-[calc(100dvh-1rem)] rounded-b-xl pt-[env(safe-area-inset-top)] pb-2"
        onOpenAutoFocus={event => {
          event.preventDefault()
          titleRef.current?.focus({ preventScroll: true })
        }}
        onCloseAutoFocus={event => {
          if (navigatingRef.current) event.preventDefault()
        }}
      >
        <SheetHeader className="sr-only p-0">
          <SheetTitle ref={titleRef} tabIndex={-1} className="outline-none">Cambiar sección</SheetTitle>
          <SheetDescription>Elige dónde quieres continuar.</SheetDescription>
        </SheetHeader>
        <nav aria-label="Secciones de AFP" className="min-h-0 overflow-y-auto overscroll-contain px-2 pt-2">
          {mobileNavItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href
            return (
              <SheetClose key={href} asChild>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn("flex min-h-12 items-center gap-3 rounded-md px-3 py-2 text-sm outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring", active && "bg-muted font-medium")}
                  onClick={event => {
                    // Conserva la navegación nativa de enlaces con modificadores.
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
                    if (active) {
                      event.preventDefault()
                      setOpen(false)
                      return
                    }
                    navigatingRef.current = true
                    onNavigate?.()
                  }}
                >
                  <Icon className="size-5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">{label}</span>
                  {active ? <Check className="size-4 shrink-0" aria-hidden="true" /> : null}
                </Link>
              </SheetClose>
            )
          })}
        </nav>
        <SheetFooter className="shrink-0 border-t border-border px-2 py-2">
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={handleLogout} className="h-12 min-w-0 flex-1 justify-start gap-3 px-3 text-sm text-muted-foreground">
              <LogOut aria-hidden="true" />
              <span className="truncate">Cerrar sesión</span>
            </Button>
            <SheetClose asChild>
              <Button type="button" variant="ghost" className="h-12 gap-2 px-3 text-sm text-muted-foreground">
                <X className="size-4" aria-hidden="true" />
                Cerrar menú
              </Button>
            </SheetClose>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
