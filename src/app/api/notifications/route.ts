import { z } from "zod";
import { route, body } from "@/server/http";
import { prisma } from "@/server/db";
import { getContext } from "@/server/context";
import { recoveryWhere } from "@/server/services/leads";

export const GET = route(async () => {
  const ctx = await getContext();
  const rule = await prisma.assignmentRule.findUnique({ where: { workspaceId: ctx.workspaceId } });
  const [rows, unread, me, pendingLeads, recovery] = await Promise.all([
    prisma.notification.findMany({ where: { userId: ctx.userId }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.notification.count({ where: { userId: ctx.userId, readAt: null } }),
    prisma.user.findUnique({ where: { id: ctx.userId }, select: { status: true } }),
    prisma.lead.count({ where: { workspaceId: ctx.workspaceId, assigneeId: ctx.userId, status: "OPEN", acknowledgedAt: null } }),
    prisma.lead.count({ where: recoveryWhere(ctx, rule?.idleSec ?? 600) }),
  ]);
  return { rows, unread, status: me?.status, pendingLeads, recovery };
});

export const POST = route(async (req) => {
  const ctx = await getContext();
  const b = await body(req, z.object({ id: z.string().optional() }));
  await prisma.notification.updateMany({
    where: { userId: ctx.userId, readAt: null, ...(b.id ? { id: b.id } : {}) },
    data: { readAt: new Date() },
  });
  return { ok: true };
});
