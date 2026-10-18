import { z } from "zod";
import { route, body, HttpError } from "@/server/http";
import { prisma } from "@/server/db";
import { getContext, actorOf } from "@/server/context";
import { revoke } from "@/server/integrations/google";
import { audit } from "@/server/audit";
import { logEvent } from "@/server/integrations/registry";

/** Disconnect own calendar, or (with integrations.manage) another employee's. */
export const POST = route(async (req) => {
  const ctx = await getContext();
  const b = await body(req, z.object({ userId: z.string().optional() }));
  const userId = b.userId ?? ctx.userId;
  if (userId !== ctx.userId && !ctx.perms.has("integrations.manage")) throw new HttpError(403, "You can only disconnect your own calendar.");
  const u = await prisma.user.findFirst({ where: { id: userId, workspaceId: ctx.workspaceId } });
  if (!u) throw new HttpError(404, "User not found.");
  await revoke(userId);
  await logEvent({ workspaceId: ctx.workspaceId, provider: "GOOGLE", direction: "OUT", type: "oauth.revoke", result: "OK", summary: `${u.name} disconnected` });
  await audit(prisma, ctx.workspaceId, actorOf(ctx), "INTEGRATION_DISCONNECTED", { type: "GoogleCalendar", id: userId, label: u.name });
  return { ok: true };
});
