import { createHmac, timingSafeEqual } from "crypto";
import { ProviderError, isTransientStatus } from "../jobs/queue";

const GRAPH = "https://graph.facebook.com/v23.0";

export type WhatsAppCreds = { phoneNumberId: string; accessToken: string; appSecret: string; verifyToken: string };

/** Meta signs the raw body with the app secret: X-Hub-Signature-256: sha256=<hex>. */
export function verifySignature(appSecret: string, rawBody: string, header: string | null) {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(header.slice(7), "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** E.164 without "+" for the API; "+<digits>" for storage. */
export const toE164 = (waId: string) => `+${waId.replace(/\D/g, "")}`;
export const toWaId = (phone: string) => phone.replace(/\D/g, "");

const PERMANENT_HINTS: Record<string, string> = {
  "131047": "More than 24 hours since the customer's last message. WhatsApp only allows template messages now.",
  "131030": "This number isn't on the test number's allowed recipient list. Add it in the Meta dashboard.",
  "131026": "The recipient can't receive WhatsApp messages (not on WhatsApp or blocked).",
  "190": "The WhatsApp access token expired or is invalid. Update it in Settings > Integrations.",
  "100": "WhatsApp rejected the request parameters. Check the phone number ID.",
};

export function explainWhatsAppError(code: string | undefined, fallback: string) {
  return (code && PERMANENT_HINTS[code]) || fallback;
}

export async function sendText(creds: WhatsAppCreds, toPhone: string, body: string) {
  let res: Response;
  try {
    res = await fetch(`${GRAPH}/${creds.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${creds.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: toWaId(toPhone), type: "text", text: { body } }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new ProviderError("Couldn't reach WhatsApp (network error or timeout). Will retry.", true);
  }
  const data = (await res.json().catch(() => ({}))) as {
    messages?: { id: string }[];
    error?: { message?: string; code?: number; error_subcode?: number };
  };
  if (!res.ok || !data.messages?.[0]?.id) {
    const code = data.error?.code != null ? String(data.error.code) : undefined;
    const transient = isTransientStatus(res.status) || code === "130429" || code === "131016";
    throw new ProviderError(explainWhatsAppError(code, data.error?.message || `WhatsApp returned HTTP ${res.status}`), transient, code);
  }
  return data.messages[0].id;
}

/** Light credential check used when connecting. */
export async function testConnection(creds: WhatsAppCreds) {
  const res = await fetch(`${GRAPH}/${creds.phoneNumberId}?fields=display_phone_number,verified_name`, {
    headers: { Authorization: `Bearer ${creds.accessToken}` },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!res) throw new ProviderError("Couldn't reach Meta's API.", true);
  const data = (await res.json().catch(() => ({}))) as { display_phone_number?: string; error?: { message?: string; code?: number } };
  if (!res.ok)
    throw new ProviderError(explainWhatsAppError(String(data.error?.code ?? ""), data.error?.message || "Invalid credentials"), false);
  return data.display_phone_number ?? "connected";
}
