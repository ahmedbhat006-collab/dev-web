// Verifies the WhatsApp Cloud API credentials in .env against Meta and stores them (encrypted)
// on the demo workspace. Usage: npx tsx --env-file=.env scripts/connect-whatsapp.mts
import { PrismaClient } from "@prisma/client";
import { testConnection } from "../src/server/integrations/whatsapp";
import { saveCreds } from "../src/server/integrations/registry";

const prisma = new PrismaClient();
const e = process.env;
const creds = {
  phoneNumberId: (e.WHATSAPP_PHONE_NUMBER_ID ?? "").trim(),
  accessToken: (e.WHATSAPP_ACCESS_TOKEN ?? "").trim(),
  appSecret: (e.WHATSAPP_APP_SECRET ?? "").trim(),
  verifyToken: (e.WHATSAPP_VERIFY_TOKEN ?? "").trim(),
};
const missing = Object.entries(creds).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  console.log("Missing in .env:", missing.join(", "));
  process.exit(1);
}
try {
  const number = await testConnection(creds);
  console.log(`✓ Meta accepted the credentials. Test number: ${number}`);
} catch (err) {
  console.log(`✗ Meta rejected the credentials: ${(err as Error).message}`);
  process.exit(1);
}
const owner = await prisma.user.findUnique({ where: { email: "owner@demo.test" } });
if (!owner) throw new Error("Demo workspace not found. Run npm run setup first.");
await saveCreds(owner.workspaceId, "WHATSAPP", creds);
console.log(`✓ Saved (encrypted) on workspace ${owner.workspaceId}`);
console.log(`  Webhook URL path: /api/webhooks/whatsapp/${owner.workspaceId}`);
await prisma.$disconnect();
