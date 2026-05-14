"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  CreditCard,
  HandCoins,
  Home,
  ListChecks,
  LogOut,
  ReceiptText,
  Settings,
  WalletCards,
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";

const navItems = [
  {
    label: "Gastos",
    href: "/gastos",
    icon: ReceiptText,
  },
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: BarChart3,
  },
  {
    label: "Compras a meses",
    href: "/compras-a-meses",
    icon: WalletCards,
  },
  {
    label: "Suscripciones",
    href: "/suscripciones",
    icon: ListChecks,
  },
  {
    label: "Ingresos",
    href: "/ingresos",
    icon: HandCoins,
  },
  {
    label: "Cuentas por cobrar",
    href: "/cuentas-por-cobrar",
    icon: Home,
  },
  {
    label: "Tarjetas",
    href: "/tarjetas",
    icon: CreditCard,
  },
  {
    label: "Configuración",
    href: "/configuracion",
    icon: Settings,
  },
];

export default function AppShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-border bg-card/80 backdrop-blur md:flex md:flex-col">
        <div className="border-b border-border px-5 py-5">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            AFP
          </p>
          <h1 className="mt-2 text-lg font-semibold">Control de gastos</h1>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition",
                  isActive
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                ].join(" ")}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border p-3">
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-start"
            onClick={handleLogout}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Cerrar sesión
          </Button>
        </div>
      </aside>

      <div className="md:pl-64">
        <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur md:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                AFP
              </p>
              <p className="text-sm font-medium">Control de gastos</p>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleLogout}
            >
              Salir
            </Button>
          </div>

          <nav className="flex gap-2 overflow-x-auto px-4 pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    "flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-xs whitespace-nowrap",
                    isActive
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-card text-muted-foreground",
                  ].join(" ")}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>

        {children}
      </div>
    </div>
  );
}
