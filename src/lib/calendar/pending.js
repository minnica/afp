// Los cambios se sincronizan al guardar; sin cambios basta una revisión cada 24 h.
export const CALENDAR_REVIEW_MS = 24 * 60 * 60 * 1000;

export function calendarNeedsSync(connection, now = new Date()) {
  return Boolean(connection && ["CONNECTED", "DISCONNECTING"].includes(connection.status)
    && connection.nextAttemptAt <= now
    && (connection.status === "DISCONNECTING" || connection.revision !== connection.syncedRevision
      || connection.lastError || !connection.lastSyncedAt
      || connection.lastSyncedAt.getTime() <= now.getTime() - CALENDAR_REVIEW_MS));
}

export function calendarPendingWhere(db, now = new Date()) {
  return {
    status: { in: ["CONNECTED", "DISCONNECTING"] }, nextAttemptAt: { lte: now },
    OR: [
      { status: "DISCONNECTING" },
      { NOT: { revision: { equals: db.googleCalendarConnection.fields.syncedRevision } } },
      { lastError: { not: null } },
      { lastSyncedAt: null },
      { lastSyncedAt: { lte: new Date(now.getTime() - CALENDAR_REVIEW_MS) } },
    ],
  };
}
