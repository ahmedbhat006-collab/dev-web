import { route, notFound } from "@/server/http";
import { prisma } from "@/server/db";
import { getContext, requirePerm, seesAll } from "@/server/context";
import { recoveryReasons } from "@/server/services/leads";

export const GET = route(async (_req, { params }) => {
  const { id } = await params;
  const ctx = await getContext();
  requirePerm(ctx, "crm.view");
  const lead = await prisma.lead.findFirst({
    where: { id, workspaceId: ctx.workspaceId, ...(seesAll(ctx) ? {} : { assigneeId: ctx.userId }) },
    include: {
      contact: { include: { company: { select: { name: true } } } },
      assignee: { select: { id: true, name: true, status: true } },
      opportunity: { select: { id: true, title: true, stage: { select: { name: true } } } },
      activities: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
  if (!lead) throw notFound("Lead");
  const rule = await prisma.assignmentRule.findUnique({ where: { workspaceId: ctx.workspaceId }, include: { levels: { orderBy: { order: "asc" } } } });
  return {
    ...lead,
    serverNow: new Date().toISOString(),
    reasons: recoveryReasons(lead, rule?.idleSec ?? 600),
    totalLevels: rule?.levels.length ?? 0,
    canAck: lead.assigneeId === ctx.userId && !lead.acknowledgedAt && lead.status !== "CLOSED",
    canReassign: ctx.perms.has("leads.reassign") && lead.status !== "CLOSED",
  };
});
