import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { route, HttpError } from "@/server/http";
import { getContext } from "@/server/context";
import { authUrl, googleConfigured } from "@/server/integrations/google";
import { signToken } from "@/server/auth/session";

/** Starts the OAuth consent flow for the signed-in employee's own Google account. */
export const GET = route(async () => {
  const ctx = await getContext();
  if (!googleConfigured()) throw new HttpError(409, "Google Calendar isn't configured on this server (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).");
  const state = await signToken({ uid: ctx.userId, ws: ctx.workspaceId, n: randomBytes(8).toString("hex") }, 600);
  return NextResponse.redirect(authUrl(state));
});
