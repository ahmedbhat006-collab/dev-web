import { route, appUrl } from "@/server/http";
import { prisma } from "@/server/db";
import { getContext, requirePerm } from "@/server/context";
import { PROVIDER_DEFS, GOOGLE_DEF } from "@/server/integrations/registry";
import { googleConfigured, redirectUri } from "@/server/integrations/google";
import { Provider } from "@prisma/client";

export const GET = route(async () => {
  const ctx = await getContext();
  requirePerm(ctx, "integrations.manage");
  const ws = ctx.workspaceId;
  const [rows, errors, users, failedJobs] = await Promise.all([
    prisma.integration.findMany({ where: { workspaceId: ws } }),
    prisma.integrationEvent.findMany({
      where: { workspaceId: ws, result: { in: ["ERROR", "REJECTED"] } },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
    prisma.user.findMany({
      where: { workspaceId: ws, active: true },
      select: { id: true, name: true, google: { select: { googleEmail: true, needsReconnect: true, lastOkAt: true, lastError: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.outboundJob.findMany({ where: { workspaceId: ws, status: { in: ["FAILED", "RETRYING"] } }, orderBy: { updatedAt: "desc" }, take: 20 }),
  ]);
  const lastGoogle = await prisma.integrationEvent.findFirst({ where: { workspaceId: ws, provider: "GOOGLE", result: "OK" }, orderBy: { createdAt: "desc" } });

  const providers = (Object.keys(PROVIDER_DEFS) as Exclude<Provider, "GOOGLE">[]).map((p) => {
    const r = rows.find((x) => x.provider === p);
    return {
      provider: p,
      status: r?.status ?? "NOT_CONNECTED",
      lastOkAt: r?.lastOkAt ?? null,
      lastError: r?.lastError ?? null,
      lastErrorAt: r?.lastErrorAt ?? null,
      hints: (r?.hints ?? {}) as Record<string, string>,
      fields: PROVIDER_DEFS[p].fields,
      can: PROVIDER_DEFS[p].can,
      cannot: PROVIDER_DEFS[p].cannot,
      webhookUrl: p === "WHATSAPP" ? `${appUrl()}/api/webhooks/whatsapp/${ws}` : p === "STRIPE" ? `${appUrl()}/api/webhooks/stripe/${ws}` : null,
      recentErrors: errors.filter((e) => e.provider === p).slice(0, 5),
    };
  });
  const connectedUsers = users.filter((u) => u.google && !u.google.needsReconnect).length;
  return {
    providers,
    google: {
      configured: googleConfigured(),
      status: !googleConfigured() ? "NOT_CONNECTED" : users.some((u) => u.google?.needsReconnect) ? "ERROR" : connectedUsers ? "CONNECTED" : "NOT_CONNECTED",
      redirectUri: redirectUri(),
      lastOkAt: lastGoogle?.createdAt ?? null,
      can: GOOGLE_DEF.can,
      cannot: GOOGLE_DEF.cannot,
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        status: u.google ? (u.google.needsReconnect ? "NEEDS_RECONNECT" : "CONNECTED") : "NOT_CONNECTED",
        email: u.google?.googleEmail ?? null,
        lastOkAt: u.google?.lastOkAt ?? null,
        lastError: u.google?.lastError ?? null,
      })),
      recentErrors: errors.filter((e) => e.provider === "GOOGLE").slice(0, 5),
    },
    failedJobs,
  };
});
