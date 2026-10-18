import { z } from "zod";
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { route, body, query, HttpError, appUrl } from "@/server/http";
import { prisma } from "@/server/db";
import { getContext, requirePerm, actorOf, seesAll } from "@/server/context";
import { oppScope } from "@/server/services/crm";
import { getCreds, logEvent, markError, markOk } from "@/server/integrations/registry";
import { stripeClient, explainStripeError, StripeCreds } from "@/server/integrations/stripe";
import { logActivity } from "@/server/audit";
import { toMinor, fmtMinor } from "@/lib/money";
import { pageParams } from "@/server/schemas";

export const GET = route(async (req) => {
  const ctx = await getContext();
  requirePerm(ctx, "crm.view");
  const q = query(req);
  const { page, pageSize, skip, take } = pageParams(q);
  const where: Prisma.PaymentWhereInput = {
    workspaceId: ctx.workspaceId,
    ...(seesAll(ctx) ? {} : { requestedById: ctx.userId }),
    ...(q.status ? { status: q.status as "PAID" } : {}),
    ...(q.month === "this" ? { paidAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: {
        contact: { select: { id: true, name: true } },
        opportunity: { select: { id: true, title: true } },
        requestedBy: { select: { name: true } },
      },
    }),
  ]);
  return { total, page, pageSize, rows };
});

const schema = z.object({
  opportunityId: z.string(),
  amount: z.number().positive("Amount must be more than zero").max(999_999),
  currency: z.string().length(3).transform((s) => s.toLowerCase()),
  description: z.string().trim().min(1).max(200),
});

/** Creates a Stripe Checkout Session (hosted page; card data never touches this app). */
export const POST = route(async (req) => {
  const ctx = await getContext();
  requirePerm(ctx, "crm.edit");
  const b = await body(req, schema);
  const opp = await prisma.opportunity.findFirst({ where: { id: b.opportunityId, ...oppScope(ctx) }, include: { contact: true } });
  if (!opp) throw new HttpError(404, "Opportunity not found.");
  const creds = await getCreds<StripeCreds>(ctx.workspaceId, "STRIPE");
  if (!creds) throw new HttpError(409, "Stripe isn't connected for this workspace. An admin can connect it in Settings > Integrations.");

  const id = randomUUID();
  const amount = toMinor(b.amount, b.currency);
  let session;
  try {
    session = await stripeClient(creds).checkout.sessions.create({
      mode: "payment",
      line_items: [{ quantity: 1, price_data: { currency: b.currency, unit_amount: amount, product_data: { name: b.description } } }],
      customer_email: opp.contact.email ?? undefined,
      success_url: `${appUrl()}/pay/success`,
      cancel_url: `${appUrl()}/pay/cancelled`,
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hour
      metadata: { paymentId: id, workspaceId: ctx.workspaceId, opportunityId: opp.id },
      payment_intent_data: { metadata: { paymentId: id, workspaceId: ctx.workspaceId } },
    });
  } catch (e) {
    const msg = explainStripeError(e);
    await logEvent({ workspaceId: ctx.workspaceId, provider: "STRIPE", direction: "OUT", type: "checkout.create", result: "ERROR", error: msg });
    await markError(ctx.workspaceId, "STRIPE", msg, (e as { type?: string })?.type === "StripeAuthenticationError");
    throw new HttpError(502, `Couldn't create the payment link: ${msg}`);
  }
  await logEvent({ workspaceId: ctx.workspaceId, provider: "STRIPE", direction: "OUT", type: "checkout.create", result: "OK", summary: `Checkout ${session.id}` });
  await markOk(ctx.workspaceId, "STRIPE");

  const p = await prisma.payment.create({
    data: {
      id,
      workspaceId: ctx.workspaceId,
      opportunityId: opp.id,
      contactId: opp.contactId,
      requestedById: ctx.userId,
      amount,
      currency: b.currency.toUpperCase(),
      description: b.description,
      stripeSessionId: session.id,
      url: session.url,
    },
  });
  await logActivity(prisma, {
    workspaceId: ctx.workspaceId, type: "PAYMENT", actor: actorOf(ctx), contactId: opp.contactId, opportunityId: opp.id,
    summary: `Payment link created: ${fmtMinor(amount, p.currency)} · ${b.description}`,
  });
  return p;
});
