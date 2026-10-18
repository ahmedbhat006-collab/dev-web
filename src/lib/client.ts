"use client";

import useSWR, { SWRConfiguration, mutate as globalMutate } from "swr";
import { useCallback, useState } from "react";
import { toast } from "sonner";

export class ApiError extends Error {
  constructor(message: string, public status: number, public data: Record<string, unknown>) {
    super(message);
  }
}

export async function api<T = unknown>(url: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError("Can't reach the server. Check your connection and try again.", 0, {});
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && typeof window !== "undefined" && !url.startsWith("/api/auth")) {
    window.location.href = "/login";
  }
  if (!res.ok) throw new ApiError((data as { error?: string }).error || `Request failed (${res.status})`, res.status, data);
  return data as T;
}

export const fetcher = (url: string) => api(url);

/** SWR with optional live polling (Q11). */
export function useApi<T = any>(url: string | null, opts: SWRConfiguration & { live?: number | boolean } = {}) {
  const { live, ...rest } = opts;
  const refreshInterval = live === true ? 3000 : typeof live === "number" ? live : undefined;
  return useSWR<T>(url, (u: string) => api<T>(u), { refreshInterval, revalidateOnFocus: true, keepPreviousData: true, ...rest });
}

/** Runs a mutation with loading state + success/error toasts. */
export function useAction() {
  const [pending, setPending] = useState(false);
  const run = useCallback(
    async <T,>(fn: () => Promise<T>, msgs: { success?: string; error?: string; silent?: boolean } = {}): Promise<T | undefined> => {
      setPending(true);
      try {
        const r = await fn();
        if (msgs.success) toast.success(msgs.success);
        return r;
      } catch (e) {
        if (!msgs.silent) toast.error(msgs.error ? `${msgs.error}: ${(e as Error).message}` : (e as Error).message);
        throw e;
      } finally {
        setPending(false);
      }
    },
    [],
  );
  return { pending, run };
}

export const refresh = (prefix: string) => globalMutate((key) => typeof key === "string" && key.startsWith(prefix));

export function qs(params: Record<string, string | number | undefined | null | boolean>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "" && v !== false) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function timeAgo(d: string | Date) {
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function fmtDuration(sec: number | null | undefined) {
  if (sec === null || sec === undefined) return "—";
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  const h = Math.floor(sec / 3600);
  return `${h}h ${Math.floor((sec % 3600) / 60)}m`;
}

export const fmtDateTime = (d: string | Date, tz?: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", ...(tz ? { timeZone: tz } : {}) }).format(new Date(d));
