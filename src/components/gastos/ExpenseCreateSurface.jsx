"use client"

import CreateRecordSurface, { useCreateDialogMode } from "@/components/ui/create-record-surface"

export const useExpenseDialogMode = useCreateDialogMode

export default function ExpenseCreateSurface({ isOnline, ...props }) {
  return <CreateRecordSurface
    {...props}
    title="Nuevo gasto"
    saveLabel="Guardar gasto"
    description="Guarda un gasto y continúa con el siguiente."
    errorId="create-expense-error"
    actionSlot="expense-create-action"
    showSavingOverlay
    showSaveFeedback
    savingOverlayLabel="Guardando gasto"
    notice={!isOnline ? "Sin conexión. El gasto quedará pendiente hasta recuperar internet." : undefined}
  />
}
