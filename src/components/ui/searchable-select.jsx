"use client"

import { ResponsiveSelect } from "@/components/ui/responsive-select"

// Conserva el contrato de los catálogos; adapta la búsqueda a su tamaño.
function SearchableSelect(props) {
  return <ResponsiveSelect {...props} searchable="auto" sortOptions />
}

export { SearchableSelect }
