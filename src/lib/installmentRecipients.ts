import type { Purchase } from "@/lib/uiTypes";

type RecipientPurchase = Pick<Purchase, "person" | "personId" | "receivableAccount" | "receivableAccountId">;

export function getInstallmentRecipient(purchase: RecipientPurchase) {
  const person = purchase.receivableAccount?.person ?? purchase.person;
  const isPersonal = !person && !purchase.personId && !purchase.receivableAccountId;
  return {
    isPersonal,
    personId: person?.id ?? purchase.personId,
    label: isPersonal ? "Para mí" : person ? `Para ${person.name}` : "Para otra persona",
  };
}

export function matchesInstallmentRecipient(purchase: RecipientPurchase, filter: string) {
  const recipient = getInstallmentRecipient(purchase);
  if (filter === "personal") return recipient.isPersonal;
  if (filter === "others") return !recipient.isPersonal;
  if (filter.startsWith("person:")) return filter === `person:${recipient.personId}`;
  return true;
}
