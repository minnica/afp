"use client"

import type * as React from "react";

import AppHeaderActions from "@/components/layout/AppHeaderActions";
import MobileNavigationSheet from "@/components/layout/MobileNavigationSheet";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { navItems } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";

export default function AppHeader({ disabled = false, onNavigate, className, ...props }: React.ComponentProps<"header"> & { disabled?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname()
  const mobile = useIsMobile()
  const title = navItems.find(item => item.href === pathname)?.label || "AFP"

  return (
    <header
      data-slot="app-header"
      className={cn("sticky top-0 z-30 flex h-12 shrink-0 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur md:h-14", className)}
      {...props}
    >
      {mobile ? <MobileNavigationSheet disabled={disabled} onNavigate={onNavigate} /> : <SidebarTrigger />}
      <div className="min-w-0">
        <h1 className="truncate text-sm font-medium">{title}</h1>
      </div>
      {mobile ? <AppHeaderActions disabled={disabled} /> : null}
    </header>
  )
}
