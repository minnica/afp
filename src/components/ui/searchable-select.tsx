"use client"

import type * as React from "react";

import { ResponsiveSelect } from "@/components/ui/responsive-select";

// Conserva el contrato de los catálogos; adapta la búsqueda a su tamaño.
function SearchableSelect(props: React.ComponentProps<typeof ResponsiveSelect>) {
  return <ResponsiveSelect {...props} searchable="auto" sortOptions />
}

export { SearchableSelect };
