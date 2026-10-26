import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { calendarClient } from "@/lib/calendar/google";
import { buildCalendarEvents, googleEvent, loadCalendarData, mexicoDay } from "@/lib/calendar/events";
import { CalendarError, calendarConfig, decryptSecret, encryptSecret, hash, CALENDAR_TIME_ZONE } from "@/lib/calendar/config";
import { calendarNeedsSync } from "@/lib/calendar/pending";
import { ensureCalendarPalette } from "@/lib/calendar/palette";

export async function claimConnection(db, userId) {
  const now = new Date(), token = randomUUID();
  const result = await db.googleCalendarConnection.updateMany({
    where: { userId, OR: [{ lockUntil: null }, { lockUntil: { lt: now } }] },
    data: { lockToken: token, lockUntil: new Date(now.getTime() + 300000) },
  });
  if (!result.count) throw new CalendarError("BUSY", 409);
  return { token, connection: await db.googleCalendarConnection.findUnique({ where: { userId } }) };
}

export async function releaseConnection(db, userId, token) {
  await db.googleCalendarConnection.updateMany({ where: { userId, lockToken: token }, data: { lockToken: null, lockUntil: null } });
}

function eventId(connectionId, sourceKey, generation) { return `afp${hash(`${connectionId}:${sourceKey}:${generation}`)}`; }
function sameEvent(remote, desired) {
  if (!remote || remote.status === "cancelled") return false;
  return remote.summary === desired.summary && remote.description === desired.description
    && remote.start?.date === desired.start.date && remote.end?.date === desired.end.date
    && remote.transparency === desired.transparency && remote.visibility === desired.visibility
    && remote.eventLabelId === desired.eventLabelId && remote.reminders?.useDefault === false
    && JSON.stringify(remote.reminders?.overrides || []) === JSON.stringify(desired.reminders.overrides)
    && remote.extendedProperties?.private?.afpSource === desired.extendedProperties.private.afpSource;
}

export async function syncGoogleCalendar(userId, { db = prisma, clientFactory = calendarClient, now = new Date(), budgetMs = 210000 } = {}) {
  if (!calendarConfig().ready) return { status: "UNCONFIGURED" };
  const initial = await db.googleCalendarConnection.findUnique({ where: { userId } });
  if (!calendarNeedsSync(initial)) return { status: "SKIPPED" };
  let claimed;
  try { claimed = await claimConnection(db, userId); } catch (error) { if (error.code === "BUSY") return { status: "BUSY" }; throw error; }
  const { token, connection } = claimed;
  const startedAt = Date.now(); let writes = 0;
  const guard = async () => {
    if (Date.now() - startedAt > budgetMs || writes >= 150) throw new CalendarError("CONTINUE");
    const current = await db.googleCalendarConnection.findFirst({ where: { userId, lockToken: token, lockUntil: { gt: new Date(Date.now() + 20000) } } });
    if (!current) throw new CalendarError("BUSY", 409);
  };
  try {
    // Otro proceso pudo completar la revisión antes de que tomáramos el bloqueo.
    if (!calendarNeedsSync(connection)) return { status: "SKIPPED" };
    const client = await clientFactory(decryptSecret(connection.refreshToken, userId), guard);
    if (client.rotatedToken) await db.googleCalendarConnection.update({ where: { userId }, data: { refreshToken: encryptSecret(client.rotatedToken, userId) } });
    let calendarId = connection.calendarId;
    if (!calendarId && connection.status !== "DISCONNECTING") {
      // Recupera una creación cuya respuesta o escritura local se perdió.
      const marker = `Agenda de AFP. Referencia: ${connection.calendarMarker}`;
      const list = await client.all("users/me/calendarList?maxResults=250&minAccessRole=owner&showHidden=true");
      const existing = list.find(calendar => calendar.description === marker);
      const calendar = existing || await client.request("calendars", "POST", { summary: "AFP", description: marker, timeZone: CALENDAR_TIME_ZONE });
      if (!calendar.id || calendar.id === "primary") throw new CalendarError("GOOGLE_UNAVAILABLE");
      calendarId = calendar.id;
      await db.googleCalendarConnection.update({ where: { userId }, data: { calendarId } });
    }
    if (!calendarId) {
      await db.googleCalendarConnection.update({ where: { userId }, data: { status: "DISCONNECTED", refreshToken: null, lastError: null } });
      return { status: "DISCONNECTED" };
    }
    const path = `calendars/${encodeURIComponent(calendarId)}/events`;
    let remote;
    try {
      if (connection.status !== "DISCONNECTING" && await ensureCalendarPalette(client, calendarId)) writes++;
      remote = await client.all(`${path}?maxResults=2500&showDeleted=true&privateExtendedProperty=${encodeURIComponent(`afpConnection=${connection.id}`)}`);
    }
    catch (error) { if ([404, 410].includes(error.status)) throw new CalendarError("CALENDAR_MISSING"); throw error; }
    const remoteById = new Map(remote.map(event => [event.id, event]));
    const agenda = connection.status === "DISCONNECTING" ? { events: [], from: mexicoDay(now) }
      : buildCalendarEvents(await loadCalendarData(db, userId), connection.preferences, now);
    const desiredKeys = new Set(agenda.events.map(event => event.key));
    const mappings = await db.googleCalendarEvent.findMany({ where: { connectionId: connection.id } });
    const byKey = new Map(mappings.map(item => [item.sourceKey, item]));

    // Retira únicamente eventos creados por esta conexión; conserva el historial fuera del intervalo.
    for (const mapping of mappings) {
      if (desiredKeys.has(mapping.sourceKey) || mapping.eventDate < agenda.from || mapping.removed) continue;
      await guard();
      try { await client.request(`${path}/${mapping.eventId}?sendUpdates=none`, "DELETE"); }
      catch (error) { if (![404, 410].includes(error.status)) throw error; }
      writes++;
      await db.googleCalendarEvent.update({ where: { connectionId_sourceKey: { connectionId: connection.id, sourceKey: mapping.sourceKey } }, data: { removed: true, payloadHash: null } });
    }
    if (connection.status === "DISCONNECTING") {
      await db.googleCalendarConnection.update({ where: { userId }, data: { status: "DISCONNECTED", refreshToken: null, lastError: null, lastSyncedAt: new Date(), attempts: 0 } });
      return { status: "DISCONNECTED", writes };
    }
    for (const event of agenda.events) {
      await guard();
      let mapping = byKey.get(event.key);
      const where = { connectionId_sourceKey: { connectionId: connection.id, sourceKey: event.key } };
      if (!mapping) {
        mapping = await db.googleCalendarEvent.create({ data: { connectionId: connection.id, sourceKey: event.key,
          eventId: eventId(connection.id, event.key, 0), eventDate: event.date } });
      }
      let current = remoteById.get(mapping.eventId);
      if (!current && !mapping.removed) {
        try { current = await client.request(`${path}/${mapping.eventId}`); }
        catch (error) { if (![404, 410].includes(error.status)) throw error; if (error.status === 410) current = { status: "cancelled" }; }
      }
      if (mapping.removed || current?.status === "cancelled") {
        const generation = mapping.generation + 1;
        mapping = await db.googleCalendarEvent.update({ where, data: { generation, eventId: eventId(connection.id, event.key, generation), removed: false, payloadHash: null } });
        current = null;
      }
      const desired = googleEvent(event, connection, calendarConfig().origin);
      if (!sameEvent(current, desired)) {
        if (current) await client.request(`${path}/${mapping.eventId}?sendUpdates=none&eventLabelVersion=1`, "PATCH", desired);
        else {
          try { await client.request(`${path}?sendUpdates=none&eventLabelVersion=1`, "POST", { id: mapping.eventId, ...desired }); }
          catch (error) {
            if (error.status !== 409) throw error;
            // Recuperación de un POST confirmado por Google cuya respuesta se perdió.
            const found = await client.request(`${path}/${mapping.eventId}`);
            if (found.status === "cancelled") {
              await db.googleCalendarEvent.update({ where, data: { removed: true } });
              throw new CalendarError("CONTINUE");
            }
            if (found.extendedProperties?.private?.afpConnection !== connection.id || found.extendedProperties?.private?.afpSource !== event.key) throw new CalendarError("EVENT_CONFLICT");
            await client.request(`${path}/${mapping.eventId}?sendUpdates=none&eventLabelVersion=1`, "PATCH", desired);
          }
        }
        writes++;
      }
      const payloadHash = hash(JSON.stringify(desired));
      if (mapping.eventDate !== event.date || mapping.payloadHash !== payloadHash || mapping.removed) {
        await db.googleCalendarEvent.update({ where, data: { eventDate: event.date, payloadHash, removed: false } });
      }
    }
    await db.googleCalendarConnection.update({ where: { userId }, data: { syncedRevision: connection.revision, lastSyncedAt: new Date(),
      lastError: null, attempts: 0, nextAttemptAt: new Date() } });
    return { status: "SYNCED", writes, events: agenda.events.length };
  } catch (error) {
    const code = error instanceof CalendarError ? error.code : "GOOGLE_UNAVAILABLE";
    const reconnect = ["RECONNECT", "CALENDAR_MISSING"].includes(code);
    const delay = code === "CONTINUE" ? 10000 : Math.max(error.retryAfter || 0, Math.min(3600000, 60000 * 2 ** Math.min(connection.attempts, 6)));
    await db.googleCalendarConnection.updateMany({ where: { userId, lockToken: token }, data: {
      ...(reconnect ? { status: "RECONNECT_REQUIRED" } : {}), lastError: code === "CONTINUE" ? null : code,
      nextAttemptAt: new Date(Date.now() + delay), attempts: { increment: code === "CONTINUE" ? 0 : 1 },
    } });
    // Solo códigos controlados; nunca tokens, cuerpos bancarios o respuestas de Google.
    if (code !== "CONTINUE") console.error("Google Calendar:", code);
    return { status: code === "CONTINUE" ? "PENDING" : "ERROR", code };
  } finally { await releaseConnection(db, userId, token); }
}
