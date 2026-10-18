import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { prisma } from "../db";

const COOKIE = "anchor_session";
const TTL_SEC = 7 * 24 * 3600;

const secret = () =>
  new TextEncoder().encode(process.env.JWT_SECRET || "dev-insecure-secret-change-me");

export async function signToken(payload: Record<string, unknown>, ttlSec: number) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ttlSec}s`)
    .sign(secret());
}

export async function verifyToken<T>(token: string): Promise<T | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as T;
  } catch {
    return null;
  }
}

export async function createSession(userId: string) {
  const h = await headers();
  const s = await prisma.session.create({
    data: {
      userId,
      expiresAt: new Date(Date.now() + TTL_SEC * 1000),
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: h.get("user-agent")?.slice(0, 250) ?? null,
    },
  });
  const token = await signToken({ sid: s.id }, TTL_SEC);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_SEC,
  });
}

type SessionRow = NonNullable<Awaited<ReturnType<typeof loadSession>>>;

const loadSession = (sid: string) =>
  prisma.session.findUnique({ where: { id: sid }, include: { user: { include: { role: true } } } });

// Short-lived cache: saves a database round-trip on every API call. Role, status and
// deactivation changes still take effect within CACHE_MS; logout clears the entry immediately.
const CACHE_MS = 10_000;
const g = globalThis as unknown as { __sessionCache?: Map<string, { s: SessionRow | null; at: number }> };
const cache = (g.__sessionCache ??= new Map());

export function invalidateSessions(userId?: string) {
  if (!userId) return cache.clear();
  for (const [k, v] of cache) if (v.s?.userId === userId) cache.delete(k);
}

export async function getSession() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const payload = await verifyToken<{ sid: string }>(token);
  if (!payload?.sid) return null;
  const hit = cache.get(payload.sid);
  let s: SessionRow | null;
  if (hit && Date.now() - hit.at < CACHE_MS) s = hit.s;
  else {
    s = await loadSession(payload.sid);
    cache.set(payload.sid, { s, at: Date.now() });
    if (cache.size > 5000) cache.clear();
  }
  if (!s || s.revokedAt || s.expiresAt < new Date() || !s.user.active) return null;
  return s;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    const payload = await verifyToken<{ sid: string }>(token);
    if (payload?.sid) cache.delete(payload.sid);
    if (payload?.sid)
      await prisma.session
        .update({ where: { id: payload.sid }, data: { revokedAt: new Date() } })
        .catch(() => null);
  }
  jar.delete(COOKIE);
}
