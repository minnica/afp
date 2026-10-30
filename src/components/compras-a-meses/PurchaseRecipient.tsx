import { UserIcon, UserMultipleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@/components/ui/badge";
import { getInstallmentRecipient } from "@/lib/installmentRecipients";
import type { Purchase } from "@/lib/uiTypes";

export default function PurchaseRecipient({ purchase }: { purchase: Purchase }) {
  const recipient = getInstallmentRecipient(purchase);
  return (
    <Badge variant={recipient.isPersonal ? "purchase-personal" : "purchase-other"} className="h-auto max-w-full whitespace-normal break-words">
      <HugeiconsIcon icon={recipient.isPersonal ? UserIcon : UserMultipleIcon} aria-hidden="true" />
      {recipient.label}
    </Badge>
  );
}
