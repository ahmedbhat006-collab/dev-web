import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { PaymentStatus, Prisma } from "@prisma/client";
import { prisma, tx } from "@/server/db";
import { getCreds, logEvent, markOk } from "@/server/integrations/registry";
import { stripeClient, StripeCreds } from "@/server/integrations/stripe";
import { SYSTEM, logActivity } from "@/server/audit";
import { fmtMinor } from "@/lib/money";
import { PAYMENT_LABEL } from "@/lib/labels";

type Ctx = { params: Promise<{ workspaceId: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const { workspaceId } = await params;
  const raw = await req.text();
  const creds = await getCreds<StripeCreds>(workspaceId, "STRIPE");
  if (!creds) {
    await logEvent({ workspaceId, provider: "STRIPE", direction: "IN", type: "webhook", result: "REJECTED", error: "Stripe not connected" });
    return NextResponse.json({ error: "Not configured" }, { status: 404 });
  }
  let event: Stripe.Event;
  try {
    // Signature is checked before any record changes.
    event = stripeClient(creds).webhooks.constructEvent(raw, req.headers.get("stripe-signature") ?? "", creds.webhookSecret);
  } catch (e) {
    await logEvent({ workspaceId, provider: "STRIPE", direction: "IN", type: "webhook", result: "REJECTED", error: `Signature check failed: ${(e as Error).message}` });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    const summary = await tx(async (db) => {
      // Idempotency: Stripe event ids are unique; a re-delivered event fails here and changes nothing.
      await db.integrationEvent.create({
        data: { workspaceId, provider: "STRIPE", direction: "IN", type: event.type, externalId: event.id, result: "OK" },
      });

      let paymentId: string | undefined;
      let next: PaymentStatus | undefined;
      let extra: Prisma.PaymentUpdateInput = {};
      const obj = event.data.object as unknown as Record<string, unknown>;

      switch (event.type) {
        case "checkout.session.completed":
        case "checkout.session.async_payment_succeeded": {
          const s = event.data.object as Stripe.Checkout.Session;
          paymentId = s.metadata?.paymentId;
          if (s.payment_status === "paid") {
            next = "PAID";
            extra = { paidAt: new Date(), stripePaymentIntentId: typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id };
          }
          break;
        }
        case "checkout.session.async_payment_failed":
          paymentId = (event.data.object as Stripe.Checkout.Session).metadata?.paymentId;
          next = "FAILED";
          break;
        case "checkout.session.expired":
          paymentId = (event.data.object as Stripe.Checkout.Session).metadata?.paymentId;
          next = "EXPIRED";
          break;
        case "payment_intent.payment_failed":
          paymentId = (event.data.object as Stripe.PaymentIntent).metadata?.paymentId;
          next = "FAILED";
          break;
        case "charge.refunded": {
          const ch = event.data.object as Stripe.Charge;
          const pi = typeof ch.payment_intent === "string" ? ch.payment_intent : ch.payment_intent?.id;
          const p = pi ? await db.payment.findFirst({ where: { workspaceId, stripePaymentIntentId: pi } }) : null;
          paymentId = p?.id ?? (ch.metadata?.paymentId || undefined);
          next = ch.amount_refunded >= ch.amount ? "REFUNDED" : "PARTIALLY_REFUNDED";
          extra = { refundedAmount: ch.amount_refunded };
          break;
        }
        default:
          return `Ignored ${event.type}`;
      }
      void obj;
      if (!paymentId || !next) return `No change for ${event.type}`;
      const p = await db.payment.findFirst({ where: { id: paymentId, workspaceId } });
      if (!p) return `Unknown payment ${paymentId}`;
      // Never downgrade a paid/refunded payment because of a late "failed"/"expired" event.
      if ((next === "FAILED" || next === "EXPIRED") && ["PAID", "REFUNDED", "PARTIALLY_REFUNDED"].includes(p.status)) return `Kept ${p.status}`;
      await db.payment.update({ where: { id: p.id }, data: { status: next, ...extra } });
      await logActivity(db, {
        workspaceId, type: "PAYMENT", actor: SYSTEM, contactId: p.contactId, opportunityId: p.opportunityId,
        summary: `Payment ${PAYMENT_LABEL[next].toLowerCase()}: ${fmtMinor(p.amount, p.currency)}${next.includes("REFUND") && "refundedAmount" in extra ? ` (refunded ${fmtMinor(extra.refundedAmount as number, p.currency)})` : ""} · Stripe`,
      });
      return `${p.id} → ${next}`;
    });
    await prisma.integrationEvent.update({ where: { provider_externalId: { provider: "STRIPE", externalId: event.id } }, data: { summary } }).catch(() => null);
    await markOk(workspaceId, "STRIPE");
    return NextResponse.json({ received: true });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      await logEvent({ workspaceId, provider: "STRIPE", direction: "IN", type: event.type, result: "DUPLICATE", summary: `Duplicate ${event.id} ignored` });
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error("[stripe webhook]", e);
    await logEvent({ workspaceId, provider: "STRIPE", direction: "IN", type: event.type, result: "ERROR", error: (e as Error).message });
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
