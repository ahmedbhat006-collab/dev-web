import { z } from "zod";
import { route, body, HttpError } from "@/server/http";
import { prisma } from "@/server/db";
import { getContext, requirePerm, actorOf } from "@/server/context";
import { PROVIDER_DEFS, getCreds, saveCreds, logEvent } from "@/server/integrations/registry";
import { testConnection, WhatsAppCreds } from "@/server/integrations/whatsapp";
import { stripeClient, explainStripeError } from "@/server/integrations/stripe";
import { audit } from "@/server/audit";
import { ProviderError } from "@/server/jobs/queue";

type P = keyof typeof PROVIDER_DEFS;
const isProvider = (p: string): p is P => p in PROVIDER_DEFS;

/** Connect or update credentials. Blank secret fields keep their current value. */
export const PUT = route(async (req, { params }) => {
  const { provider } = await params;
  const ctx = await getContext();
  requirePerm(ctx, "integrations.manage");
  const p = provider.toUpperCase();
  if (!isProvider(p)) throw new HttpError(404, "Unknown integration.");
  const b = await body(req, z.object({ creds: z.record(z.string().trim().max(2000)) }));
  const existing = (await getCreds<Record<string, string>>(ctx.workspaceId, p)) ?? {};
  const creds: Record<string, string> = {};
  for (const f of PROVIDER_DEFS[p].fields) {
    const v = b.creds[f.key] || existing[f.key] || "";
    if (!v && !(p === "RESEND" && f.key === "from")) throw new HttpError(400, `${f.label} is required.`);
    if (v) creds[f.key] = v;
  }

  // Check the credentials against the real provider before saving.
  let detail = "";
  try {
    if (p === "WHATSAPP") detail = `Number ${await testConnection(creds as WhatsAppCreds)}`;
    if (p === "STRIPE") {
      if (!creds.secretKey.startsWith("sk_test_") && !creds.secretKey.startsWith("rk_test_"))
        throw new HttpError(400, "Use a Stripe test-mode key (sk_test_…).");
      if (!creds.webhookSecret.startsWith("whsec_")) throw new HttpError(400, "The webhook signing secret starts with whsec_.");
      await stripeClient({ secretKey: creds.secretKey, webhookSecret: creds.webhookSecret }).balance.retrieve();
      detail = "Test mode key verified";
    }
    if (p === "RESEND" && !creds.apiKey.startsWith("re_")) throw new HttpError(400, "Resend API keys start with re_.");
  } catch (e) {
    if (e instanceof HttpError) throw e;
    const msg = e instanceof ProviderError ? e.message : explainStripeError(e);
    await logEvent({ workspaceId: ctx.workspaceId, provider: p, direction: "OUT", type: "connection.test", result: "ERROR", error: msg });
    throw new HttpError(400, `Couldn't connect: ${msg}`);
  }

  const before = await prisma.integration.findUnique({ where: { workspaceId_provider: { workspaceId: ctx.workspaceId, provider: p } } });
  const row = await saveCreds(ctx.workspaceId, p, creds);
  await logEvent({ workspaceId: ctx.workspaceId, provider: p, direction: "OUT", type: "connection.test", result: "OK", summary: detail || "Credentials saved" });
  await audit(prisma, ctx.workspaceId, actorOf(ctx), before?.status === "CONNECTED" ? "INTEGRATION_UPDATED" : "INTEGRATION_CONNECTED",
    { type: "Integration", id: row.id, label: p }, before ? { status: before.status, hints: before.hints } : null, { status: row.status, hints: row.hints });
  return { ok: true, detail };
});

export const DELETE = route(async (_req, { params }) => {
  const { provider } = await params;
  const ctx = await getContext();
  requirePerm(ctx, "integrations.manage");
  const p = provider.toUpperCase();
  if (!isProvider(p)) throw new HttpError(404, "Unknown integration.");
  const row = await prisma.integration.findUnique({ where: { workspaceId_provider: { workspaceId: ctx.workspaceId, provider: p } } });
  if (!row) return { ok: true };
  await prisma.integration.update({ where: { id: row.id }, data: { status: "NOT_CONNECTED", encryptedCreds: null, hints: {} } });
  await audit(prisma, ctx.workspaceId, actorOf(ctx), "INTEGRATION_DISCONNECTED", { type: "Integration", id: row.id, label: p },
    { status: row.status, hints: row.hints }, { status: "NOT_CONNECTED" });
  return { ok: true };
});
