"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
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
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DataTable } from "@/components/ui/data-table";
import { TableCell, TableRow } from "@/components/ui/table";
import { Spinner } from "@/components/ui/spinner";

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
  const target = new Date(Date.UTC(baseCycleYear, baseCycleMonthIdx + paymentsMade, 1));
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
  const router = useRouter();

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

        await fetch("/api/setup-user", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId: session.user.id,
            email: session.user.email,
          }),
        });

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
    if (!user) return;

    setError("");
    setIsSaving(true);

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

      setConcept("");
      setTotalAmount("");
      setMonths("");
      setManualMonthlyPayment("");
      setInitialPaymentsMade("0");
      setPersonId("NONE");
      setCategoryId("");
      setNotes("");

      await loadPurchases(user.id);
      toast.success("Compra guardada exitosamente.");
    } catch (err) {
      setError(err.message || "No se pudo guardar la compra.");
      toast.error(err.message || "No se pudo guardar la compra.");
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
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => startEditingPurchase(row.original)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
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
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background text-foreground">
        <Spinner className="size-8" />
      </main>
    );
  }

  return (
    <>
      <AlertDialog
        open={Boolean(purchaseToDelete)}
        onOpenChange={(open) => {
          if (!open) setPurchaseToDelete(null);
        }}
      >
        <AlertDialogContent>
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
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar compra a meses</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Tarjeta</Label>
              <Select value={editCardId} onValueChange={setEditCardId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona tarjeta" />
                </SelectTrigger>
                <SelectContent>
                  {cards.map((card) => (
                    <SelectItem key={card.id} value={card.id}>
                      {card.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Fecha de compra</Label>
              <Input
                type="date"
                value={editPurchaseDate}
                onChange={(event) => setEditPurchaseDate(event.target.value)}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Concepto</Label>
              <Input
                value={editConcept}
                onChange={(event) => setEditConcept(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Monto total</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={editTotalAmount}
                onChange={(event) => setEditTotalAmount(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Número de meses</Label>
              <Input
                type="number"
                min="1"
                value={editMonths}
                onChange={(event) => setEditMonths(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Pago mensual manual (opcional)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={editManualMonthlyPayment}
                onChange={(event) =>
                  setEditManualMonthlyPayment(event.target.value)
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Pagos ya realizados</Label>
              <Input
                type="number"
                min="0"
                value={editInitialPaymentsMade}
                onChange={(event) =>
                  setEditInitialPaymentsMade(event.target.value)
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Categoría</Label>
              <Select
                value={editCategoryId}
                onValueChange={setEditCategoryId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona categoría" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Notas</Label>
              <Textarea
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

      <main>
        <section className="mx-auto flex w-full max-w-full flex-col px-4 py-5 md:py-8">
          {error ? (
            <div className="mb-6 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
            <Card className="rounded-2xl border-border bg-card">
              <CardHeader>
                <CardTitle className="text-lg font-semibold uppercase text-center">
                  Nueva compra
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label>Tarjeta</Label>
                  <Select value={cardId} onValueChange={setCardId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona tarjeta" />
                    </SelectTrigger>
                    <SelectContent>
                      {cards.map((card) => (
                        <SelectItem key={card.id} value={card.id}>
                          {card.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Fecha de compra</Label>
                  <Input
                    type="date"
                    value={purchaseDate}
                    onChange={(event) => setPurchaseDate(event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Concepto</Label>
                  <Input
                    value={concept}
                    placeholder="Ej. Celular, laptop, consola..."
                    onChange={(event) => setConcept(event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Monto total</Label>
                  <Input
                    value={totalAmount}
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    onChange={(event) => setTotalAmount(event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Número de meses</Label>
                  <Input
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
                  <Label>Pagos ya realizados</Label>
                  <Input
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
                  <Label>Categoría</Label>
                  <Select value={categoryId} onValueChange={setCategoryId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona categoría" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Persona, si aplica</Label>
                  <Select value={personId} onValueChange={setPersonId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sin persona" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">Sin persona</SelectItem>
                      {people.map((person) => (
                        <SelectItem key={person.id} value={person.id}>
                          {person.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {personId !== "NONE" ? (
                    <p className="text-xs text-muted-foreground">
                      Se creará una cuenta por cobrar por el monto total.
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label>Notas (opcional)</Label>
                  <Textarea
                    value={notes}
                    placeholder="Detalles adicionales..."
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </div>

                <Button
                  type="button"
                  className="w-full"
                  onClick={createPurchase}
                  disabled={isSaving}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {isSaving ? "Guardando..." : "Guardar compra"}
                </Button>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-border bg-card">
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
                      columns={purchaseColumns}
                      data={activePurchases}
                      filterGlobal
                      filterPlaceholder="Buscar en tabla..."
                      pageSize={15}
                      pageSizeOptions={[15, 25, 50, 100]}
                      footerRow={purchasesFooterRow}
                    />
                  </TabsContent>

                  <TabsContent value="paid">
                    <DataTable
                      columns={purchaseColumns}
                      data={paidOffPurchases}
                      filterGlobal
                      filterPlaceholder="Buscar en tabla..."
                      pageSize={15}
                      pageSizeOptions={[15, 25, 50, 100]}
                      footerRow={purchasesFooterRow}
                    />
                  </TabsContent>

                  <TabsContent value="all">
                    <DataTable
                      columns={purchaseColumns}
                      data={purchases}
                      filterGlobal
                      filterPlaceholder="Buscar en tabla..."
                      pageSize={15}
                      pageSizeOptions={[15, 25, 50, 100]}
                      footerRow={purchasesFooterRow}
                    />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
    </>
  );
}

