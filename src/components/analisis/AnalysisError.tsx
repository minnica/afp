"use client";


import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function AnalysisError({ error, retry }: { error: string; retry: () => Promise<unknown> }) {
  return (
    <Alert variant="destructive" className="flex flex-col gap-3">
      <AlertTitle>No se pudo cargar la información</AlertTitle>
      <AlertDescription>{error}</AlertDescription>
      <Button variant="outline" onClick={() => retry()} className="h-11 w-fit">Reintentar</Button>
    </Alert>
  );
}
