// Stores Resend credentials (encrypted) on the demo workspace, sends a real test email, and routes
// every demo user's escalation alerts to the given inbox (Resend free tier only delivers to the account email).
// Usage: npx tsx --env-file=.env scripts/connect-resend.mts <alert-inbox>
import { PrismaClient } from "@prisma/client";
import { saveCreds } from "../src/server/integrations/registry";
import { sendEmail } from "../src/server/integrations/resend";

const prisma = new PrismaClient();
const inbox = process.argv[2];
const creds = { apiKey: (process.env.RESEND_API_KEY ?? "").trim(), from: (process.env.RESEND_FROM ?? "Dastak <onboarding@resend.dev>").trim() };
if (!creds.apiKey || !inbox) throw new Error("Need RESEND_API_KEY in .env and an inbox argument");

try {
  const id = await sendEmail(creds, {
    to: inbox,
    subject: "Dastak is connected to Resend",
    html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1c1b18"><p><b>Resend is connected.</b></p><p>Escalation alerts from Dastak will arrive at this address.</p></div>`,
    text: "Resend is connected. Escalation alerts from Dastak will arrive at this address.",
  });
  console.log(`✓ Test email accepted by Resend (id ${id}) → ${inbox}`);
} catch (e) {
  console.log(`✗ Resend rejected the test email: ${(e as Error).message}`);
  process.exit(1);
}
const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@demo.test" } });
await saveCreds(owner.workspaceId, "RESEND", creds);
const n = await prisma.user.updateMany({ where: { workspaceId: owner.workspaceId }, data: { notifyEmail: inbox } });
console.log(`✓ Resend saved; escalation alerts for ${n.count} demo users now go to ${inbox}`);
await prisma.$disconnect();
