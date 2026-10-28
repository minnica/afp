"use client";

import { useDashboard } from "@/components/dashboard/DashboardProvider";

// Análisis y las consultas del header comparten la misma respuesta financiera.
export function useAnalysis() {
  return useDashboard();
}
