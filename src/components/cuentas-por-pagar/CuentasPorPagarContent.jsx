"use client";

import { useCreationDraft } from "@/hooks/use-creation-draft";
import { useIsMobile } from "@/hooks/use-mobile";

import CreateRecordSurface, { useCreateDialogMode } from "@/components/ui/create-record-surface";

import { SearchableSelect } from "@/components/ui/searchable-select";

import { useDialogFocus } from "@/hooks/use-dialog-focus";

import { Empty, EmptyDescription } from "@/components/ui/empty";

import { Alert, AlertDescription } from "@/components/ui/alert";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Pencil, Trash2, X } from "lucide-react";
import { toast } from "@/components/ui/sonner";

import { supabase } from "@/lib/supabase";
import { ensureUserSetup } from "@/lib/userSetup";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageSkeleton from "@/components/layout/PageSkeleton";
import { RecordActions, RecordCardContent, RecordField, RecordListCard, RecordNote } from "@/components/ui/record-card";
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
  if (!dateString) return "-";
  return format(new Date(dateString), "d MMM yyyy", { locale: es });
}

function getStatusLabel(status) {
  const labels = {
    ACTIVE: "Activa",
    PAID_OFF: "Liquidada",
    CANCELLED: "Cancelada",
  };

  return labels[status] || status;
}

function getOriginLabel(originType) {
  const labels = {
    MANUAL: "Manual",
    DAILY_EXPENSE: "Gasto diario",
  };

  return labels[originType] || originType;
}

function toDateInputValue(dateString) {
  if (!dateString) return "";

  const date = new Date(dateString);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export default function CuentasPorPagarContent() {
  const { captureFocus, restoreFocus } = useDialogFocus();
  const router = useRouter();
  const mobileNavigation = useIsMobile();
  const compactEntry = useCreateDialogMode();
  const [createError, setCreateError] = useState(null);

  const [user, setUser] = useState(null);
  const [people, setPeople] = useState([]);
  const [payables, setPayables] = useState([]);

  const [personId, setPersonId] = useState("");
  const [concept, setConcept] = useState("");
  const [originalAmount, setOriginalAmount] = useState("");
  const [originDate, setOriginDate] = useState(getTodayInputValue());
  const [expectedMonthlyPayment, setExpectedMonthlyPayment] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");

  useCreationDraft({
    name: "cuentas-por-pagar",
    userId: user?.id,
    enabled: mobileNavigation,
    values: { personId, concept, originalAmount, originDate, expectedMonthlyPayment, expectedDate, notes },
    setters: { personId: setPersonId, concept: setConcept, originalAmount: setOriginalAmount, originDate: setOriginDate, expectedMonthlyPayment: setExpectedMonthlyPayment, expectedDate: setExpectedDate, notes: setNotes },
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const [editingPayableId, setEditingPayableId] = useState("");
  const [editPersonId, setEditPersonId] = useState("");
  const [editConcept, setEditConcept] = useState("");
  const [editOriginalAmount, setEditOriginalAmount] = useState("");
  const [editOriginDate, setEditOriginDate] = useState("");
  const [editExpectedMonthlyPayment, setEditExpectedMonthlyPayment] =
    useState("");
  const [editExpectedDate, setEditExpectedDate] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  const [payableToDelete, setPayableToDelete] = useState(null);
  const [expandedPayableId, setExpandedPayableId] = useState("");

  async function loadSettings(userId) {
    const response = await fetch(`/api/settings?userId=${userId}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "No se pudo cargar configuración.");
    }

    setPeople(data.people || []);
  }

  async function loadPayables(userId) {
    const response = await fetch(`/api/payables?userId=${userId}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "No se pudieron cargar cuentas por pagar.");
    }

    setPayables(data.payables || []);
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

        await Promise.all([
          loadSettings(session.user.id),
          loadPayables(session.user.id),
        ]);
      } catch (err) {
        setError(err.message || "Ocurrió un error.");
      } finally {
        setIsLoading(false);
      }
    }

    init();
  }, [router]);

  async function createPayable() {
    if (!user || isSaving) return false;

    setCreateError(null);
    setError("");
    setIsSaving(true);

    let saved = false;
    try {
      const response = await fetch("/api/payables", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: user.id,
          personId,
          concept,
          originalAmount,
          originDate,
          expectedMonthlyPayment,
          expectedDate,
          notes,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo crear la cuenta por pagar.");
      }

      saved = true;
      setConcept("");
      setOriginalAmount("");
      setExpectedMonthlyPayment("");
      setExpectedDate("");
      setNotes("");

      await loadPayables(user.id);
      if (!compactEntry) toast.success("Cuenta por pagar guardada exitosamente.");
      return { message: "Cuenta por pagar guardada exitosamente.", type: "success" };
    } catch (err) {
      if (saved) {
        setError("El registro se guardó, pero no se pudo actualizar la lista. Recarga para verlo.");
        if (!compactEntry) toast.success("El registro se guardó; recarga la lista para verlo.");
        return { message: "El registro se guardó; recarga la lista para verlo.", type: "success" };
      }
      setCreateError({ message: err.message || "No se pudo crear la cuenta por pagar." });
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  function startEditingPayable(payable) {
    setEditingPayableId(payable.id);
    setEditPersonId(payable.personId || "");
    setEditConcept(payable.concept || "");
    setEditOriginalAmount(String(payable.originalAmount || ""));
    setEditOriginDate(toDateInputValue(payable.originDate));
    setEditExpectedMonthlyPayment(
      payable.expectedMonthlyPayment
        ? String(payable.expectedMonthlyPayment)
        : "",
    );
    setEditExpectedDate(toDateInputValue(payable.expectedDate));
    setEditNotes(payable.notes || "");
  }

  function cancelEditingPayable() {
    setEditingPayableId("");
    setEditPersonId("");
    setEditConcept("");
    setEditOriginalAmount("");
    setEditOriginDate("");
    setEditExpectedMonthlyPayment("");
    setEditExpectedDate("");
    setEditNotes("");
  }

  async function updatePayable() {
    if (!user || !editingPayableId) return;

    setError("");
    setIsUpdating(true);

    try {
      const response = await fetch("/api/payables", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: editingPayableId,
          personId: editPersonId,
          concept: editConcept,
          originalAmount: editOriginalAmount,
          originDate: editOriginDate,
          expectedMonthlyPayment: editExpectedMonthlyPayment,
          expectedDate: editExpectedDate,
          notes: editNotes,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "No se pudo actualizar la cuenta por pagar.",
        );
      }

      cancelEditingPayable();
      await loadPayables(user.id);
      toast.success("Cambios guardados exitosamente.");
    } catch (err) {
      setError(err.message || "No se pudo actualizar la cuenta por pagar.");
      toast.error(err.message || "No se pudo actualizar la cuenta por pagar.");
    } finally {
      setIsUpdating(false);
    }
  }

  async function deletePayable(id) {
    if (!user) return;

    setError("");

    try {
      const response = await fetch(`/api/payables?id=${id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo eliminar.");
      }

      setPayableToDelete(null);
      await loadPayables(user.id);
      toast.success("Cuenta por pagar eliminada exitosamente.");
    } catch (err) {
      setError(err.message || "No se pudo eliminar la cuenta por pagar.");
      toast.error(err.message || "No se pudo eliminar la cuenta por pagar.");
    }
  }

  const summary = useMemo(() => {
    return payables.reduce(
      (acc, item) => {
        acc.original += Number(item.originalAmount || 0);
        acc.paid += Number(item.paidAmount || 0);
        acc.pending += Number(item.pendingBalance || 0);

        return acc;
      },
      {
        original: 0,
        paid: 0,
        pending: 0,
      },
    );
  }, [payables]);

  const activePayables = useMemo(() => {
    return payables.filter((item) => item.status === "ACTIVE");
  }, [payables]);

  const paidOffPayables = useMemo(() => {
    return payables.filter((item) => item.status === "PAID_OFF");
  }, [payables]);

  const allPayables = useMemo(() => {
    return payables;
  }, [payables]);

  if (isLoading) {
    return <PageSkeleton variant="list" mobileCards />;
  }

  return (
    <>
      <AlertDialog
        open={Boolean(payableToDelete)}
        onOpenChange={(open) => {
          if (!open) setPayableToDelete(null);
        }}
      >
        <AlertDialogContent onCloseAutoFocus={restoreFocus}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Eliminar esta cuenta por pagar?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará la cuenta{" "}
              {payableToDelete?.concept
                ? `"${payableToDelete.concept}"`
                : "seleccionada"}{" "}
              por {formatMoney(payableToDelete?.originalAmount || 0)}.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => deletePayable(payableToDelete.id)}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <main onClickCapture={captureFocus}>
        <section className={`mx-auto flex w-full max-w-6xl flex-col px-4 py-5 md:py-8 ${compactEntry ? "pb-28!" : ""}`}>
          {error ? (
            <Alert variant="destructive" className="mb-6">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="mb-6 grid gap-4 md:grid-cols-3">
            <SummaryCard
              title="Monto original"
              value={formatMoney(summary.original)}
            />
            <SummaryCard title="Pagado" value={formatMoney(summary.paid)} />
            <SummaryCard
              title="Pendiente"
              value={formatMoney(summary.pending)}
            />
          </div>

          <div className={`grid gap-5 ${compactEntry ? "" : "xl:grid-cols-[420px_1fr]"}`}>
            <CreateRecordSurface
              showSaveFeedback
              compact={compactEntry}
              title="Nueva cuenta por pagar"
              saveLabel="Guardar cuenta"
              error={createError}
              isSaving={isSaving}
              onSubmit={createPayable}
            >
              <div className="space-y-2">
                <Label htmlFor="cuentas-por-pagar-field-1">Persona / proveedor</Label>
                <SearchableSelect
                  value={personId}
                  onValueChange={setPersonId}
                  id="cuentas-por-pagar-field-1"
                  title="Seleccionar persona"
                  placeholder="Selecciona persona o proveedor"
                  searchPlaceholder="Buscar persona…"
                  options={people.map(item => ({
                    value: item.id,
                    label: item.name
                  }))}
                />

                {people.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Primero agrega personas en Configuración.
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="cuentas-por-pagar-field-2">Concepto</Label>
                <Input
                  id="cuentas-por-pagar-field-2"
                  value={concept}
                  placeholder="Ej. Préstamo pendiente, compra por pagar..."
                  onChange={(event) => setConcept(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cuentas-por-pagar-field-3">Monto original</Label>
                <Input
                  id="cuentas-por-pagar-field-3"
                  value={originalAmount}
                  type="number"
                  formatNumber
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  onChange={(event) => setOriginalAmount(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="payable-origin-date">Fecha de origen</Label>
                <DatePicker
                  id="payable-origin-date"
                  aria-label="Fecha de origen"
                  value={originDate}
                  onChange={setOriginDate}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cuentas-por-pagar-field-4">Pago mensual esperado opcional</Label>
                <Input
                  id="cuentas-por-pagar-field-4"
                  value={expectedMonthlyPayment}
                  type="number"
                  formatNumber
                  min="0"
                  step="0.01"
                  placeholder="Ej. 1000"
                  onChange={(event) =>
                    setExpectedMonthlyPayment(event.target.value)
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="payable-expected-date">Fecha esperada opcional</Label>
                <DatePicker
                  id="payable-expected-date"
                  aria-label="Fecha esperada"
                  clearable
                  value={expectedDate}
                  onChange={setExpectedDate}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cuentas-por-pagar-field-5">Notas opcional</Label>
                <Textarea id="cuentas-por-pagar-field-5"
                  value={notes}
                  placeholder="Detalles adicionales..."
                  onChange={(event) => setNotes(event.target.value)}
                />
              </div>
            </CreateRecordSurface>

            <RecordListCard>
              <CardHeader>
                <CardTitle className="text-lg font-semibold uppercase text-center">
                  Cuentas por pagar
                </CardTitle>
              </CardHeader>

              <CardContent>
                <Tabs defaultValue="active" className="w-full">
                  <TabsList className="mb-6">
                    <TabsTrigger value="active">
                      Activas ({activePayables.length})
                    </TabsTrigger>
                    <TabsTrigger value="paid">
                      Liquidadas ({paidOffPayables.length})
                    </TabsTrigger>
                    <TabsTrigger value="all">
                      Todas ({allPayables.length})
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="active">
                    <PayablesList
                      items={activePayables}
                      emptyText="No tienes cuentas por pagar activas."
                      onRequestDelete={setPayableToDelete}
                      onEdit={startEditingPayable}
                      editingPayableId={editingPayableId}
                      people={people}
                      editPersonId={editPersonId}
                      setEditPersonId={setEditPersonId}
                      editConcept={editConcept}
                      setEditConcept={setEditConcept}
                      editOriginalAmount={editOriginalAmount}
                      setEditOriginalAmount={setEditOriginalAmount}
                      editOriginDate={editOriginDate}
                      setEditOriginDate={setEditOriginDate}
                      editExpectedMonthlyPayment={editExpectedMonthlyPayment}
                      setEditExpectedMonthlyPayment={
                        setEditExpectedMonthlyPayment
                      }
                      editExpectedDate={editExpectedDate}
                      setEditExpectedDate={setEditExpectedDate}
                      editNotes={editNotes}
                      setEditNotes={setEditNotes}
                      updatePayable={updatePayable}
                      cancelEditingPayable={cancelEditingPayable}
                      isUpdating={isUpdating}
                      expandedPayableId={expandedPayableId}
                      setExpandedPayableId={setExpandedPayableId}
                    />
                  </TabsContent>

                  <TabsContent value="paid">
                    <PayablesList
                      items={paidOffPayables}
                      emptyText="No tienes cuentas por pagar liquidadas."
                      onRequestDelete={setPayableToDelete}
                      onEdit={startEditingPayable}
                      editingPayableId={editingPayableId}
                      people={people}
                      editPersonId={editPersonId}
                      setEditPersonId={setEditPersonId}
                      editConcept={editConcept}
                      setEditConcept={setEditConcept}
                      editOriginalAmount={editOriginalAmount}
                      setEditOriginalAmount={setEditOriginalAmount}
                      editOriginDate={editOriginDate}
                      setEditOriginDate={setEditOriginDate}
                      editExpectedMonthlyPayment={editExpectedMonthlyPayment}
                      setEditExpectedMonthlyPayment={
                        setEditExpectedMonthlyPayment
                      }
                      editExpectedDate={editExpectedDate}
                      setEditExpectedDate={setEditExpectedDate}
                      editNotes={editNotes}
                      setEditNotes={setEditNotes}
                      updatePayable={updatePayable}
                      cancelEditingPayable={cancelEditingPayable}
                      isUpdating={isUpdating}
                      expandedPayableId={expandedPayableId}
                      setExpandedPayableId={setExpandedPayableId}
                    />
                  </TabsContent>

                  <TabsContent value="all">
                    <PayablesList
                      items={allPayables}
                      emptyText="Aún no tienes cuentas por pagar registradas."
                      onRequestDelete={setPayableToDelete}
                      onEdit={startEditingPayable}
                      editingPayableId={editingPayableId}
                      people={people}
                      editPersonId={editPersonId}
                      setEditPersonId={setEditPersonId}
                      editConcept={editConcept}
                      setEditConcept={setEditConcept}
                      editOriginalAmount={editOriginalAmount}
                      setEditOriginalAmount={setEditOriginalAmount}
                      editOriginDate={editOriginDate}
                      setEditOriginDate={setEditOriginDate}
                      editExpectedMonthlyPayment={editExpectedMonthlyPayment}
                      setEditExpectedMonthlyPayment={
                        setEditExpectedMonthlyPayment
                      }
                      editExpectedDate={editExpectedDate}
                      setEditExpectedDate={setEditExpectedDate}
                      editNotes={editNotes}
                      setEditNotes={setEditNotes}
                      updatePayable={updatePayable}
                      cancelEditingPayable={cancelEditingPayable}
                      isUpdating={isUpdating}
                      expandedPayableId={expandedPayableId}
                      setExpandedPayableId={setExpandedPayableId}
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

function SummaryCard({ title, value }) {
  return (
    <Card className="rounded-2xl border-border bg-card">
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function PayablesList({
  items,
  emptyText,
  onRequestDelete,
  onEdit,
  editingPayableId,
  people,
  editPersonId,
  setEditPersonId,
  editConcept,
  setEditConcept,
  editOriginalAmount,
  setEditOriginalAmount,
  editOriginDate,
  setEditOriginDate,
  editExpectedMonthlyPayment,
  setEditExpectedMonthlyPayment,
  editExpectedDate,
  setEditExpectedDate,
  editNotes,
  setEditNotes,
  updatePayable,
  cancelEditingPayable,
  isUpdating,
  expandedPayableId,
  setExpandedPayableId,
}) {
  const mobile = useIsMobile();

  if (items.length === 0) {
    return (
      <Empty>
        <EmptyDescription>
          {emptyText}
        </EmptyDescription>
      </Empty>
    );
  }

  return (
    <ItemGroup className="max-md:gap-3" aria-label="Cuentas por pagar">
      {items.map((item) => (
        <Collapsible
          key={item.id}
          open={expandedPayableId === item.id}
          onOpenChange={(open) => setExpandedPayableId(open ? item.id : "")}
          asChild
        >
        <Item variant="outline" role="listitem" aria-label={`Cuenta por pagar: ${item.concept}`} className="block min-w-0 max-md:rounded-xl max-md:bg-card max-md:p-4">
          {mobile ? (
            <RecordCardContent
              title={item.person?.name || item.concept}
              subtitle={item.person?.name ? item.concept : null}
              badges={<Badge variant="secondary">{getStatusLabel(item.status)}</Badge>}
              amount={formatMoney(item.pendingBalance)}
              amountLabel="Pendiente de pago"
              actions={
                <RecordActions label={`cuenta por pagar: ${item.concept}`} onEdit={() => onEdit(item)} onDelete={() => onRequestDelete(item)}>
                  <CollapsibleTrigger asChild>
                    <Button type="button" variant="outline" className="h-11" aria-label={`${expandedPayableId === item.id ? "Ocultar" : "Ver"} pagos de ${item.concept}`}>
                      {expandedPayableId === item.id ? "Ocultar pagos" : "Ver pagos"}
                    </Button>
                  </CollapsibleTrigger>
                </RecordActions>
              }
            >
              <dl className="grid grid-cols-2 gap-3">
                <RecordField label="Monto original">{formatMoney(item.originalAmount)}</RecordField>
                <RecordField label="Pagado">{formatMoney(item.paidAmount)}</RecordField>
                {item.expectedMonthlyPayment ? <RecordField label="Pago esperado">{formatMoney(item.expectedMonthlyPayment)}</RecordField> : null}
                {item.expectedDate ? <RecordField label="Fecha esperada">{formatDate(item.expectedDate)}</RecordField> : null}
                <RecordField label="Fecha de origen">{formatDate(item.originDate)}</RecordField>
                <RecordField label="Origen">{getOriginLabel(item.originType)}</RecordField>
              </dl>
              <RecordNote>{item.notes}</RecordNote>
            </RecordCardContent>
          ) : (
          <>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{item.concept}</p>
                <Badge variant="secondary">{getStatusLabel(item.status)}</Badge>
                <Badge variant="outline">
                  {getOriginLabel(item.originType)}
                </Badge>
              </div>

              <p className="mt-1 text-sm text-muted-foreground">
                Persona / proveedor: {item.person?.name} · Origen:{" "}
                {formatDate(item.originDate)}
              </p>

              {item.expectedMonthlyPayment ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  Pago esperado: {formatMoney(item.expectedMonthlyPayment)}
                </p>
              ) : null}

              {item.expectedDate ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  Fecha esperada: {formatDate(item.expectedDate)}
                </p>
              ) : null}

              {item.notes ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {item.notes}
                </p>
              ) : null}
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="secondary"
                size="sm"
              >
                {expandedPayableId === item.id ? "Ocultar pagos" : "Ver pagos"}
              </Button>
              </CollapsibleTrigger>

              <Button aria-label="Editar"
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onEdit(item)}
              >
                <Pencil className="h-4 w-4" />
              </Button>

              <Button aria-label="Eliminar"
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onRequestDelete(item)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <Separator className="my-4" />

          <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-3">
              <p className="text-xs text-muted-foreground">Original</p>
              <p className="mt-1 font-medium">
                {formatMoney(item.originalAmount)}
              </p>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 px-3 py-3">
              <p className="text-xs text-muted-foreground">Pagado</p>
              <p className="mt-1 font-medium">{formatMoney(item.paidAmount)}</p>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 px-3 py-3">
              <p className="text-xs text-muted-foreground">Pendiente</p>
              <p className="mt-1 font-medium">
                {formatMoney(item.pendingBalance)}
              </p>
            </div>
          </div>

          </>
          )}

          <CollapsibleContent>
            <PayablePaymentsBreakdown payable={item} />
          </CollapsibleContent>

          {editingPayableId === item.id ? (
            <div className="mt-4 rounded-xl border border-border bg-background/70 p-4">
              <div className="mb-4 flex items-center justify-between gap-4">
                <p className="text-sm font-medium">Editar cuenta por pagar</p>

                <Button aria-label="Cancelar edición"
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={cancelEditingPayable}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="cuentas-por-pagar-field-6">Persona / proveedor</Label>
                  <SearchableSelect
                    value={editPersonId}
                    onValueChange={setEditPersonId}
                    id="cuentas-por-pagar-field-6"
                    title="Seleccionar persona"
                    placeholder="Selecciona persona o proveedor"
                    searchPlaceholder="Buscar persona…"
                    options={people.map(item => ({
                      value: item.id,
                      label: item.name
                    }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`edit-payable-origin-${item.id}`}>Fecha de origen</Label>
                  <DatePicker
                    id={`edit-payable-origin-${item.id}`}
                    aria-label="Fecha de origen"
                    value={editOriginDate}
                    onChange={setEditOriginDate}
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="cuentas-por-pagar-field-7">Concepto</Label>
                  <Input
                    id="cuentas-por-pagar-field-7"
                    value={editConcept}
                    onChange={(event) => setEditConcept(event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cuentas-por-pagar-field-8">Monto original</Label>
                  <Input
                    id="cuentas-por-pagar-field-8"
                    value={editOriginalAmount}
                    type="number"
                    formatNumber
                    min="0"
                    step="0.01"
                    onChange={(event) =>
                      setEditOriginalAmount(event.target.value)
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cuentas-por-pagar-field-9">Pago mensual esperado opcional</Label>
                  <Input
                    id="cuentas-por-pagar-field-9"
                    value={editExpectedMonthlyPayment}
                    type="number"
                    formatNumber
                    min="0"
                    step="0.01"
                    onChange={(event) =>
                      setEditExpectedMonthlyPayment(event.target.value)
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`edit-payable-expected-${item.id}`}>Fecha esperada opcional</Label>
                  <DatePicker
                    id={`edit-payable-expected-${item.id}`}
                    aria-label="Fecha esperada"
                    clearable
                    value={editExpectedDate}
                    onChange={setEditExpectedDate}
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="cuentas-por-pagar-field-10">Notas</Label>
                  <Textarea id="cuentas-por-pagar-field-10"
                    value={editNotes}
                    onChange={(event) => setEditNotes(event.target.value)}
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <Button
                  type="button"
                  className="w-full sm:w-auto"
                  onClick={updatePayable}
                  disabled={isUpdating}
                >
                  {isUpdating ? "Guardando..." : "Guardar cambios"}
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  className="w-full sm:w-auto"
                  onClick={cancelEditingPayable}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          ) : null}
        </Item>
        </Collapsible>
      ))}
    </ItemGroup>
  );
}

function PayablePaymentsBreakdown({ payable }) {
  const payments = [...(payable.dailyExpenses || [])].sort((a, b) => {
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  return (
    <div className="mt-4 rounded-xl border border-border bg-background/70 p-4">
      <h4 className="mb-4 text-sm font-medium">Desglose de pagos</h4>

      {payments.length === 0 ? (
        <Empty>
          <EmptyDescription>
            Todavía no hay pagos vinculados a esta cuenta por pagar.
          </EmptyDescription>
        </Empty>
      ) : (
        <ItemGroup>
          {payments.map((payment) => (
            <Item
              key={payment.id}
              variant="muted"
              role="listitem"
            >
              <ItemContent className="min-w-0">
                <ItemTitle>{payment.concept}</ItemTitle>
                <ItemDescription>
                  {formatDate(payment.date)}
                </ItemDescription>
              </ItemContent>

              <p className="font-semibold">{formatMoney(payment.amount)}</p>
            </Item>
          ))}
        </ItemGroup>
      )}
    </div>
  );
}
