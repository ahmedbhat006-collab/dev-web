import { z } from "zod";
import { route, body } from "@/server/http";
import { prisma } from "@/server/db";
import { getContext, actorOf } from "@/server/context";
import { applyStatusChange } from "@/server/services/leads";
import { invalidateSessions } from "@/server/auth/session";

const schema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  notifyEmail: z.string().trim().email("Enter a valid email").or(z.literal("")).optional(),
  timezone: z.string().max(60).optional(),
  status: z.enum(["AVAILABLE", "BUSY", "ON_LEAVE", "OFFLINE"]).optional(),
});

export const PATCH = route(async (req) => {
  const ctx = await getContext();
  const b = await body(req, schema);
  if (b.timezone) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: b.timezone });
    } catch {
      b.timezone = undefined;
    }
  }
  let reassigned = 0;
  if (b.status) reassigned = (await applyStatusChange(actorOf(ctx), ctx.workspaceId, ctx.userId, b.status)).reassigned;
  await prisma.user.update({
    where: { id: ctx.userId },
    data: {
      name: b.name,
      timezone: b.timezone,
      notifyEmail: b.notifyEmail === undefined ? undefined : b.notifyEmail || null,
    },
  });
  invalidateSessions(ctx.userId);
  return { ok: true, reassigned };
});
