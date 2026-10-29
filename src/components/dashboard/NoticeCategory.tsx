import type { ComponentProps } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Alert02Icon,
  Clock01Icon,
  CreditCardIcon,
  MoneyReceiveSquareIcon,
  MoneySendSquareIcon,
  Notification02Icon,
  RepeatIcon,
  ScissorIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

type NoticeCategory = {
  key: string;
  label: string;
  icon: ComponentProps<typeof HugeiconsIcon>["icon"];
};

const card: NoticeCategory = { key: "card", label: "Pago de tarjeta", icon: CreditCardIcon };
const payable: NoticeCategory = { key: "payable", label: "Cuenta por pagar", icon: MoneySendSquareIcon };
const receivable: NoticeCategory = { key: "receivable", label: "Cobro programado", icon: MoneyReceiveSquareIcon };
const subscription: NoticeCategory = { key: "subscription", label: "Suscripción", icon: RepeatIcon };
const cut: NoticeCategory = { key: "cut", label: "Corte de tarjeta", icon: ScissorIcon };
const fallback: NoticeCategory = { key: "notice", label: "Aviso", icon: Notification02Icon };

const categories: Record<string, NoticeCategory> = {
  CARD_PAYMENT: card,
  PAYABLE: payable,
  RECEIVABLE: receivable,
  CASH_SUBSCRIPTION: subscription,
  CARD_SUBSCRIPTION: subscription,
  CUT_CYCLE: cut,
  CUT_CYCLE_UPCOMING: cut,
};

export function getNoticeCategory(type: string) {
  return categories[type] ?? fallback;
}

export function NoticeCategoryBadge({ type }: { type: string }) {
  const category = getNoticeCategory(type);
  return (
    <Badge variant="notice" data-notice-category={category.key}>
      <HugeiconsIcon icon={category.icon} data-icon="inline-start" aria-hidden="true" />
      {category.label}
    </Badge>
  );
}

export function NoticeUrgencyBadge({ group }: { group: string }) {
  if (!["overdue", "today", "upcoming"].includes(group)) return null;
  const overdue = group === "overdue";
  return (
    <Badge variant="notice-urgency" data-notice-urgency={group}>
      <HugeiconsIcon icon={overdue ? Alert02Icon : Clock01Icon} data-icon="inline-start" aria-hidden="true" />
      {overdue ? "Vencido" : group === "today" ? "Hoy" : "Próximo"}
    </Badge>
  );
}
