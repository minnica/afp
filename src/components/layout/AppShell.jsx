"use client";

import AppSidebar from "@/components/layout/AppSidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

export default function AppShell({ children }) {
  return (
    <SidebarProvider>
      <AppSidebar />

      <SidebarInset>
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur">
          <SidebarTrigger />

          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
              AFP
            </p>
          </div>
        </header>

        <div className="min-h-[calc(100dvh-3.5rem)] bg-background text-foreground">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
