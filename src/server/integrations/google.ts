import { prisma } from "../db";
import { decrypt, encrypt } from "../crypto";
import { appUrl } from "../http";
import { logEvent } from "./registry";
import { ProviderError } from "../jobs/queue";

const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
];

export const googleConfigured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
export const redirectUri = () => `${appUrl()}/api/integrations/google/callback`;

export function authUrl(state: string) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

type Tokens = { access_token: string; refresh_token?: string };

async function tokenRequest(params: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      ...params,
    }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!res) throw new ProviderError("Couldn't reach Google.", true);
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string; refresh_token?: string; expires_in?: number; id_token?: string; error?: string; error_description?: string;
  };
  if (!res.ok) throw new ProviderError(data.error_description || data.error || `Google returned HTTP ${res.status}`, res.status >= 500, data.error);
  return data;
}

export async function exchangeCode(userId: string, workspaceId: string, code: string) {
  const t = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri() });
  let email: string | null = null;
  if (t.id_token) {
    try {
      email = JSON.parse(Buffer.from(t.id_token.split(".")[1], "base64url").toString()).email ?? null;
    } catch { /* ignore */ }
  }
  const tokens: Tokens = { access_token: t.access_token!, refresh_token: t.refresh_token };
  const existing = await prisma.googleConnection.findUnique({ where: { userId } });
  if (!tokens.refresh_token && existing) {
    tokens.refresh_token = (JSON.parse(decrypt(existing.encryptedTokens)) as Tokens).refresh_token;
  }
  const data = {
    workspaceId,
    googleEmail: email,
    encryptedTokens: encrypt(JSON.stringify(tokens)),
    expiresAt: new Date(Date.now() + (t.expires_in ?? 3600) * 1000),
    needsReconnect: false,
    lastError: null,
    lastOkAt: new Date(),
  };
  await prisma.googleConnection.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  return email;
}

export class ReconnectNeeded extends ProviderError {
  constructor(msg = "Google Calendar needs to be reconnected.") {
    super(msg, false, "reconnect");
  }
}

async function accessToken(userId: string, force = false): Promise<string> {
  const c = await prisma.googleConnection.findUnique({ where: { userId } });
  if (!c) throw new ReconnectNeeded("This employee hasn't connected Google Calendar.");
  if (c.needsReconnect) throw new ReconnectNeeded();
  const tokens = JSON.parse(decrypt(c.encryptedTokens)) as Tokens;
  if (!force && c.expiresAt && c.expiresAt.getTime() - 60_000 > Date.now()) return tokens.access_token;
  if (!tokens.refresh_token) {
    await prisma.googleConnection.update({ where: { userId }, data: { needsReconnect: true, lastError: "No refresh token" } });
    throw new ReconnectNeeded();
  }
  try {
    const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: tokens.refresh_token });
    tokens.access_token = t.access_token!;
    await prisma.googleConnection.update({
      where: { userId },
      data: { encryptedTokens: encrypt(JSON.stringify(tokens)), expiresAt: new Date(Date.now() + (t.expires_in ?? 3600) * 1000) },
    });
    await logEvent({ workspaceId: c.workspaceId, provider: "GOOGLE", direction: "OUT", type: "token.refresh", result: "OK" });
    return tokens.access_token;
  } catch (e) {
    const pe = e as ProviderError;
    if (pe.code === "invalid_grant" || pe.code === "unauthorized_client") {
      await prisma.googleConnection.update({
        where: { userId },
        data: { needsReconnect: true, lastError: "Access was revoked or expired" },
      });
      await logEvent({ workspaceId: c.workspaceId, provider: "GOOGLE", direction: "OUT", type: "token.refresh", result: "ERROR", error: "invalid_grant: needs reconnect" });
      throw new ReconnectNeeded("Google access was revoked or expired. The employee needs to reconnect.");
    }
    throw e;
  }
}

/** Calendar API call with one automatic token refresh on 401. */
async function gcal<T>(userId: string, path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const token = await accessToken(userId, retried);
  const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!res) throw new ProviderError("Couldn't reach Google Calendar.", true);
  if (res.status === 401 && !retried) return gcal<T>(userId, path, init, true);
  if (res.status === 204 || res.status === 410) return {} as T;
  const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) {
    if (res.status === 401) {
      await prisma.googleConnection.update({ where: { userId }, data: { needsReconnect: true } });
      throw new ReconnectNeeded();
    }
    if (res.status === 404 && init.method === "DELETE") return {} as T;
    throw new ProviderError(data.error?.message || `Google Calendar returned HTTP ${res.status}`, res.status >= 500 || res.status === 429);
  }
  await prisma.googleConnection.update({ where: { userId }, data: { lastOkAt: new Date(), lastError: null } }).catch(() => null);
  return data;
}

export async function freeBusy(userId: string, timeMin: Date, timeMax: Date) {
  const r = await gcal<{ calendars?: { primary?: { busy?: { start: string; end: string }[] } } }>(userId, "/freeBusy", {
    method: "POST",
    body: JSON.stringify({ timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString(), items: [{ id: "primary" }] }),
  });
  return r.calendars?.primary?.busy ?? [];
}

export async function createEvent(
  userId: string,
  e: { summary: string; description?: string; start: Date; end: Date; timeZone: string; attendeeEmail?: string | null },
) {
  return gcal<{ id: string; htmlLink?: string }>(userId, "/calendars/primary/events", {
    method: "POST",
    body: JSON.stringify({
      summary: e.summary,
      description: e.description,
      start: { dateTime: e.start.toISOString(), timeZone: e.timeZone },
      end: { dateTime: e.end.toISOString(), timeZone: e.timeZone },
    }),
  });
}

export async function patchEvent(userId: string, eventId: string, e: { start: Date; end: Date; timeZone: string; summary?: string }) {
  return gcal<{ id: string }>(userId, `/calendars/primary/events/${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      ...(e.summary ? { summary: e.summary } : {}),
      start: { dateTime: e.start.toISOString(), timeZone: e.timeZone },
      end: { dateTime: e.end.toISOString(), timeZone: e.timeZone },
    }),
  });
}

export async function deleteEvent(userId: string, eventId: string) {
  return gcal(userId, `/calendars/primary/events/${encodeURIComponent(eventId)}`, { method: "DELETE" });
}

export async function revoke(userId: string) {
  const c = await prisma.googleConnection.findUnique({ where: { userId } });
  if (!c) return;
  try {
    const t = JSON.parse(decrypt(c.encryptedTokens)) as Tokens;
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(t.refresh_token || t.access_token)}`, {
      method: "POST",
      signal: AbortSignal.timeout(8000),
    });
  } catch { /* best effort */ }
  await prisma.googleConnection.delete({ where: { userId } });
}
