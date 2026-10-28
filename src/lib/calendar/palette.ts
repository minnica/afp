import { calendarErrorStatus } from './config';
import type { CalendarEvent, CalendarClient, GoogleLabelProperties } from './types';
import { CalendarError } from "@/lib/calendar/config";

// Familias de color separadas: azul, verde, naranja, gris neutro, amarillo y rojo.
// Google adapta la luminosidad al tema; el gris no comparte el matiz del azul.
export const CALENDAR_EVENT_PALETTE = {
  pending: { id: "72fe658a-4532-4db4-a613-b969507e102b", name: "AFP · Pendiente", backgroundColor: "#003053" },
  completed: { id: "d8bc0c82-1db1-4f76-9caa-34696472709f", name: "AFP · Completado", backgroundColor: "#003800" },
  partial: { id: "aef6e19a-31b3-428d-b9c0-5795a080a18e", name: "AFP · Parcial", backgroundColor: "#4A1B00" },
  informational: { id: "57c0de45-bd92-4bf2-a9df-8dc3bc55e5b3", name: "AFP · Corte", backgroundColor: "#292929" },
  subscription: { id: "e94fc8d8-dac8-47a7-9ef9-1a294d68a640", name: "AFP · Suscripción prevista", backgroundColor: "#352E00" },
  overdue: { id: "466e2cbd-4da8-4ec6-b036-3b8995ea1bef", name: "AFP · Vencido", backgroundColor: "#5C0012" },
};

export function calendarEventLabel(event: Pick<CalendarEvent, 'settled' | 'informational' | 'reviewed' | 'partial' | 'overdue' | 'type'>) {
  if (event.settled) return CALENDAR_EVENT_PALETTE.completed;
  if (event.informational) return event.reviewed ? CALENDAR_EVENT_PALETTE.completed : CALENDAR_EVENT_PALETTE.informational;
  // El parcial conserva su identidad y recordatorio, aunque la fecha haya pasado.
  if (event.partial) return CALENDAR_EVENT_PALETTE.partial;
  if (event.overdue) return CALENDAR_EVENT_PALETTE.overdue;
  return event.type === "subscriptions" ? CALENDAR_EVENT_PALETTE.subscription : CALENDAR_EVENT_PALETTE.pending;
}

// Conserva las etiquetas ajenas y evita escribir cuando la paleta ya coincide.
export function calendarLabelProperties(current: GoogleLabelProperties = {}) {
  const labels = current.eventLabels || [];
  const wanted = Object.values(CALENDAR_EVENT_PALETTE);
  const matches = wanted.every(label => labels.some(existing => existing.id === label.id
    && existing.name === label.name && existing.backgroundColor?.toLowerCase() === label.backgroundColor.toLowerCase()));
  if (matches) return null;
  const ownIds = new Set(wanted.map(label => label.id));
  const eventLabels = [...labels.filter(label => !ownIds.has(label.id)), ...wanted];
  if (eventLabels.length > 200) throw new CalendarError("LABEL_LIMIT");
  return { ...current, eventLabels };
}

export async function ensureCalendarPalette(client: CalendarClient, calendarId: string) {
  const path = `calendars/${encodeURIComponent(calendarId)}`;
  // El bloqueo de AFP no impide que se editen etiquetas directamente en Google.
  // If-Match y una nueva lectura conservan esas ediciones concurrentes.
  for (let attempt = 0; attempt < 3; attempt++) {
    const calendar = await client.request(path);
    const labelProperties = calendarLabelProperties(calendar.labelProperties);
    if (!labelProperties) return false;
    if (!calendar.etag) throw new CalendarError("GOOGLE_UNAVAILABLE");
    try {
      await client.request(path, "PATCH", { labelProperties }, { "If-Match": calendar.etag });
      return true;
    } catch (error) {
      if (calendarErrorStatus(error) !== 412 || attempt === 2) throw error;
    }
  }
}
