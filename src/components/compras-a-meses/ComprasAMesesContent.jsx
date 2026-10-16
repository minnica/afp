"use client";

import { useCreationDraft } from "@/hooks/use-creation-draft";
import { useIsMobile } from "@/hooks/use-mobile";

import CreateRecordSurface, { useCreateDialogMode } from "@/components/ui/create-record-surface";

import { ResponsiveSelect } from "@/components/ui/responsive-select";

import { SearchableSelect } from "@/components/ui/searchable-select";

import { useDialogFocus } from "@/hooks/use-dialog-focus";

import { Alert, AlertDescription } from "@/components/ui/alert";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ensureUserSetup } from "@/lib/userSetup";
import { getLatestInstallmentStatement } from "@/lib/calculations/installmentStatements";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogDescription,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DataTable } from "@/components/ui/data-table";
import { TableCell, TableRow } from "@/components/ui/table";
import PageSkeleton from "@/components/layout/PageSkeleton";
import { RecordActions, RecordCard, RecordField, RecordListCard, RecordListToolbar, RecordNote } from "@/components/ui/record-card";
import { Progress } from "@/components/ui/progress";

function getTodayInputValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatMoney(value) {
  const numberValue = Number(value || 0);

  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(numberValue);
}

function formatDate(dateString) {
  return format(new Date(dateString), "d MMM yyyy", { locale: es });
}

function safeDay(year, monthIndex, day) {
  const max = new Date(year, monthIndex + 1, 0).getDate();
  return Math.min(day, max);
}

function getNextPaymentDueDate(purchase) {
  if (purchase.status !== "ACTIVE") return null;
  const card = purchase.card;
  if (!card) return null;

  const { usualCutDay, usualDueDay } = card;
  const pd = new Date(purchase.purchaseDate);
  const pdYear = pd.getUTCFullYear();
  const pdMonthIdx = pd.getUTCMonth();
  const pdDay = pd.getUTCDate();

  // Determine which cycle month the purchase fell into
  let baseCycleYear = pdYear;
  let baseCycleMonthIdx = pdMonthIdx;
  if (pdDay > safeDay(pdYear, pdMonthIdx, usualCutDay)) {
    const next = new Date(Date.UTC(pdYear, pdMonthIdx + 1, 1));
    baseCycleYear = next.getUTCFullYear();
    baseCycleMonthIdx = next.getUTCMonth();
  }

  // Target cycle = base + payments already made
  const paymentsMade = Number(purchase.initialPaymentsMade || 0);
  const statement = getLatestInstallmentStatement(purchase);
  if (statement && statement.paymentNumber >= Number(purchase.months)) return null;
  const target = statement
    ? new Date(Date.UTC(statement.year, statement.month, 1))
    : new Date(Date.UTC(baseCycleYear, baseCycleMonthIdx + paymentsMade, 1));
  const tYear = target.getUTCFullYear();
  const tMonthIdx = target.getUTCMonth();

  // Replicate getCycleDates: if dueDay falls on or before cutDay in same month → next month
  const cutDate = new Date(Date.UTC(tYear, tMonthIdx, safeDay(tYear, tMonthIdx, usualCutDay), 12));
  let dueDate = new Date(Date.UTC(tYear, tMonthIdx, safeDay(tYear, tMonthIdx, usualDueDay), 12));
  if (dueDate <= cutDate) {
    const nm = new Date(Date.UTC(tYear, tMonthIdx + 1, 1));
    dueDate = new Date(Date.UTC(nm.getUTCFullYear(), nm.getUTCMonth(), safeDay(nm.getUTCFullYear(), nm.getUTCMonth(), usualDueDay), 12));
  }

  return dueDate;
}

export default function ComprasAMesesContent() {
  const { captureFocus, restoreFocus } = useDialogFocus();
  const router = useRouter();
  const mobileNavigation = useIsMobile();
  const compactEntry = useCreateDialogMode();
  const [createError, setCreateError] = useState(null);

  const [user, setUser] = useState(null);
  const [cards, setCards] = useState([]);
  const [categories, setCategories] = useState([]);
  const [people, setPeople] = useState([]);
  const [purchases, setPurchases] = useState([]);

  const [cardId, setCardId] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(getTodayInputValue());
  const [concept, setConcept] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [months, setMonths] = useState("");
  const [manualMonthlyPayment, setManualMonthlyPayment] = useState("");
  const [initialPaymentsMade, setInitialPaymentsMade] = useState("0");
  const [personId, setPersonId] = useState("NONE");
  const [categoryId, setCategoryId] = useState("");
  const [notes, setNotes] = useState("");

  useCreationDraft({
    name: "compras-a-meses",
    userId: user?.id,
    enabled: mobileNavigation,
    values: { cardId, purchaseDate, concept, totalAmount, months, manualMonthlyPayment, initialPaymentsMade, personId, categoryId, notes },
    setters: { cardId: setCardId, purchaseDate: setPurchaseDate, concept: setConcept, totalAmount: setTotalAmount, months: setMonths, manualMonthlyPayment: setManualMonthlyPayment, initialPaymentsMade: setInitialPaymentsMade, personId: setPersonId, categoryId: setCategoryId, notes: setNotes },
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingPurchaseId, setEditingPurchaseId] = useState("");
  const [editCardId, setEditCardId] = useState("");
  const [editPurchaseDate, setEditPurchaseDate] = useState("");
  const [editConcept, setEditConcept] = useState("");
  const [editTotalAmount, setEditTotalAmount] = useState("");
  const [editMonths, setEditMonths] = useState("");
  const [editManualMonthlyPayment, setEditManualMonthlyPayment] = useState("");
  const [editInitialPaymentsMade, setEditInitialPaymentsMade] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  const [purchaseToDelete, setPurchaseToDelete] = useState(null);

  async function loadInitialData(userId) {
    const [settingsResponse, cardsResponse, purchasesResponse] =
      await Promise.all([
        fetch(`/api/settings?userId=${userId}`),
        fetch(`/api/cards?userId=${userId}`),
        fetch(`/api/installment-purchases?userId=${userId}`),
      ]);

    const settingsData = await settingsResponse.json();
    const cardsData = await cardsResponse.json();
    const purchasesData = await purchasesResponse.json();

    if (!settingsResponse.ok) {
      throw new Error(settingsData.error || "No se pudo cargar configuración.");
    }

    if (!cardsResponse.ok) {
      throw new Error(cardsData.error || "No se pudieron cargar tarjetas.");
    }

    if (!purchasesResponse.ok) {
      throw new Error(
        purchasesData.error || "No se pudieron cargar compras a meses.",
      );
    }

    setCards(cardsData.cards || []);
    setCategories(settingsData.categories || []);
    setPeople(settingsData.people || []);
    setPurchases(purchasesData.purchases || []);
  }

  async function loadPurchases(userId) {
    const response = await fetch(`/api/installment-purchases?userId=${userId}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "No se pudieron cargar compras a meses.");
    }

    setPurchases(data.purchases || []);
  }

  useEffect(() => {
    async function init() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          router.replace("/login");
          return;
        }

        setUser(session.user);

        await ensureUserSetup(session.user);

        await loadInitialData(session.user.id);
      } catch (err) {
        setError(err.message || "Ocurrió un error.");
      } finally {
        setIsLoading(false);
      }
    }

    init();
  }, [router]);

  async function createPurchase() {
    if (!user || isSaving) return false;

    setCreateError(null);
    setError("");
    setIsSaving(true);

    let saved = false;
    try {
      const response = await fetch("/api/installment-purchases", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: user.id,
          cardId,
          purchaseDate,
          concept,
          totalAmount,
          months,
          manualMonthlyPayment,
          initialPaymentsMade,
          personId: personId === "NONE" ? null : personId,
          categoryId,
          notes,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo guardar la compra.");
      }

      saved = true;
      setConcept("");
      setTotalAmount("");
      setMonths("");
      setManualMonthlyPayment("");
      setInitialPaymentsMade("0");
      setPersonId("NONE");
      setNotes("");

      await loadPurchases(user.id);
      if (!compactEntry) toast.success("Compra guardada exitosamente.");
      return { message: "Compra guardada exitosamente.", type: "success" };
    } catch (err) {
      if (saved) {
        setError("El registro se guardó, pero no se pudo actualizar la lista. Recarga para verlo.");
        if (!compactEntry) toast.success("El registro se guardó; recarga la lista para verlo.");
        return { message: "El registro se guardó; recarga la lista para verlo.", type: "success" };
      }
      setCreateError({ message: err.message || "No se pudo guardar la compra." });
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  function toDateInputValue(dateString) {
    const date = new Date(dateString);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  function startEditingPurchase(purchase) {
    setEditingPurchaseId(purchase.id);
    setEditCardId(purchase.cardId || "");
    setEditPurchaseDate(toDateInputValue(purchase.purchaseDate));
    setEditConcept(purchase.concept || "");
    setEditTotalAmount(String(purchase.totalAmount || ""));
    setEditMonths(String(purchase.months || ""));
    setEditManualMonthlyPayment(
      purchase.manualMonthlyPayment
        ? String(purchase.manualMonthlyPayment)
        : "",
    );
    setEditInitialPaymentsMade(String(purchase.initialPaymentsMade || 0));
    setEditCategoryId(purchase.categoryId || "");
    setEditNotes(purchase.notes || "");
    setEditDialogOpen(true);
  }

  function cancelEditingPurchase() {
    setEditDialogOpen(false);
    setEditingPurchaseId("");
    setEditCardId("");
    setEditPurchaseDate("");
    setEditConcept("");
    setEditTotalAmount("");
    setEditMonths("");
    setEditManualMonthlyPayment("");
    setEditInitialPaymentsMade("");
    setEditCategoryId("");
    setEditNotes("");
  }

  async function updatePurchase() {
    if (!user || !editingPurchaseId) return;

    setError("");
    setIsUpdating(true);

    try {
      const response = await fetch("/api/installment-purchases", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: editingPurchaseId,
          cardId: editCardId,
          purchaseDate: editPurchaseDate,
          concept: editConcept,
          totalAmount: editTotalAmount,
          months: editMonths,
          manualMonthlyPayment: editManualMonthlyPayment,
          initialPaymentsMade: editInitialPaymentsMade,
          categoryId: editCategoryId,
          notes: editNotes,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo actualizar la compra.");
      }

      cancelEditingPurchase();
      await loadPurchases(user.id);
      toast.success("Cambios guardados exitosamente.");
    } catch (err) {
      setError(err.message || "No se pudo actualizar la compra.");
      toast.error(err.message || "No se pudo actualizar la compra.");
    } finally {
      setIsUpdating(false);
    }
  }

  async function deletePurchase(purchaseId) {
    if (!user) return;

    setError("");

    try {
      const response = await fetch(
        `/api/installment-purchases?id=${purchaseId}`,
        {
          method: "DELETE",
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo eliminar la compra.");
      }

      setPurchaseToDelete(null);
      await loadPurchases(user.id);

      toast.success("Compra eliminada exitosamente.");
    } catch (err) {
      setError(err.message || "No se pudo eliminar la compra.");
      toast.error(err.message || "No se pudo eliminar la compra.");
    }
  }

  const activePurchases = useMemo(() => {
    return purchases.filter((purchase) => purchase.status === "ACTIVE");
  }, [purchases]);

  const paidOffPurchases = useMemo(() => {
    return purchases.filter((purchase) => purchase.status === "PAID_OFF");
  }, [purchases]);

  const calculatedMonthlyPayment = useMemo(() => {
    const numericTotal = Number(totalAmount || 0);
    const numericMonths = Number(months || 0);

    if (!numericTotal || !numericMonths) return 0;

    return numericTotal / numericMonths;
  }, [totalAmount, months]);

  const purchaseMobileView = {
    mobileListLabel: "Compras registradas",
    mobileRowSeparator: false,
    renderMobileRow: ({ original: purchase }) => {
      const nextPayment = getNextPaymentDueDate(purchase);
      const statusLabel = { ACTIVE: "Activa", PAID_OFF: "Liquidada", CANCELLED: "Cancelada", ADJUSTED: "Ajustada" }[purchase.status] || purchase.status;
      return (
        <RecordCard
          title={purchase.concept}
          subtitle={purchase.card?.name}
          badges={<Badge variant="outline">{statusLabel}</Badge>}
          amount={formatMoney(purchase.monthlyPaymentUsed)}
          amountLabel="Mensualidad"
          actions={<RecordActions label={`compra: ${purchase.concept}`} onEdit={() => startEditingPurchase(purchase)} onDelete={() => setPurchaseToDelete(purchase)} />}
        >
          {purchase.category?.name ? <Badge variant="secondary" className="h-auto max-w-full whitespace-normal break-words">{purchase.category.name}</Badge> : null}
          <dl className="grid grid-cols-2 gap-3">
            <RecordField label="Saldo pendiente">{formatMoney(purchase.remainingBalance)}</RecordField>
            <RecordField label="Próximo pago">{nextPayment ? format(nextPayment, "d MMM yyyy", { locale: es }) : "Sin próximo pago"}</RecordField>
            <RecordField label="Total de la compra">{formatMoney(purchase.totalAmount)}</RecordField>
            <RecordField label="Fecha de compra">{formatDate(purchase.purchaseDate)}</RecordField>
          </dl>
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">Cuota {purchase.currentMonth} de {purchase.months}</p>
            <Progress value={Math.min(100, Math.max(0, Number(purchase.currentMonth || 0) / Math.max(1, Number(purchase.months)) * 100))} aria-label={`Avance de cuotas: ${purchase.concept}`} aria-valuetext={`Cuota ${purchase.currentMonth} de ${purchase.months}`} />
          </div>
          {purchase.verifiedStatementDate ? <RecordNote>Estado de cuenta: {format(new Date(purchase.verifiedStatementDate + "-01T12:00:00Z"), "MMM yyyy", { locale: es })}</RecordNote> : null}
          {purchase.person?.name ? <RecordNote>Por cobrar a {purchase.person.name}</RecordNote> : null}
          <RecordNote>{purchase.notes}</RecordNote>
        </RecordCard>
      );
    },
    mobileToolbar: (table) => <RecordListToolbar table={table} label="compras" totals={[{ key: "monthlyPaymentUsed", label: "Mensualidades" }, { key: "totalAmount", label: "Total de compras" }, { key: "remainingBalance", label: "Saldo pendiente" }]} />,
  };

  const purchaseColumns = useMemo(
    () => [
      {
        id: "purchaseDate",
        accessorFn: (row) => formatDate(row.purchaseDate),
        sortingFn: (rowA, rowB) =>
          new Date(rowA.original.purchaseDate) -
          new Date(rowB.original.purchaseDate),
        header: "Fecha",
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-sm">
            {formatDate(row.original.purchaseDate)}
          </span>
        ),
      },
      {
        accessorKey: "concept",
        header: "Concepto",
        cell: ({ row }) => {
          const purchase = row.original;
          return (
            <div className="min-w-0">
              <p className="font-medium">{purchase.concept}</p>
              {purchase.verifiedStatementDate ? (
                <p className="text-xs text-muted-foreground">
                  Estado de cuenta: {format(
                    new Date(purchase.verifiedStatementDate + "-01T12:00:00Z"),
                    "MMM yyyy",
                    { locale: es },
                  )}
                </p>
              ) : null}
              {purchase.notes ? (
                <p className="text-xs text-muted-foreground">{purchase.notes}</p>
              ) : null}
              {purchase.person ? (
                <p className="text-xs text-muted-foreground">
                  {purchase.person.name}
                </p>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "card",
        accessorFn: (row) =>
          (row.card?.name ?? "") + " " + (row.category?.name ?? ""),
        header: "Tarjeta",
        cell: ({ row }) => (
          <div>
            <p className="text-sm">{row.original.card?.name ?? "—"}</p>
            {row.original.category?.name ? (
              <Badge variant="outline" className="mt-1">
                {row.original.category.name}
              </Badge>
            ) : null}
          </div>
        ),
      },
      {
        id: "nextPayment",
        accessorFn: (row) => {
          const d = getNextPaymentDueDate(row);
          return d ? format(d, "yyyy-MM-dd") : "";
        },
        sortingFn: (rowA, rowB) => {
          const a = getNextPaymentDueDate(rowA.original);
          const b = getNextPaymentDueDate(rowB.original);
          if (!a && !b) return 0;
          if (!a) return 1;
          if (!b) return -1;
          return a - b;
        },
        header: "Próximo pago",
        cell: ({ row }) => {
          const d = getNextPaymentDueDate(row.original);
          if (!d)
            return (
              <span className="text-sm text-muted-foreground">—</span>
            );
          return (
            <span className="whitespace-nowrap text-sm">
              {format(d, "d MMM yyyy", { locale: es })}
            </span>
          );
        },
      },
      {
        id: "progress",
        accessorFn: (row) => Number(row.months) - Number(row.currentMonth),
        sortingFn: (rowA, rowB) =>
          (Number(rowA.original.months) - Number(rowA.original.currentMonth)) -
          (Number(rowB.original.months) - Number(rowB.original.currentMonth)),
        header: "Progreso",
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-sm text-muted-foreground">
            {row.original.currentMonth}/{row.original.months} meses
          </span>
        ),
      },
      {
        accessorKey: "monthlyPaymentUsed",
        header: "Mensualidad",
        cell: ({ row }) => (
          <span className="whitespace-nowrap font-semibold tabular-nums">
            {formatMoney(row.original.monthlyPaymentUsed)}
          </span>
        ),
      },
      {
        accessorKey: "totalAmount",
        header: "Total compra",
        cell: ({ row }) => (
          <span className="whitespace-nowrap tabular-nums text-muted-foreground">
            {formatMoney(row.original.totalAmount)}
          </span>
        ),
      },
      {
        accessorKey: "remainingBalance",
        header: "Pendiente",
        cell: ({ row }) => (
          <span className="whitespace-nowrap font-semibold tabular-nums">
            {formatMoney(row.original.remainingBalance)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Button aria-label="Editar"
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => startEditingPurchase(row.original)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button aria-label="Eliminar"
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setPurchaseToDelete(row.original)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  function purchasesFooterRow(table) {
    const rows = table.getFilteredRowModel().rows;
    const totalMonthly = rows.reduce(
      (sum, row) => sum + Number(row.original.monthlyPaymentUsed || 0),
      0,
    );
    const totalAmount = rows.reduce(
      (sum, row) => sum + Number(row.original.totalAmount || 0),
      0,
    );
    const totalPending = rows.reduce(
      (sum, row) => sum + Number(row.original.remainingBalance || 0),
      0,
    );
    return (
      <TableRow>
        <TableCell
          colSpan={5}
          className="text-right text-sm font-medium text-muted-foreground"
        >
          Total
        </TableCell>
        <TableCell className="font-semibold tabular-nums">
          {formatMoney(totalMonthly)}
        </TableCell>
        <TableCell className="font-semibold tabular-nums">
          {formatMoney(totalAmount)}
        </TableCell>
        <TableCell className="font-semibold tabular-nums">
          {formatMoney(totalPending)}
        </TableCell>
        <TableCell />
      </TableRow>
    );
  }

  if (isLoading) {
    return <PageSkeleton variant="form-table" mobileCards />;
  }

  return (
    <>
      <AlertDialog
        open={Boolean(purchaseToDelete)}
        onOpenChange={(open) => {
          if (!open) setPurchaseToDelete(null);
        }}
      >
        <AlertDialogContent onCloseAutoFocus={restoreFocus}>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta compra a meses?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará la compra{" "}
              {purchaseToDelete?.concept
                ? `"${purchaseToDelete.concept}"`
                : "seleccionada"}{" "}
              por {formatMoney(purchaseToDelete?.totalAmount || 0)}.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => deletePurchase(purchaseToDelete.id)}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          if (!open) cancelEditingPurchase();
        }}
      >
        <DialogContent onCloseAutoFocus={restoreFocus} className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar compra a meses</DialogTitle>
            <DialogDescription className="sr-only">Actualiza los datos y guarda los cambios.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="compras-ameses-field-1">Tarjeta</Label>
              <ResponsiveSelect
                value={editCardId}
                onValueChange={setEditCardId}
                id="compras-ameses-field-1"
                title="Seleccionar tarjeta"
                placeholder="Selecciona tarjeta"
                options={cards.map(card => ({
                  value: String(card.id),
                  label: String(card.name)
                }))}
                searchable="auto"
                searchPlaceholder="Buscar tarjeta…"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-purchase-date">Fecha de compra</Label>
              <DatePicker
                id="edit-purchase-date"
                aria-label="Fecha de compra"
                value={editPurchaseDate}
                onChange={setEditPurchaseDate}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="compras-ameses-field-2">Concepto</Label>
              <Input
                id="compras-ameses-field-2"
                value={editConcept}
                onChange={(event) => setEditConcept(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="compras-ameses-field-3">Monto total</Label>
              <Input
                id="compras-ameses-field-3"
                type="number"
                formatNumber
                min="0"
                step="0.01"
                value={editTotalAmount}
                onChange={(event) => setEditTotalAmount(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="compras-ameses-field-4">Número de meses</Label>
              <Input
                id="compras-ameses-field-4"
                type="number"
                min="1"
                value={editMonths}
                onChange={(event) => setEditMonths(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="compras-ameses-field-5">Pago mensual manual (opcional)</Label>
              <Input
                id="compras-ameses-field-5"
                type="number"
                formatNumber
                min="0"
                step="0.01"
                value={editManualMonthlyPayment}
                onChange={(event) =>
                  setEditManualMonthlyPayment(event.target.value)
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="compras-ameses-field-6">Pagos ya realizados</Label>
              <Input
                id="compras-ameses-field-6"
                type="number"
                min="0"
                value={editInitialPaymentsMade}
                onChange={(event) =>
                  setEditInitialPaymentsMade(event.target.value)
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="compras-ameses-field-7">Categoría</Label>
              <SearchableSelect
                value={editCategoryId}
                onValueChange={setEditCategoryId}
                id="compras-ameses-field-7"
                title="Seleccionar categoría"
                placeholder="Selecciona categoría"
                searchPlaceholder="Buscar categoría…"
                options={categories.map(item => ({
                  value: item.id,
                  label: item.name
                }))}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="compras-ameses-field-8">Notas</Label>
              <Textarea id="compras-ameses-field-8"
                value={editNotes}
                onChange={(event) => setEditNotes(event.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={cancelEditingPurchase}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={updatePurchase}
              disabled={isUpdating}
            >
              {isUpdating ? "Guardando..." : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <main onClickCapture={captureFocus}>
        <section className={`mx-auto flex w-full max-w-full flex-col px-4 py-5 md:py-8 ${compactEntry ? "pb-28!" : ""}`}>
          {error ? (
            <Alert variant="destructive" className="mb-6">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className={`grid gap-5 ${compactEntry ? "" : "xl:grid-cols-[420px_1fr]"}`}>
            <CreateRecordSurface
              showSaveFeedback
              compact={compactEntry}
              title="Nueva compra"
              saveLabel="Guardar compra"
              error={createError}
              isSaving={isSaving}
              onSubmit={createPurchase}
            >
              <div className="space-y-2">
                <Label htmlFor="compras-ameses-field-9">Tarjeta</Label>
                <ResponsiveSelect
                  value={cardId}
                  onValueChange={setCardId}
                  id="compras-ameses-field-9"
                  title="Seleccionar tarjeta"
                  placeholder="Selecciona tarjeta"
                  options={cards.map(card => ({
                    value: String(card.id),
                    label: String(card.name)
                  }))}
                  searchable="auto"
                  searchPlaceholder="Buscar tarjeta…"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="purchase-date">Fecha de compra</Label>
                <DatePicker
                  id="purchase-date"
                  aria-label="Fecha de compra"
                  value={purchaseDate}
                  onChange={setPurchaseDate}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="compras-ameses-field-10">Concepto</Label>
                <Input
                  id="compras-ameses-field-10"
                  value={concept}
                  placeholder="Ej. Celular, laptop, consola..."
                  onChange={(event) => setConcept(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="compras-ameses-field-11">Monto total</Label>
                <Input
                  id="compras-ameses-field-11"
                  value={totalAmount}
                  type="number"
                  formatNumber
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  onChange={(event) => setTotalAmount(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="compras-ameses-field-12">Número de meses</Label>
                <Input
                  id="compras-ameses-field-12"
                  value={months}
                  type="number"
                  min="1"
                  placeholder="Ej. 12"
                  onChange={(event) => setMonths(event.target.value)}
                />
              </div>

              <div className="rounded-xl border border-border bg-background/50 px-4 py-3">
                <p className="text-sm text-muted-foreground">
                  Pago mensual calculado
                </p>
                <p className="text-xl font-semibold">
                  {formatMoney(calculatedMonthlyPayment)}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="compras-ameses-field-13">Pagos ya realizados</Label>
                <Input
                  id="compras-ameses-field-13"
                  value={initialPaymentsMade}
                  type="number"
                  min="0"
                  placeholder="0"
                  onChange={(event) =>
                    setInitialPaymentsMade(event.target.value)
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="compras-ameses-field-14">Categoría</Label>
                <SearchableSelect
                  value={categoryId}
                  onValueChange={setCategoryId}
                  id="compras-ameses-field-14"
                  title="Seleccionar categoría"
                  placeholder="Selecciona categoría"
                  searchPlaceholder="Buscar categoría…"
                  options={categories.map(item => ({
                    value: item.id,
                    label: item.name
                  }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="compras-ameses-field-15">Persona, si aplica</Label>
                <SearchableSelect
                  value={personId}
                  onValueChange={setPersonId}
                  id="compras-ameses-field-15"
                  title="Seleccionar persona"
                  placeholder="Sin persona"
                  searchPlaceholder="Buscar persona…"
                  options={[{
                    value: "NONE",
                    label: "Sin persona",
                    pinned: true
                  }, ...people.map(item => ({
                    value: item.id,
                    label: item.name
                  }))]}
                />

                {personId !== "NONE" ? (
                  <p className="text-xs text-muted-foreground">
                    Se creará una cuenta por cobrar por el monto total.
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="compras-ameses-field-16">Notas (opcional)</Label>
                <Textarea id="compras-ameses-field-16"
                  value={notes}
                  placeholder="Detalles adicionales..."
                  onChange={(event) => setNotes(event.target.value)}
                />
              </div>
            </CreateRecordSurface>

            <RecordListCard>
              <CardHeader>
                <CardTitle className="text-lg font-semibold uppercase text-center">
                  Compras registradas
                </CardTitle>
              </CardHeader>

              <CardContent>
                <Tabs defaultValue="active" className="w-full">
                  <TabsList className="mb-6">
                    <TabsTrigger value="active">
                      Activas ({activePurchases.length})
                    </TabsTrigger>
                    <TabsTrigger value="paid">
                      Liquidadas ({paidOffPurchases.length})
                    </TabsTrigger>
                    <TabsTrigger value="all">
                      Todas ({purchases.length})
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="active">
                    <DataTable
                      {...purchaseMobileView}
                      columns={purchaseColumns}
                      data={activePurchases}
                      filterGlobal
                      filterPlaceholder="Buscar compra..."
                      pageSize={15}
                      pageSizeOptions={[15, 25, 50, 100]}
                      footerRow={purchasesFooterRow}
                    />
                  </TabsContent>

                  <TabsContent value="paid">
                    <DataTable
                      {...purchaseMobileView}
                      columns={purchaseColumns}
                      data={paidOffPurchases}
                      filterGlobal
                      filterPlaceholder="Buscar compra..."
                      pageSize={15}
                      pageSizeOptions={[15, 25, 50, 100]}
                      footerRow={purchasesFooterRow}
                    />
                  </TabsContent>

                  <TabsContent value="all">
                    <DataTable
                      {...purchaseMobileView}
                      columns={purchaseColumns}
                      data={purchases}
                      filterGlobal
                      filterPlaceholder="Buscar compra..."
                      pageSize={15}
                      pageSizeOptions={[15, 25, 50, 100]}
                      footerRow={purchasesFooterRow}
                    />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </RecordListCard>
          </div>
        </section>
      </main>
    </>
  );
}
