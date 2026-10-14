import { BarChart3, CircleDollarSign, CreditCard, HandCoins, Home, ListChecks, ReceiptText, Settings, WalletCards } from "lucide-react";

export const navItems = [
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
    label: "Análisis",
    href: "/analisis",
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
    label: "Cuentas por pagar",
    href: "/cuentas-por-pagar",
    icon: CircleDollarSign,
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

