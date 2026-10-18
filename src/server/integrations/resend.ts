import { ProviderError, isTransientStatus } from "../jobs/queue";

export type ResendCreds = { apiKey: string; from?: string };

export async function sendEmail(creds: ResendCreds, m: { to: string; subject: string; html: string; text?: string }) {
  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${creds.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: creds.from || "Dastak <onboarding@resend.dev>", to: [m.to], subject: m.subject, html: m.html, text: m.text }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new ProviderError("Couldn't reach Resend (network error or timeout).", true);
  }
  const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
  if (!res.ok) {
    let msg = data.message || `Resend returned HTTP ${res.status}`;
    if (res.status === 403 && /testing emails|verify a domain/i.test(msg))
      msg = `Resend free mode can only send to your own account email. ${msg}`;
    if (res.status === 401) msg = "The Resend API key is invalid. Update it in Settings > Integrations.";
    throw new ProviderError(msg, isTransientStatus(res.status), data.name);
  }
  return data.id ?? "";
}
