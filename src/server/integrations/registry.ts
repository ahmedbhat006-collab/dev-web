import { EventDirection, EventResult, Provider } from "@prisma/client";
import { prisma } from "../db";
import { decrypt, encrypt, mask } from "../crypto";

export type FieldDef = { key: string; label: string; secret: boolean; placeholder?: string; help?: string };

export const PROVIDER_DEFS: Record<
  Exclude<Provider, "GOOGLE">,
  { fields: FieldDef[]; can: string[]; cannot: string[] }
> = {
  WHATSAPP: {
    fields: [
      { key: "phoneNumberId", label: "Phone number ID", secret: false, placeholder: "1234567890", help: "WhatsApp > API Setup" },
      { key: "accessToken", label: "Access token", secret: true, placeholder: "EAAG…", help: "Temporary (24h) or System User token" },
      { key: "appSecret", label: "App secret", secret: true, help: "App settings > Basic. Used to verify webhook signatures." },
      { key: "verifyToken", label: "Webhook verify token", secret: true, help: "Any string; paste the same value in Meta's webhook settings." },
    ],
    can: [
      "Receive WhatsApp messages and create contacts + leads",
      "Reply from the inbox, with sent / delivered / read / failed status",
      "Verify every webhook with Meta's X-Hub-Signature-256",
    ],
    cannot: [
      "The free test number only reaches up to 5 recipient numbers verified in the Meta dashboard",
      "Free-form replies only within 24h of the customer's last message (WhatsApp rule)",
      "Temporary access tokens expire after 24 hours",
    ],
  },
  STRIPE: {
    fields: [
      { key: "secretKey", label: "Secret key", secret: true, placeholder: "sk_test_…" },
      { key: "webhookSecret", label: "Webhook signing secret", secret: true, placeholder: "whsec_…" },
    ],
    can: [
      "Create hosted Checkout payment links from an opportunity",
      "Mark payments paid, expired, failed or refunded via verified webhooks",
    ],
    cannot: ["Test mode only: use Stripe's test cards (4242 4242 4242 4242)", "Card details never touch this app"],
  },
  RESEND: {
    fields: [
      { key: "apiKey", label: "API key", secret: true, placeholder: "re_…" },
      { key: "from", label: "From address", secret: false, placeholder: "LeadGuard <onboarding@resend.dev>" },
    ],
    can: ["Email the new owner within seconds when a lead escalates", "Retry failed emails up to 3 times"],
    cannot: ["Without a verified domain, Resend only delivers to your own Resend account email"],
  },
};

export const GOOGLE_DEF = {
  can: [
    "Each employee connects their own Google Calendar (OAuth 2.0)",
    "Book, reschedule and cancel events; warn about busy times",
  ],
  cannot: ["While the Google app is in Testing, only listed test users can connect", "Refresh tokens may expire after 7 days in Testing"],
};

export async function getCreds<T = Record<string, string>>(workspaceId: string, provider: Provider): Promise<T | null> {
  const row = await prisma.integration.findUnique({ where: { workspaceId_provider: { workspaceId, provider } } });
  if (!row?.encryptedCreds || row.status === "NOT_CONNECTED") return null;
  try {
    return JSON.parse(decrypt(row.encryptedCreds)) as T;
  } catch {
    return null;
  }
}

export async function saveCreds(workspaceId: string, provider: Provider, creds: Record<string, string>) {
  const def = provider === "GOOGLE" ? null : PROVIDER_DEFS[provider];
  const hints: Record<string, string> = {};
  for (const [k, v] of Object.entries(creds)) {
    const secret = def?.fields.find((f) => f.key === k)?.secret ?? true;
    hints[k] = secret ? mask(v) : v;
  }
  return prisma.integration.upsert({
    where: { workspaceId_provider: { workspaceId, provider } },
    create: { workspaceId, provider, status: "CONNECTED", encryptedCreds: encrypt(JSON.stringify(creds)), hints, lastOkAt: new Date() },
    update: { status: "CONNECTED", encryptedCreds: encrypt(JSON.stringify(creds)), hints, lastError: null, lastOkAt: new Date() },
  });
}

export async function markOk(workspaceId: string, provider: Provider) {
  await prisma.integration
    .updateMany({ where: { workspaceId, provider, status: { not: "NOT_CONNECTED" } }, data: { status: "CONNECTED", lastOkAt: new Date() } })
    .catch(() => null);
}

export async function markError(workspaceId: string, provider: Provider, error: string, setErrorStatus = true) {
  await prisma.integration
    .updateMany({
      where: { workspaceId, provider, status: { not: "NOT_CONNECTED" } },
      data: { lastError: error.slice(0, 500), lastErrorAt: new Date(), ...(setErrorStatus ? { status: "ERROR" } : {}) },
    })
    .catch(() => null);
}

export async function logEvent(e: {
  workspaceId?: string | null;
  provider: Provider;
  direction: EventDirection;
  type: string;
  result: EventResult;
  externalId?: string | null;
  summary?: string | null;
  error?: string | null;
}) {
  try {
    await prisma.integrationEvent.create({
      data: {
        workspaceId: e.workspaceId ?? null,
        provider: e.provider,
        direction: e.direction,
        type: e.type,
        result: e.result,
        externalId: e.externalId ?? null,
        summary: e.summary?.slice(0, 300) ?? null,
        error: e.error?.slice(0, 500) ?? null,
      },
    });
  } catch {
    /* duplicate externalId on a log row: ignore */
  }
}
