import { googleResource } from './responses';
import type { CalendarClient, GoogleResource } from './types';
import { CalendarError, requireCalendarConfig, CALENDAR_SCOPE, CALENDAR_LIST_SCOPE } from "@/lib/calendar/config";

export async function googleRequest(url: string, options: RequestInit = {}) {
  let response;
  try { response = await fetch(url, { ...options, signal: AbortSignal.timeout(15000), cache: "no-store", redirect: "error" }); }
  catch { throw new CalendarError("GOOGLE_UNAVAILABLE"); }
  const data = googleResource(response.status === 204 ? {} : await response.json().catch(() => ({})));
  if (!response.ok) {
    if (data.error === "invalid_grant" || response.status === 401) throw new CalendarError("RECONNECT", 401);
    const reasons = typeof data.error === 'object' ? data.error.errors?.map(item => item.reason || '') || [] : [];
    if (response.status === 429 || reasons.some(reason => /rateLimit|quota/i.test(reason))) {
      const raw = response.headers.get("retry-after");
      const delay = /^\d+$/.test(raw || "") ? Number(raw) * 1000 : Math.max(0, Date.parse(raw || '') - Date.now());
      throw new CalendarError("RATE_LIMIT", 429, Number.isFinite(delay) ? delay : 60000);
    }
    throw new CalendarError(response.status === 403 ? "RECONNECT" : "GOOGLE_UNAVAILABLE", response.status);
  }
  return data;
}

export async function tokenRequest(parameters: Record<string, string>) {
  const { clientId, clientSecret } = requireCalendarConfig();
  return googleRequest("https://oauth2.googleapis.com/token", { method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...parameters }).toString() });
}

export async function exchangeCode(code: string, verifier: string) {
  const result = await tokenRequest({ code, code_verifier: verifier, redirect_uri: requireCalendarConfig().redirectUri, grant_type: "authorization_code" });
  if (!result.access_token || !result.refresh_token || ![CALENDAR_SCOPE, CALENDAR_LIST_SCOPE].every(scope => result.scope?.split(" ").includes(scope))) throw new CalendarError("RECONNECT");
  const profile = await googleRequest("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${result.access_token}` },
  });
  if (!profile.sub || !profile.email || !profile.email_verified) throw new CalendarError("RECONNECT");
  return { refreshToken: result.refresh_token, subject: profile.sub, email: profile.email };
}

export async function calendarClient(refreshToken: string, guard: () => Promise<void> = async () => {}): Promise<CalendarClient> {
  const tokens = await tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });
  if (!tokens.access_token) throw new CalendarError("RECONNECT");
  const request: CalendarClient['request'] = async (path, method = "GET", body, headers = {}) => {
    await guard();
    return googleRequest(`https://www.googleapis.com/calendar/v3/${path}`, { method,
      headers: { ...headers, Authorization: `Bearer ${tokens.access_token}`, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  };
  const all: CalendarClient['all'] = async path => {
    const items: GoogleResource[] = []; let pageToken: string | undefined;
    do {
      const data = await request(`${path}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`);
      items.push(...(data.items || []).map(googleResource)); pageToken = data.nextPageToken;
    } while (pageToken);
    return items;
  };
  return { request, all, rotatedToken: tokens.refresh_token };
}
