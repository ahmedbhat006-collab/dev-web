import { NextRequest, NextResponse } from "next/server";
import { appUrl } from "@/server/http";
import { getSession, verifyToken } from "@/server/auth/session";
import { exchangeCode } from "@/server/integrations/google";
import { logEvent } from "@/server/integrations/registry";
import { audit } from "@/server/audit";
import { prisma } from "@/server/db";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const back = (q: string) => NextResponse.redirect(`${appUrl()}/settings/profile?google=${q}`);
  const s = await getSession();
  const state = await verifyToken<{ uid: string; ws: string }>(sp.get("state") ?? "");
  if (!s || !state || state.uid !== s.userId) return back("invalid_state");
  if (sp.get("error")) {
    await logEvent({ workspaceId: state.ws, provider: "GOOGLE", direction: "IN", type: "oauth.callback", result: "ERROR", error: sp.get("error") });
    return back("denied");
  }
  try {
    const email = await exchangeCode(s.userId, state.ws, sp.get("code") ?? "");
    await logEvent({ workspaceId: state.ws, provider: "GOOGLE", direction: "IN", type: "oauth.callback", result: "OK", summary: `${s.user.name} connected ${email ?? "Google"}` });
    await audit(prisma, state.ws, { id: s.userId, name: s.user.name }, "INTEGRATION_CONNECTED", { type: "GoogleCalendar", id: s.userId, label: `${s.user.name} (${email ?? "Google"})` });
    return back("connected");
  } catch (e) {
    await logEvent({ workspaceId: state.ws, provider: "GOOGLE", direction: "IN", type: "oauth.callback", result: "ERROR", error: (e as Error).message });
    return back("failed");
  }
}
