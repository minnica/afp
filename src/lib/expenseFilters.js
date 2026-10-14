export function normalizeExpenseSearch(value) {
  return String(value || "").normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("es").trim();
}

export function parseExpenseAmountSearch(value) {
  const input = String(value).trim().replace(/^\$\s*/, "");
  // Formato MXN: 1250.50 o 1,250.50; no acepta números incompletos o ambiguos.
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(input)) return null;
  const number = Number(input.replaceAll(",", ""));
  const cents = Math.round(number * 100);
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : null;
}

export function matchesExpenseFilters(expense, filters) {
  const groups = new Map();
  for (const filter of filters) {
    if (!groups.has(filter.type)) groups.set(filter.type, []);
    groups.get(filter.type).push(filter.value);
  }
  // Alternativas dentro de un campo; intersección entre campos distintos.
  return [...groups].every(([type, values]) => values.some((value) => {
    if (type === "category") return expense.categoryId === value;
    if (type === "payment") return value === "CASH"
      ? expense.paymentMethod === "CASH"
      : expense.paymentMethod === "CARD" && expense.cardId === value;
    if (type === "concept") return normalizeExpenseSearch(expense.concept).includes(normalizeExpenseSearch(value));
    if (type === "amount") return Math.round(Number(expense.amount || 0) * 100) === Number(value);
    return false;
  }));
}
