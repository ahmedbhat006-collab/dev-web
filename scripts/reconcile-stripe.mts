// Re-checks every still-pending payment against Stripe and applies the real status.
// Useful when webhooks were missed (e.g. the tunnel URL changed). Usage: npx tsx --env-file=.env scripts/reconcile-stripe.mts
import { PrismaClient } from "@prisma/client";
import { getCreds } from "../src/server/integrations/registry";
import { stripeClient, StripeCreds } from "../src/server/integrations/stripe";

const prisma = new PrismaClient();
const pending = await prisma.payment.findMany({ where: { status: "PENDING", stripeSessionId: { not: null } } });
for (const p of pending) {
  const creds = await getCreds<StripeCreds>(p.workspaceId, "STRIPE");
  if (!creds) continue;
  const s = await stripeClient(creds).checkout.sessions.retrieve(p.stripeSessionId!);
  const status = s.payment_status === "paid" ? "PAID" : s.status === "expired" ? "EXPIRED" : null;
  if (!status) continue;
  await prisma.payment.update({
    where: { id: p.id },
    data: { status, ...(status === "PAID" ? { paidAt: new Date(s.created * 1000), stripePaymentIntentId: typeof s.payment_intent === "string" ? s.payment_intent : null } : {}) },
  });
  await prisma.activity.create({
    data: { workspaceId: p.workspaceId, type: "PAYMENT", actorName: "System", summary: `Payment ${status.toLowerCase()} (reconciled from Stripe)`, contactId: p.contactId, opportunityId: p.opportunityId },
  });
  console.log(`${p.id}: PENDING → ${status}`);
}
console.log(`checked ${pending.length} pending payment(s)`);
await prisma.$disconnect();
