"use client";

import { apiFetch } from "@/lib/apiFetch";

import { toast } from "@/components/ui/sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import { FloppyDiskIcon } from "@hugeicons/core-free-icons";
import { Spinner } from "@/components/ui/spinner";

import { useDialogFocus } from "@/hooks/use-dialog-focus";

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { Empty, EmptyDescription } from "@/components/ui/empty";

import { Alert, AlertDescription } from "@/components/ui/alert";

import { useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ensureUserSetup } from "@/lib/userSetup";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import PageSkeleton from "@/components/layout/PageSkeleton";
import CaptureDevices from "@/components/configuracion/CaptureDevices";

export default function SettingsContent() {
  const { captureFocus, restoreFocus } = useDialogFocus();
  const router = useRouter();
  const [createError, setCreateError] = useState(null);

  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [categories, setCategories] = useState([]);
  const [people, setPeople] = useState([]);
  const [incomeTypes, setIncomeTypes] = useState([]);

  const [categoryName, setCategoryName] = useState("");
  const [personName, setPersonName] = useState("");
  const [personNotes, setPersonNotes] = useState("");
  const [incomeTypeName, setIncomeTypeName] = useState("");

  const [itemToDelete, setItemToDelete] = useState(null);
  const [error, setError] = useState("");
  const [initialTab, setInitialTab] = useState("categories");

  async function loadSettings(userId, { mutationCompleted = false } = {}) {
    const response = await apiFetch(`/api/settings?userId=${userId}`, { mutationCompleted });

    if (!response.ok) {
      throw new Error("No se pudo cargar configuración.");
    }

    const data = await response.json();

    setCategories(data.categories || []);
    setPeople(data.people || []);
    setIncomeTypes(data.incomeTypes || []);
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
        if (new URLSearchParams(window.location.search).get("tab") === "capture") setInitialTab("capture");

        await ensureUserSetup(session.user);

        await loadSettings(session.user.id);
      } catch (err) {
        setError(err.message || "Ocurrió un error.");
      } finally {
        setIsLoading(false);
      }
    }

    init();
  }, [router]);

  async function createItem(type) {
    if (!user || isSaving) return false;

    const enteredName = type === "category" ? categoryName : type === "person" ? personName : incomeTypeName;
    if (!enteredName.trim()) {
      setCreateError({ message: "El nombre es requerido." });
      return false;
    }
    setCreateError(null);
    setError("");
    setIsSaving(true);

    let saved = false;
    try {
      let payload = {
        userId: user.id,
        type,
      };

      if (type === "category") {
        payload.name = categoryName;
      }

      if (type === "person") {
        payload.name = personName;
        payload.notes = personNotes;
      }

      if (type === "incomeType") {
        payload.name = incomeTypeName;
      }

      const response = await apiFetch("/api/settings", {
        method: "POST", expectedUserId: user?.id,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo guardar.");
      }

      saved = true;
      if (type === "category") setCategoryName("");
      if (type === "person") {
        setPersonName("");
        setPersonNotes("");
      }
      if (type === "incomeType") setIncomeTypeName("");

      await loadSettings(user.id, { mutationCompleted: true });
      toast.success("Registro guardado exitosamente.");
      return true;
    } catch (err) {
      if (saved) {
        setError("El registro se guardó, pero no se pudo actualizar la lista. Recarga para verlo.");
        toast.success("Registro guardado exitosamente.");
        return true;
      }
      setCreateError({ message: err.message || "No se pudo guardar." });
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteItem(type, id) {
    if (!user) return;


    setError("");

    try {
      const response = await apiFetch(`/api/settings?type=${type}&id=${id}`, {
        method: "DELETE", expectedUserId: user?.id,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo eliminar.");
      }

      await loadSettings(user.id, { mutationCompleted: true });
    } catch (err) {
      setError(err.message || "No se pudo eliminar.");
    }
  }

  const totals = useMemo(
    () => ({
      categories: categories.length,
      people: people.length,
      incomeTypes: incomeTypes.length,
    }),
    [categories, people, incomeTypes],
  );

  if (isLoading) {
    return <PageSkeleton variant="settings" />;
  }

  return (
    <main onClickCapture={captureFocus}>
      <AlertDialog
        open={Boolean(itemToDelete)}
        onOpenChange={(open) => { if (!open) setItemToDelete(null); }}
      >
        <AlertDialogContent onCloseAutoFocus={restoreFocus}>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este registro?</AlertDialogTitle>
            <AlertDialogDescription>Se eliminará el registro seleccionado del catálogo. Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => deleteItem(itemToDelete.type, itemToDelete.id)}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <section className="mx-auto flex w-full max-w-6xl flex-col px-4 py-5 md:py-8">
        {error ? (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <SummaryCard title="Categorías" value={totals.categories} />
          <SummaryCard title="Personas" value={totals.people} />
          <SummaryCard title="Tipos de ingreso" value={totals.incomeTypes} />
        </div>

        {createError ? (
          <Alert variant="destructive" role="alert" className="mb-6">
            <AlertDescription>{createError.message}</AlertDescription>
          </Alert>
        ) : null}

        <Tabs defaultValue={initialTab} className="w-full">
          <TabsList className="mb-6 max-w-full flex-wrap group-data-horizontal/tabs:h-auto">
            <TabsTrigger value="categories" className="min-h-11">Categorías</TabsTrigger>
            <TabsTrigger value="people" className="min-h-11">Personas</TabsTrigger>
            <TabsTrigger value="incomeTypes" className="min-h-11">Tipos de ingreso</TabsTrigger>
            <TabsTrigger value="capture" className="min-h-11">Captura automática</TabsTrigger>
          </TabsList>

          <TabsContent value="capture">
            {user && <CaptureDevices key={user.id} userId={user.id} />}
          </TabsContent>

          <TabsContent value="categories">
            <CatalogCard
              title="Categorías"
              inputLabel="Nueva categoría"
              inputValue={categoryName}
              inputPlaceholder="Ej. Gasolina"
              onInputChange={setCategoryName}
              onCreate={() => createItem("category")}
              isSaving={isSaving}
              items={categories}
              onDelete={(id) => setItemToDelete({ type: "category", id })}
            />
          </TabsContent>

          <TabsContent value="people">
            <Card className="rounded-2xl border-border bg-card">
              <CardHeader>
                <CardTitle className="text-lg font-semibold uppercase text-center">
                  Personas
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
                  <div className="space-y-2">
                    <Label htmlFor="settings-field-1">Nombre</Label>
                    <Input
                      id="settings-field-1"
                      value={personName}
                      placeholder="Ej. Luis"
                      onChange={(event) => setPersonName(event.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="settings-field-2">Notas opcional</Label>
                    <Input
                      id="settings-field-2"
                      value={personNotes}
                      placeholder="Ej. Cuñado, amigo, familiar..."
                      onChange={(event) => setPersonNotes(event.target.value)}
                    />
                  </div>

                  <Button
                    type="button"
                    onClick={() => createItem("person")}
                    disabled={isSaving}
                  >
                    {isSaving ? <Spinner /> : <HugeiconsIcon icon={FloppyDiskIcon} strokeWidth={2} aria-hidden="true" />}
                    {isSaving ? "Guardando…" : "Guardar persona"}
                  </Button>
                </div>

                <Separator />

                <ItemList
                  items={people}
                  type="person"
                  emptyText="Aún no hay personas registradas."
                  onDelete={(id) => setItemToDelete({ type: "person", id })}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="incomeTypes">
            <CatalogCard
              title="Tipos de ingreso"
              description="Se usan para clasificar nómina, pagos recibidos, reembolsos e ingresos extra."
              inputLabel="Nuevo tipo de ingreso"
              inputValue={incomeTypeName}
              inputPlaceholder="Ej. Bono"
              onInputChange={setIncomeTypeName}
              onCreate={() => createItem("incomeType")}
              isSaving={isSaving}
              items={incomeTypes}
              onDelete={(id) => setItemToDelete({ type: "incomeType", id })}
            />
          </TabsContent>
        </Tabs>
      </section>
    </main>
  );
}

function SummaryCard({ title, value }) {
  return (
    <Card className="rounded-2xl border-border bg-card">
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function CatalogCard({
  title,
  inputLabel,
  inputValue,
  inputPlaceholder,
  onInputChange,
  onCreate,
  isSaving,
  items,
  onDelete,
}) {
  const inputId = useId();
  return (
    <Card className="rounded-2xl border-border bg-card">
      <CardHeader>
        <CardTitle className="text-lg font-semibold uppercase text-center">{title}</CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <div className="space-y-2">
            <Label htmlFor={inputId}>{inputLabel}</Label>
            <Input
              id={inputId}
              value={inputValue}
              placeholder={inputPlaceholder}
              onChange={(event) => onInputChange(event.target.value)}
            />
          </div>

          <Button type="button" onClick={onCreate} disabled={isSaving}>
            {isSaving ? <Spinner /> : <HugeiconsIcon icon={FloppyDiskIcon} strokeWidth={2} aria-hidden="true" />}
            {isSaving ? "Guardando…" : "Guardar"}
          </Button>
        </div>

        <Separator />

        <ItemList
          items={items}
          type={title}
          emptyText={`Aún no hay ${title.toLowerCase()} registradas.`}
          onDelete={onDelete}
        />
      </CardContent>
    </Card>
  );
}

function ItemList({ items, emptyText, onDelete }) {
  if (!items.length) {
    return (
      <Empty>
        <EmptyDescription>
          {emptyText}
        </EmptyDescription>
      </Empty>
    );
  }

  return (
    <ItemGroup>
      {items.map((item) => (
        <Item
          key={item.id}
          variant="outline"
          role="listitem"
        >
          <ItemContent className="min-w-0">
            <ItemTitle>
              {item.name}
              <Badge variant="secondary">Activo</Badge>
            </ItemTitle>

            {item.notes ? (
              <ItemDescription>
                {item.notes}
              </ItemDescription>
            ) : null}
          </ItemContent>

          <ItemActions>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Eliminar ${item.name}`}
            onClick={() => onDelete(item.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          </ItemActions>
        </Item>
      ))}
    </ItemGroup>
  );
}
