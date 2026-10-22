import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { exchangeCode } from "@/lib/calendar/google";
import { claimConnection, releaseConnection } from "@/lib/calendar/sync";
import { CalendarError, requireCalendarConfig, calendarConfig, CALENDAR_SCOPES, hash, randomSecret, encryptSecret, decryptSecret, preferences, calendarMessage } from "@/lib/calendar/config";

export async function beginCalendarOAuth(userId, db = prisma) {
  const config = requireCalendarConfig();
  const state = randomSecret(), browser = randomSecret(), verifier = randomSecret();
  await db.calendarOAuthState.deleteMany({ where: { OR: [{ userId }, { expiresAt: { lt: new Date() } }] } });
  await db.calendarOAuthState.create({ data: { userId, stateHash: hash(state), browserHash: hash(browser),
    verifier: encryptSecret(verifier, userId), expiresAt: new Date(Date.now() + 600000) } });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri,
    response_type: "code", scope: CALENDAR_SCOPES.join(" "), access_type: "offline", prompt: "consent select_account",
    state, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" }).toString();
  return { url: url.toString(), browser };
}

export async function completeCalendarOAuth({ state, browser, code, denied }, { db = prisma, exchange = exchangeCode } = {}) {
  if (!state || !browser || state.length > 200 || browser.length > 200) throw new CalendarError("OAUTH_EXPIRED", 400);
  const record = await db.$transaction(async tx => {
    const where = { stateHash: hash(state), browserHash: hash(browser), expiresAt: { gt: new Date() } };
    const found = await tx.calendarOAuthState.findFirst({ where });
    if (!found || !(await tx.calendarOAuthState.deleteMany({ where })).count) throw new CalendarError("OAUTH_EXPIRED", 400);
    return found;
  });
  if (denied) throw new CalendarError("DENIED", 400);
  if (!code || code.length > 4096) throw new CalendarError("OAUTH_EXPIRED", 400);
  const credentials = await exchange(code, decryptSecret(record.verifier, record.userId));
  await db.googleCalendarConnection.upsert({ where: { userId: record.userId }, create: { userId: record.userId }, update: {} });
  const { token, connection } = await claimConnection(db, record.userId);
  try {
    if (connection.googleSubject && connection.googleSubject !== credentials.subject) throw new CalendarError("ACCOUNT_MISMATCH", 409);
    await db.$transaction(async tx => {
      if (connection.lastError === "CALENDAR_MISSING") await tx.googleCalendarEvent.deleteMany({ where: { connectionId: connection.id } });
      await tx.googleCalendarConnection.update({ where: { userId: record.userId }, data: {
        googleSubject: credentials.subject, googleEmail: credentials.email, refreshToken: encryptSecret(credentials.refreshToken, record.userId),
        status: "CONNECTED", lastError: null, attempts: 0, nextAttemptAt: new Date(), revision: { increment: 1 },
        ...(connection.lastError === "CALENDAR_MISSING" ? { calendarId: null } : {}),
      } });
    });
  } finally { await releaseConnection(db, record.userId, token); }
  return record.userId;
}

export async function calendarStatus(userId, db = prisma) {
  const configured = calendarConfig().ready;
  const connection = await db.googleCalendarConnection.findUnique({ where: { userId } });
  return { configured, status: connection?.status || "DISCONNECTED", email: connection?.googleEmail || null,
    preferences: preferences(connection?.preferences), lastSyncedAt: connection?.lastSyncedAt || null,
    pending: Boolean(connection && (connection.revision !== connection.syncedRevision || connection.status === "DISCONNECTING")),
    syncing: Boolean(connection?.lockUntil && connection.lockUntil > new Date()),
    error: connection?.lastError ? calendarMessage(connection.lastError) : null,
    calendarUrl: connection?.calendarId ? `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(connection.calendarId)}` : null,
  };
}

export async function updateCalendarPreferences(userId, value, db = prisma) {
  await db.googleCalendarConnection.upsert({ where: { userId }, create: { userId, preferences: value }, update: {} });
  const { token } = await claimConnection(db, userId);
  try {
    await db.googleCalendarConnection.update({ where: { userId }, data: { preferences: value, revision: { increment: 1 }, nextAttemptAt: new Date() } });
  } finally { await releaseConnection(db, userId, token); }
}

export async function disconnectCalendar(userId, db = prisma) {
  const current = await db.googleCalendarConnection.findUnique({ where: { userId } });
  if (!current || current.status === "DISCONNECTED") return;
  const { token, connection } = await claimConnection(db, userId);
  try {
    // Si Google revocó el acceso, ya no se pueden retirar sus recordatorios.
    const unavailable = connection.status === "RECONNECT_REQUIRED";
    await db.googleCalendarConnection.update({ where: { userId }, data: {
      status: unavailable ? "DISCONNECTED" : "DISCONNECTING", ...(unavailable ? { refreshToken: null } : {}),
      revision: { increment: 1 }, nextAttemptAt: new Date(), lastError: null,
    } });
    await db.calendarOAuthState.deleteMany({ where: { userId } });
  } finally { await releaseConnection(db, userId, token); }
}
