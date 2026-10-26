import Link from "next/link";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";

export default function AutomaticRecordingLink({ payments = false }) {
  return <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
    <p className="text-sm text-muted-foreground">{payments ? "Revisa los pagos detectados de tus tarjetas." : "Revisa compras detectadas y confirma devoluciones."}</p>
    <Button variant="outline" className="min-h-11" asChild><Link href={`/registro-automatico?tipo=${payments ? "pagos" : "pendientes"}`}>Registro automático <HugeiconsIcon icon={ArrowRight01Icon} data-icon="inline-end" /></Link></Button>
  </div>;
}
