import { supabase } from "@/lib/supabase";

// Consultar la sesión en cada envío permite usar el token renovado por Supabase.
export async function apiFetch(url, options = {}) {
  if (typeof url !== "string" || !url.startsWith("/api/")) throw new Error("Ruta de API no válida.");
  const { expectedUserId = new URL(url, "http://localhost").searchParams.get("userId"), ...init } = options;
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session?.access_token) throw new Error("La sesión venció. Vuelve a iniciar sesión.");
  if (expectedUserId && session.user.id !== expectedUserId) {
    throw new Error("La sesión cambió. Vuelve a abrir esta sección.");
  }
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${session.access_token}`);
  return fetch(url, { ...init, headers, cache: "no-store" });
}
