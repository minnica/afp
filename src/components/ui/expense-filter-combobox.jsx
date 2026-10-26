"use client";

import { useId, useMemo, useState } from "react";
import {
  Combobox, ComboboxChip, ComboboxChips, ComboboxChipsInput, ComboboxClear,
  ComboboxCollection, ComboboxContent, ComboboxEmpty, ComboboxGroup,
  ComboboxItem, ComboboxLabel, ComboboxList, ComboboxValue, useComboboxAnchor,
} from "@/components/ui/combobox";
import { Field, FieldLabel } from "@/components/ui/field";
import { normalizeExpenseSearch, parseExpenseAmountSearch } from "@/lib/expenseFilters";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const collator = new Intl.Collator("es", { sensitivity: "base", numeric: true });
const labels = { category: "Categorías", payment: "Métodos de pago", concept: "Conceptos", amount: "Montos exactos" };
const chipLabels = { category: "Categoría", payment: "Pago", concept: "Concepto", amount: "Monto" };

function option(type, value, label) {
  return { id: `${type}:${normalizeExpenseSearch(value)}`, type, value: String(value), label };
}

export function ExpenseFilterCombobox({ categories, cards, moneyAccounts = [], expenses, value, onValueChange }) {
  const [query, setQuery] = useState("");
  const anchor = useComboboxAnchor();
  const id = useId();
  const groups = useMemo(() => {
    const options = [
      ...categories.map((category) => option("category", category.id, category.name)),
      option("payment", "CASH", "Efectivo"),
      option("payment", "DEBIT", "Débito"),
      ...moneyAccounts.map(a => option("payment", `DEBIT:${a.id}`, `Débito · ${a.name}`)),
      ...cards.map((card) => option("payment", card.id, card.name)),
      ...expenses.map((expense) => option("concept", expense.concept, expense.concept)),
      ...expenses.map((expense) => {
        const cents = Math.round(Number(expense.amount || 0) * 100);
        return option("amount", cents, money.format(cents / 100));
      }),
      ...value,
    ];
    const search = normalizeExpenseSearch(query);
    const unique = new Map(options.map((item) => [item.id, item]));
    let matching = [...unique.values()].filter((item) => search.split(/\s+/).every((word) =>
      normalizeExpenseSearch(`${item.label} ${chipLabels[item.type]}`).includes(word),
    ));
    if (query.trim()) {
      const concept = option("concept", query.trim(), query.trim());
      matching = [concept, ...matching.filter((item) => item.id !== concept.id)];
      const cents = parseExpenseAmountSearch(query);
      if (cents !== null) {
        const amount = option("amount", cents, money.format(cents / 100));
        matching = [amount, ...matching.filter((item) => item.id !== amount.id)];
      }
    }
    return Object.entries(labels).map(([type, label]) => ({
      type, label,
      items: matching.filter((item) => item.type === type).sort((a, b) => type === "amount"
        ? Number(a.value) - Number(b.value) : collator.compare(a.label, b.label)),
    })).filter((group) => group.items.length);
  }, [categories, cards, moneyAccounts, expenses, query, value]);

  return (
    <Field>
      <FieldLabel htmlFor={id} className="sr-only max-w-px">Buscar y filtrar gastos</FieldLabel>
      <span id={`${id}-help`} className="sr-only max-w-px">
        Busca categorías, tarjetas, conceptos o montos y selecciona los filtros.
        Las selecciones del mismo tipo son alternativas; los distintos tipos se combinan.
      </span>
      <Combobox
        multiple
        items={groups}
        filter={null}
        value={value}
        onValueChange={(next, details) => {
          // Escape cierra la consulta; quitar filtros requiere una acción explícita.
          if (details.reason === "escape-key") { details.cancel(); return; }
          onValueChange(next);
          setQuery("");
        }}
        inputValue={query}
        onInputValueChange={setQuery}
        itemToStringLabel={(item) => item.label}
        itemToStringValue={(item) => item.id}
        isItemEqualToValue={(item, selected) => item.id === selected.id}
      >
        <ComboboxChips ref={anchor} className="expense-filter-combobox min-w-0">
          <ComboboxValue>
            {(selected) => <>
              {selected.map((item) => (
                <ComboboxChip key={item.id} removeLabel={`Quitar ${chipLabels[item.type].toLowerCase()}: ${item.label}`}>
                  <span className="min-w-0 truncate" title={`${chipLabels[item.type]}: ${item.label}`}>{chipLabels[item.type]}: {item.label}</span>
                </ComboboxChip>
              ))}
              <ComboboxChipsInput id={id} aria-label="Buscar y filtrar gastos" aria-describedby={`${id}-help`} placeholder={selected.length ? "Añadir filtro…" : "Buscar y filtrar gastos…"} autoComplete="off" autoCorrect="off" spellCheck={false} />
            </>}
          </ComboboxValue>
          <ComboboxClear aria-label="Limpiar filtros" className="shrink-0" />
        </ComboboxChips>
        <ComboboxContent anchor={anchor} className="expense-filter-options">
          <ComboboxEmpty>Sin opciones disponibles.</ComboboxEmpty>
          <ComboboxList>
            {(group) => (
              <ComboboxGroup key={group.type} items={group.items}>
                <ComboboxLabel>{group.label}</ComboboxLabel>
                <ComboboxCollection>
                  {(item) => <ComboboxItem key={item.id} value={item}>
                    <span className="min-w-0 break-words pr-5">{item.type === "concept" ? `Contiene “${item.label}”` : item.label}</span>
                  </ComboboxItem>}
                </ComboboxCollection>
              </ComboboxGroup>
            )}
          </ComboboxList>
          <p className="px-3 py-2 text-sm text-muted-foreground">Selecciona una opción para filtrar. Puedes añadir más de una.</p>
        </ComboboxContent>
      </Combobox>
    </Field>
  );
}
