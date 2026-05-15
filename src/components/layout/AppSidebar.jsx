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

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

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

export default function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="px-2 py-2">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground font-uppercase">
            garatachia
          </p>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link href={item.href}>
                        <Icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleLogout}>
              <LogOut />
              <span>Cerrar sesión</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
