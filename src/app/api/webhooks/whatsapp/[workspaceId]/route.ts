import { NextRequest, NextResponse } from "next/server";
import { getCreds, logEvent, markOk } from "@/server/integrations/registry";
import { verifySignature, WhatsAppCreds } from "@/server/integrations/whatsapp";
import { handleWhatsAppPayload } from "@/server/services/messaging";

type Ctx = { params: Promise<{ workspaceId: string }> };

/** Meta's one-time webhook verification handshake. */
export async function GET(req: NextRequest, { params }: Ctx) {
  const { workspaceId } = await params;
  const sp = req.nextUrl.searchParams;
  const creds = await getCreds<WhatsAppCreds>(workspaceId, "WHATSAPP");
  if (sp.get("hub.mode") === "subscribe" && creds && sp.get("hub.verify_token") === creds.verifyToken) {
    await logEvent({ workspaceId, provider: "WHATSAPP", direction: "IN", type: "webhook.verify", result: "OK", summary: "Webhook verified by Meta" });
    return new NextResponse(sp.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  await logEvent({ workspaceId, provider: "WHATSAPP", direction: "IN", type: "webhook.verify", result: "REJECTED", error: "Verify token mismatch or WhatsApp not connected" });
  return new NextResponse("Forbidden", { status: 403 });
}

/** Incoming messages + delivery statuses. Signature is verified before anything is stored. */
export async function POST(req: NextRequest, { params }: Ctx) {
  const { workspaceId } = await params;
  const raw = await req.text();
  const creds = await getCreds<WhatsAppCreds>(workspaceId, "WHATSAPP");
  if (!creds) {
    await logEvent({ workspaceId, provider: "WHATSAPP", direction: "IN", type: "webhook", result: "REJECTED", error: "WhatsApp is not connected for this workspace" });
    return NextResponse.json({ error: "Not configured" }, { status: 404 });
  }
  if (!verifySignature(creds.appSecret, raw, req.headers.get("x-hub-signature-256"))) {
    await logEvent({ workspaceId, provider: "WHATSAPP", direction: "IN", type: "webhook", result: "REJECTED", error: "Invalid X-Hub-Signature-256: request was forged or altered" });
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    await logEvent({ workspaceId, provider: "WHATSAPP", direction: "IN", type: "webhook", result: "REJECTED", error: "Body is not valid JSON" });
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }
  try {
    await handleWhatsAppPayload(workspaceId, creds.phoneNumberId, payload as Parameters<typeof handleWhatsAppPayload>[2]);
    await markOk(workspaceId, "WHATSAPP");
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[whatsapp webhook]", e);
    // 500 makes Meta retry later; duplicates are safely ignored on the retry.
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
