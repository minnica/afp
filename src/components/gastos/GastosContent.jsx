"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { Spinner } from "@/components/ui/spinner";
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
import { Separator } from "@/components/ui/separator";
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

function formatMonthLabel(yearMonth) {
  const [year, month] = yearMonth.split("-").map(Number);
  const label = format(new Date(year, month - 1, 1), "MMMM yyyy", { locale: es });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatExpenseDate(dateString) {
  const datePart = String(dateString).split("T")[0];
  const [year, month, day] = datePart.split("-").map(Number);
  return format(new Date(year, month - 1, day), "d MMM yyyy", { locale: es });
}

function getPaymentMethodLabel(paymentMethod) {
  if (paymentMethod === "CARD") return "Tarjeta";
  return "Efectivo";
}

export default function GastosContent() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [categories, setCategories] = useState([]);
  const [cards, setCards] = useState([]);
  const [expenses, setExpenses] = useState([]);

  const [date, setDate] = useState(getTodayInputValue());
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [cardId, setCardId] = useState("");
  const [concept, setConcept] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [notes, setNotes] = useState("");

  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const [people, setPeople] = useState([]);
  const [receivables, setReceivables] = useState([]);
  const [payables, setPayables] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);

  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [personId, setPersonId] = useState("");
  const [receivableMode, setReceivableMode] = useState("CREATE");
  const [receivableAccountId, setReceivableAccountId] = useState("");
  const [payableAccountId, setPayableAccountId] = useState("NONE");
  const [subscriptionId, setSubscriptionId] = useState("NONE");

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editPaymentMethod, setEditPaymentMethod] = useState("CASH");
  const [editCardId, setEditCardId] = useState("");
  const [editConcept, setEditConcept] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editSubscriptionId, setEditSubscriptionId] = useState("NONE");

  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [expenseToDelete, setExpenseToDelete] = useState(null);

  const [filterMonth, setFilterMonth] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [filterCategoryId, setFilterCategoryId] = useState("");
  const [filterConcept, setFilterConcept] = useState("");

  async function loadInitialData(userId) {
    const [settingsResponse, cardsResponse, expensesResponse] =
      await Promise.all([
        fetch(`/api/settings?userId=${userId}`),
        fetch(`/api/cards?userId=${userId}`),
        fetch(buildExpensesUrl(userId)),
      ]);

    const settingsData = await settingsResponse.json();
    const cardsData = await cardsResponse.json();
    const expensesData = await expensesResponse.json();

    if (!settingsResponse.ok) {
      throw new Error(
        settingsData.error || "No se pudieron cargar categorías.",
      );
    }

    if (!cardsResponse.ok) {
      throw new Error(cardsData.error || "No se pudieron cargar tarjetas.");
    }

    if (!expensesResponse.ok) {
      throw new Error(expensesData.error || "No se pudieron cargar gastos.");
    }

    setCategories(settingsData.categories || []);
    setPeople(settingsData.people || []);
    setCards(cardsData.cards || []);
    setExpenses(expensesData.expenses || []);

    const receivablesResponse = await fetch(
      `/api/receivables?userId=${userId}`,
    );
    const receivablesData = await receivablesResponse.json();

    if (!receivablesResponse.ok) {
      throw new Error(
        receivablesData.error || "No se pudieron cargar cuentas por cobrar.",
      );
    }

    setReceivables(receivablesData.receivables || []);

    const payablesResponse = await fetch(`/api/payables?userId=${userId}`);
    const payablesData = await payablesResponse.json();

    if (!payablesResponse.ok) {
      throw new Error(
        payablesData.error || "No se pudieron cargar cuentas por pagar.",
      );
    }

    setPayables(payablesData.payables || []);

    const subscriptionsResponse = await fetch(
      `/api/subscriptions?userId=${userId}`,
    );
    const subscriptionsData = await subscriptionsResponse.json();

    if (!subscriptionsResponse.ok) {
      throw new Error(
        subscriptionsData.error || "No se pudieron cargar suscripciones.",
      );
    }

    setSubscriptions(subscriptionsData.subscriptions || []);
  }

  function buildExpensesUrl(userId) {
    return `/api/expenses?userId=${userId}`;
  }

  async function loadExpenses(userId) {
    const response = await fetch(buildExpensesUrl(userId));
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "No se pudieron cargar gastos.");
    }

    setExpenses(data.expenses || []);
  }

  async function loadReceivables(userId) {
    const response = await fetch(`/api/receivables?userId=${userId}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || "No se pudieron cargar cuentas por cobrar.",
      );
    }

    setReceivables(data.receivables || []);
  }

  async function loadPayables(userId) {
    const response = await fetch(`/api/payables?userId=${userId}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "No se pudieron cargar cuentas por pagar.");
    }

    setPayables(data.payables || []);
  }

  async function loadSubscriptions(userId) {
    const response = await fetch(`/api/subscriptions?userId=${userId}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "No se pudieron cargar suscripciones.");
    }

    setSubscriptions(data.subscriptions || []);
  }

  useEffect(() => {
    async function checkSession() {
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
        setIsCheckingSession(false);
      }
    }

    checkSession();
  }, [router]);

  async function createExpense() {
    if (!user) return;

    if (!concept.trim()) {
      setError("El concepto es requerido.");
      return;
    }
    if (!amount || Number(amount) <= 0) {
      setError("El monto debe ser mayor a 0.");
      return;
    }

    setError("");
    setIsSaving(true);

    try {
      const response = await fetch("/api/expenses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: user.id,
          date,
          paymentMethod,
          cardId,
          concept,
          amount,
          categoryId,
          notes,
          personId,
          receivableAccountId:
            payableAccountId === "NONE" && receivableMode === "EXISTING"
              ? receivableAccountId
              : null,
          payableAccountId:
            payableAccountId === "NONE" ? null : payableAccountId,
          subscriptionId: subscriptionId === "NONE" ? null : subscriptionId,
          createReceivable: Boolean(
            personId &&
            receivableMode === "CREATE" &&
            payableAccountId === "NONE",
          ),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo guardar el gasto.");
      }

      setConcept("");
      setAmount("");
      setNotes("");
      setShowMoreOptions(false);
      setPersonId("");
      setReceivableMode("CREATE");
      setReceivableAccountId("");
      setPayableAccountId("NONE");
      setSubscriptionId("NONE");
      await loadExpenses(user.id);
      await loadReceivables(user.id);
      await loadPayables(user.id);
      toast.success("Gasto guardado exitosamente.");
    } catch (err) {
      setError(err.message || "No se pudo guardar el gasto.");
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

  function startEditingExpense(expense) {
    setEditingExpenseId(expense.id);
    setEditDate(toDateInputValue(expense.date));
    setEditPaymentMethod(expense.paymentMethod);
    setEditCardId(expense.cardId || "");
    setEditConcept(expense.concept || "");
    setEditAmount(String(expense.amount || ""));
    setEditCategoryId(expense.categoryId || "");
    setEditNotes(expense.notes || "");
    setEditSubscriptionId(expense.subscriptionId || "NONE");
    setEditDialogOpen(true);
  }

  function cancelEditingExpense() {
    setEditDialogOpen(false);
    setEditingExpenseId("");
    setEditDate("");
    setEditPaymentMethod("CASH");
    setEditCardId("");
    setEditConcept("");
    setEditAmount("");
    setEditCategoryId("");
    setEditNotes("");
    setEditSubscriptionId("NONE");
  }

  async function updateExpense() {
    if (!user || !editingExpenseId) return;

    setError("");
    setIsUpdating(true);

    try {
      const response = await fetch("/api/expenses", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: editingExpenseId,
          date: editDate,
          paymentMethod: editPaymentMethod,
          cardId: editCardId,
          concept: editConcept,
          amount: editAmount,
          categoryId: editCategoryId,
          notes: editNotes,
          subscriptionId:
            editSubscriptionId === "NONE" ? null : editSubscriptionId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo actualizar el gasto.");
      }

      cancelEditingExpense();
      await loadExpenses(user.id);
      toast.success("Cambios guardados exitosamente.");
    } catch (err) {
      setError(err.message || "No se pudo actualizar el gasto.");
    } finally {
      setIsUpdating(false);
    }
  }

  async function deleteExpense(expenseId) {
    if (!user) return;

    setError("");
    setIsDeleting(true);

    try {
      const response = await fetch(`/api/expenses?id=${expenseId}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo eliminar el gasto.");
      }

      setExpenseToDelete(null);
      await loadExpenses(user.id);

      toast.success("Gasto eliminado exitosamente.");
    } catch (err) {
      setError(err.message || "No se pudo eliminar el gasto.");
    } finally {
      setIsDeleting(false);
    }
  }

  const availableMonths = useMemo(() => {
    const months = new Set();
    expenses.forEach((expense) => {
      const datePart = String(expense.date).split("T")[0];
      const [year, month] = datePart.split("-");
      months.add(`${year}-${month}`);
    });
    return Array.from(months).sort().reverse();
  }, [expenses]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter((expense) => {
      const datePart = String(expense.date).split("T")[0];
      if (filterDate) {
        if (datePart !== filterDate) return false;
      } else if (filterMonth) {
        const [year, month] = datePart.split("-");
        if (`${year}-${month}` !== filterMonth) return false;
      }
      if (filterCategoryId) {
        if (expense.categoryId !== filterCategoryId) return false;
      }
      if (filterConcept) {
        const search = filterConcept.toLowerCase();
        if (!expense.concept?.toLowerCase().includes(search)) return false;
      }
      return true;
    });
  }, [expenses, filterMonth, filterDate, filterCategoryId, filterConcept]);

  const expenseColumns = useMemo(
    () => [
      {
        id: "date",
        accessorFn: (row) => formatExpenseDate(row.date),
        sortingFn: (rowA, rowB) =>
          new Date(rowA.original.date) - new Date(rowB.original.date),
        header: "Fecha",
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-sm">
            {formatExpenseDate(row.original.date)}
          </span>
        ),
      },
      {
        accessorKey: "concept",
        header: "Concepto",
        cell: ({ row }) => {
          const expense = row.original;
          return (
            <div className="min-w-0">
              <p className="font-medium">{expense.concept}</p>
              {expense.notes ? (
                <p className="text-xs text-muted-foreground">{expense.notes}</p>
              ) : null}
              {expense.person ? (
                <p className="text-xs text-muted-foreground">
                  {expense.person.name}
                  {expense.receivableAccount
                    ? ` · ${expense.receivableAccount.concept}`
                    : ""}
                </p>
              ) : null}
              {expense.payableAccount ? (
                <p className="text-xs text-muted-foreground">
                  Pagar: {expense.payableAccount.concept}
                </p>
              ) : null}
              {expense.subscription ? (
                <p className="text-xs text-muted-foreground">
                  {expense.subscription.name}
                </p>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "category",
        accessorFn: (row) => row.category?.name ?? "",
        header: "Categoría",
        cell: ({ row }) =>
          row.original.category?.name ? (
            <Badge variant="secondary">{row.original.category.name}</Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: "paymentMethod",
        accessorFn: (row) =>
          getPaymentMethodLabel(row.paymentMethod) +
          (row.card ? ` · ${row.card.name}` : ""),
        header: "Método",
        cell: ({ row }) => (
          <span className="text-sm">
            {getPaymentMethodLabel(row.original.paymentMethod)}
            {row.original.card ? (
              <span className="text-muted-foreground">
                {" "}· {row.original.card.name}
              </span>
            ) : null}
          </span>
        ),
      },
      {
        accessorKey: "amount",
        header: "Monto",
        cell: ({ row }) => (
          <span className="whitespace-nowrap font-semibold tabular-nums">
            {formatMoney(row.original.amount)}
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
              aria-label="Editar gasto"
              onClick={() => startEditingExpense(row.original)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Eliminar gasto"
              onClick={() => setExpenseToDelete(row.original)}
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

  if (isCheckingSession) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background text-foreground">
        <Spinner className="size-8" />
      </main>
    );
  }

  return (
    <>
      <AlertDialog
        open={Boolean(expenseToDelete)}
        onOpenChange={(open) => {
          if (!open) setExpenseToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este gasto?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará el gasto{" "}
              {expenseToDelete?.concept
                ? `"${expenseToDelete.concept}"`
                : "seleccionado"}{" "}
              por {formatMoney(expenseToDelete?.amount || 0)}.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-800 text-white hover:bg-red-900 focus:ring-red-300"
              disabled={isDeleting}
              onClick={() => deleteExpense(expenseToDelete.id)}
            >
              {isDeleting ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={editDialogOpen} onOpenChange={(open) => { if (!open) cancelEditingExpense(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar gasto</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-date">Fecha</Label>
              <Input
                id="edit-date"
                type="date"
                value={editDate}
                onChange={(event) => setEditDate(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-paymentMethod">Método</Label>
              <Select
                value={editPaymentMethod}
                onValueChange={(value) => {
                  setEditPaymentMethod(value);

                  if (value === "CASH") {
                    setEditCardId("");
                  }
                }}
              >
                <SelectTrigger id="edit-paymentMethod">
                  <SelectValue placeholder="Selecciona método" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Efectivo</SelectItem>
                  <SelectItem value="CARD">Tarjeta</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {editPaymentMethod === "CARD" ? (
              <div className="space-y-2">
                <Label htmlFor="edit-cardId">Tarjeta</Label>
                <Select value={editCardId} onValueChange={setEditCardId}>
                  <SelectTrigger id="edit-cardId">
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
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="edit-concept">Concepto</Label>
              <Input
                id="edit-concept"
                value={editConcept}
                onChange={(event) => setEditConcept(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-amount">Monto</Label>
              <Input
                id="edit-amount"
                type="number"
                min="0"
                step="0.01"
                value={editAmount}
                onChange={(event) => setEditAmount(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-categoryId">Categoría</Label>
              <Select value={editCategoryId} onValueChange={setEditCategoryId}>
                <SelectTrigger id="edit-categoryId">
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
              <Label htmlFor="edit-subscriptionId">Suscripción relacionada</Label>
              <Select
                value={editSubscriptionId}
                onValueChange={setEditSubscriptionId}
              >
                <SelectTrigger id="edit-subscriptionId">
                  <SelectValue placeholder="Selecciona suscripción" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Sin suscripción</SelectItem>
                  {subscriptions
                    .filter(
                      (subscription) => subscription.paymentMethod === "CASH",
                    )
                    .map((subscription) => (
                      <SelectItem key={subscription.id} value={subscription.id}>
                        {subscription.name} · {formatMoney(subscription.amount)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="edit-notes">Notas</Label>
              <Textarea
                id="edit-notes"
                value={editNotes}
                onChange={(event) => setEditNotes(event.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={cancelEditingExpense}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={updateExpense}
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

          <div className="grid min-w-0 gap-5 xl:grid-cols-[360px_1fr]">
            <Card className="rounded-2xl border-border bg-card">
              <CardHeader>
                <CardTitle className="text-lg font-semibold uppercase text-center">
                  Nuevo gasto
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-4 md:space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="date">Fecha</Label>
                  <Input
                    id="date"
                    type="date"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="paymentMethod">Método de pago</Label>
                  <Select
                    value={paymentMethod}
                    onValueChange={(value) => {
                      setPaymentMethod(value);

                      if (value === "CASH") {
                        setCardId("");
                      }
                    }}
                  >
                    <SelectTrigger id="paymentMethod">
                      <SelectValue placeholder="Selecciona método" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CASH">Efectivo</SelectItem>
                      <SelectItem value="CARD">Tarjeta</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {paymentMethod === "CARD" ? (
                  <div className="space-y-2">
                    <Label htmlFor="cardId">Tarjeta</Label>
                    <Select value={cardId} onValueChange={setCardId}>
                      <SelectTrigger id="cardId">
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

                    {cards.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Aún no tienes tarjetas. Agrégalas en la pantalla
                        Tarjetas.
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <div className="space-y-2">
                  <Label htmlFor="concept">Concepto</Label>
                  <Input
                    id="concept"
                    value={concept}
                    placeholder="Ej. Tacos, Uber, Cine..."
                    onChange={(event) => setConcept(event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="amount">Monto</Label>
                  <Input
                    id="amount"
                    value={amount}
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    onChange={(event) => setAmount(event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="categoryId">Categoría</Label>
                  <Select value={categoryId} onValueChange={setCategoryId}>
                    <SelectTrigger id="categoryId">
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
                  <Label htmlFor="notes">Notas (opcional)</Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    placeholder="Algún detalle adicional..."
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </div>

                <div className="rounded-xl border border-border bg-background/50 p-4">
                  <button
                    type="button"
                    className="flex w-full cursor-pointer items-center justify-between text-left text-sm font-medium"
                    aria-expanded={showMoreOptions}
                    onClick={() => setShowMoreOptions((current) => !current)}
                  >
                    <span>Más opciones</span>
                    <span className="text-muted-foreground">
                      {showMoreOptions ? "Ocultar" : "Mostrar"}
                    </span>
                  </button>

                  {showMoreOptions ? (
                    <div className="mt-4 space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="personId">Persona relacionada</Label>
                        <Select
                          value={personId || "NONE"}
                          onValueChange={(value) => {
                            const nextValue = value === "NONE" ? "" : value;
                            setPersonId(nextValue);

                            if (!nextValue) {
                              setReceivableMode("CREATE");
                              setReceivableAccountId("");
                            }
                          }}
                        >
                          <SelectTrigger id="personId">
                            <SelectValue placeholder="Selecciona persona" />
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

                        {people.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            Puedes agregar personas en Configuración.
                          </p>
                        ) : null}
                      </div>

                      {personId ? (
                        <>
                          <div className="space-y-2">
                            <Label htmlFor="receivableMode">Cuenta por cobrar</Label>
                            <Select
                              value={receivableMode}
                              onValueChange={(value) => {
                                setReceivableMode(value);

                                if (value === "CREATE") {
                                  setReceivableAccountId("");
                                }
                              }}
                            >
                              <SelectTrigger id="receivableMode">
                                <SelectValue placeholder="Selecciona opción" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="CREATE">
                                  Crear nueva automáticamente
                                </SelectItem>
                                <SelectItem value="EXISTING">
                                  Vincular a existente
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {receivableMode === "EXISTING" ? (
                            <div className="space-y-2">
                              <Label htmlFor="receivableAccountId">Cuenta existente</Label>
                              <Select
                                value={receivableAccountId}
                                onValueChange={setReceivableAccountId}
                              >
                                <SelectTrigger id="receivableAccountId">
                                  <SelectValue placeholder="Selecciona cuenta por cobrar" />
                                </SelectTrigger>
                                <SelectContent>
                                  {receivables
                                    .filter(
                                      (item) => item.personId === personId,
                                    )
                                    .map((item) => (
                                      <SelectItem key={item.id} value={item.id}>
                                        {item.concept} · pendiente{" "}
                                        {formatMoney(item.pendingBalance)}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>

                              {receivables.filter(
                                (item) => item.personId === personId,
                              ).length === 0 ? (
                                <p className="text-xs text-muted-foreground">
                                  Esta persona no tiene cuentas por cobrar
                                  activas.
                                </p>
                              ) : null}
                            </div>
                          ) : null}

                          <div className="space-y-2">
                            <Label htmlFor="payableAccountId">Cuenta por pagar relacionada</Label>
                            <Select
                              value={payableAccountId}
                              onValueChange={setPayableAccountId}
                            >
                              <SelectTrigger id="payableAccountId">
                                <SelectValue placeholder="Selecciona cuenta por pagar" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="NONE">
                                  Sin cuenta por pagar
                                </SelectItem>
                                {payables
                                  .filter((item) => {
                                    const pendingBalance = Number(
                                      item.pendingBalance || 0,
                                    );
                                    return (
                                      item.status === "ACTIVE" &&
                                      pendingBalance > 0
                                    );
                                  })
                                  .map((item) => (
                                    <SelectItem key={item.id} value={item.id}>
                                      {item.person?.name} · {item.concept} ·
                                      pendiente{" "}
                                      {formatMoney(item.pendingBalance)}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </>
                      ) : null}

                      <Separator />

                      <div className="space-y-2">
                        <Label htmlFor="subscriptionId">Suscripción relacionada</Label>
                        <Select
                          value={subscriptionId}
                          onValueChange={setSubscriptionId}
                        >
                          <SelectTrigger id="subscriptionId">
                            <SelectValue placeholder="Selecciona suscripción" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="NONE">
                              Sin suscripción
                            </SelectItem>
                            {subscriptions
                              .filter(
                                (subscription) =>
                                  subscription.paymentMethod === "CASH",
                              )
                              .map((subscription) => (
                                <SelectItem
                                  key={subscription.id}
                                  value={subscription.id}
                                >
                                  {subscription.name} ·{" "}
                                  {formatMoney(subscription.amount)}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ) : null}
                </div>

                <Button
                  type="button"
                  className="w-full"
                  onClick={createExpense}
                  disabled={isSaving}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {isSaving ? "Guardando..." : "Guardar gasto"}
                </Button>
              </CardContent>
            </Card>

            <div className="min-w-0 space-y-6">
              <Card className="rounded-2xl border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold uppercase text-center">
                    Gastos filtrados
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 sm:flex sm:flex-wrap">
                    <Select
                      value={filterMonth || "ALL"}
                      onValueChange={(value) => {
                        setFilterMonth(value === "ALL" ? "" : value);
                        setFilterDate("");
                      }}
                    >
                      <SelectTrigger className="w-full sm:w-[180px]">
                        <SelectValue placeholder="Todos los meses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">Todos los meses</SelectItem>
                        {availableMonths.map((m) => (
                          <SelectItem key={m} value={m}>
                            {formatMonthLabel(m)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <div className="space-y-1">
                      <Label htmlFor="filterDate" className="sr-only">Filtrar por día</Label>
                      <Input
                        id="filterDate"
                        type="date"
                        value={filterDate}
                        onChange={(e) => {
                          setFilterDate(e.target.value);
                          setFilterMonth("");
                        }}
                        className="w-full sm:w-[160px]"
                      />
                    </div>

                    {filterDate ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setFilterDate("")}
                        className="text-muted-foreground"
                      >
                        Limpiar día
                      </Button>
                    ) : null}

                    <Select
                      value={filterCategoryId || "ALL"}
                      onValueChange={(value) => setFilterCategoryId(value === "ALL" ? "" : value)}
                    >
                      <SelectTrigger className="w-full sm:w-[180px]">
                        <SelectValue placeholder="Todas las categorías" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">Todas las categorías</SelectItem>
                        {categories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <div className="space-y-1">
                      <Label htmlFor="filterConcept" className="sr-only">Buscar por concepto</Label>
                      <Input
                        id="filterConcept"
                        placeholder="Buscar concepto..."
                        value={filterConcept}
                        onChange={(e) => setFilterConcept(e.target.value)}
                        className="w-full sm:w-[200px]"
                      />
                    </div>
                  </div>

                  <DataTable
                    columns={expenseColumns}
                    data={filteredExpenses}
                    pageSize={15}
                    footerRow={(table) => {
                      const total = table.getFilteredRowModel().rows.reduce(
                        (sum, row) => sum + Number(row.original.amount || 0),
                        0,
                      );
                      return (
                        <TableRow>
                          <TableCell colSpan={4} className="text-right text-sm font-medium text-muted-foreground">
                            Total
                          </TableCell>
                          <TableCell className="font-semibold tabular-nums">
                            {formatMoney(total)}
                          </TableCell>
                          <TableCell />
                        </TableRow>
                      );
                    }}
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
