const resources = {
  cards: "las tarjetas",
  "card-cycles": "los ciclos de tarjetas",
  expenses: "los gastos",
  gastos: "los datos de gastos",
  incomes: "los ingresos",
  "installment-purchases": "las compras a meses",
  subscriptions: "las suscripciones",
  "subscription-charges": "los cobros de suscripciones",
  receivables: "las cuentas por cobrar",
  payables: "las cuentas por pagar",
  dashboard: "el resumen financiero",
  settings: "la configuración",
  "notice-dismissals": "los avisos",
  "setup-user": "tu cuenta",
};

export class RequestError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "RequestError";
    Object.assign(this, details);
  }
}

export function canRepeatRequest(url, method, body) {
  if (["GET", "HEAD", "PUT", "PATCH", "DELETE"].includes(method)) return true;
  const path = url.split("?")[0];
  if (["/api/setup-user", "/api/subscription-charges", "/api/notice-dismissals"].includes(path)) return true;
  if (path === "/api/expenses") {
    try { return Boolean(JSON.parse(body).operationId); } catch { return false; }
  }
  return false;
}

export function requestError({ url, method, status, kind, message, sent = true, repeatable, retryAt }) {
  message = typeof message === "string" ? message.slice(0, 600) : undefined;
  const reading = method === "GET" || method === "HEAD";
  const resource = resources[url.split("/")[2]?.split("?")[0]] || "la información";
  const context = reading ? `No se ${/^(las|los) /.test(resource) ? "pudieron" : "pudo"} cargar ${resource}.`
    : method === "DELETE" ? "No se pudo completar la eliminación." : "No se pudo completar el guardado.";
  let details = { title: "No pudimos completar la acción", message: "Inténtalo de nuevo.", retryable: true };
  if (kind === "session" || status === 401) {
    details = { title: "Tu sesión venció", message: "Inicia sesión de nuevo para continuar.", action: "login", retryable: false };
  } else if (kind === "account") {
    details = { title: "Cambiaste de cuenta", message: "La sesión cambió. Abre de nuevo esta sección.", retryable: false };
  } else if (status === 403) {
    details = { title: "No tienes acceso", message: "Revisa que estés usando la cuenta correcta.", retryable: false };
  } else if (status === 404) {
    details = { title: "Registro no disponible", message: "Actualiza la lista; el registro pudo cambiar o eliminarse.", retryable: false };
  } else if (status === 409) {
    details = { title: "No pudimos aplicar el cambio", message: message || "El registro cambió. Actualiza la lista e inténtalo de nuevo.", retryable: false };
  } else if (status === 400 || status === 422) {
    details = { title: method === "DELETE" ? "No se puede eliminar" : "Revisa los datos",
      message: message || "Corrige los datos para continuar.", retryable: false };
  } else if (status === 429) {
    details = { title: "Espera un momento", message: "Hay demasiados intentos seguidos. Prueba más tarde.", retryable: true };
  } else if (status >= 400 && status < 500 && status !== 408) {
    details = { title: "Acción no disponible", message: "Abre de nuevo esta sección e inténtalo otra vez.", retryable: false };
  } else if (kind === "offline" || kind === "network") {
    details = { title: "No pudimos conectar", message: "Revisa tu conexión a internet e inténtalo de nuevo.", retryable: true };
  } else if (kind === "timeout" || status === 408) {
    details = { title: "La respuesta tardó demasiado", message: "Inténtalo de nuevo en un momento.", retryable: true };
  } else if (kind === "invalid") {
    details = { title: "La respuesta llegó incompleta", message: "Inténtalo de nuevo para completar la carga.", retryable: true };
  } else if (status >= 500) {
    details = { title: "Servicio no disponible", message: `${context} Inténtalo en un momento.`, retryable: true };
  }
  // Una respuesta perdida o un 5xx puede ocurrir después de guardar el alta.
  if (!reading && !repeatable && sent && (!status || status === 408 || status >= 500)) {
    details = { title: "Revisa si se guardó", message: "El registro podría haberse guardado. Revisa la lista antes de repetirlo para evitar duplicados.", retryable: false };
  }
  const tone = !details.retryable || status === 429 ? "warning" : "destructive";
  return new RequestError(details.message, { ...details, status, kind, retryAt, context, tone });
}
