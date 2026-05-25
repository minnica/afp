"use client";

import { usePathname } from "next/navigation";
import AppSidebar from "@/components/layout/AppSidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

const pageTitles = {
  "/gastos": "Gastos",
  "/dashboard": "Dashboard",
  "/compras-a-meses": "Compras a meses",
  "/suscripciones": "Suscripciones",
  "/ingresos": "Ingresos",
  "/cuentas-por-cobrar": "Cuentas por cobrar",
  "/tarjetas": "Tarjetas",
  "/configuracion": "Configuración",
};

export default function AppShell({ children }) {
  const pathname = usePathname();

  const currentPageTitle = pageTitles[pathname] || "AFP";

  return (
    <SidebarProvider>
      <AppSidebar />

      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur">
          <SidebarTrigger />

          <div className="min-w-0">
            <h1 className="truncate text-sm font-medium">{currentPageTitle}</h1>
          </div>
        </header>

        <div className="min-h-[calc(100dvh-3.5rem)] bg-background text-foreground">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
