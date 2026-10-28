import { BarChart3, CircleDollarSign, CreditCard, HandCoins, Home, ListChecks, ReceiptText, Settings, WalletCards } from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Wallet02Icon, TransactionHistoryIcon } from "@hugeicons/core-free-icons";

function CreditBalancesIcon(props: Omit<import("react").ComponentProps<typeof HugeiconsIcon>, "icon">) {
  return <HugeiconsIcon icon={Wallet02Icon} {...props} />;
}
function AutomaticRecordingIcon(props: Omit<import("react").ComponentProps<typeof HugeiconsIcon>, "icon">) { return <HugeiconsIcon icon={TransactionHistoryIcon} {...props} />; }

export const navItems = [
  { label: "Mi dinero", href: "/mi-dinero", icon: CircleDollarSign },
  {
    label: "Gastos",
    href: "/gastos",
    icon: ReceiptText,
  },
  {
    label: "Registro automático",
    href: "/registro-automatico",
    icon: AutomaticRecordingIcon,
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
    label: "Crédito y deuda",
    href: "/credito-y-deuda",
    icon: CreditBalancesIcon,
  },
  {
    label: "Configuración",
    href: "/configuracion",
    icon: Settings,
  },
];

export const mobileNavItems = [...navItems];
const [cardsItem] = mobileNavItems.splice(mobileNavItems.findIndex(item => item.href === "/tarjetas"), 1);
const [balancesItem] = mobileNavItems.splice(mobileNavItems.findIndex(item => item.href === "/credito-y-deuda"), 1);
mobileNavItems.splice(mobileNavItems.findIndex(item => item.href === "/dashboard"), 0, cardsItem!, balancesItem!);

