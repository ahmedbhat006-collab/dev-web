import { route } from "@/server/http";
import { prisma } from "@/server/db";
import { getContext, requirePerm, seesAll } from "@/server/context";
import { recoveryWhere, recoveryReasons } from "@/server/services/leads";

export const GET = route(async () => {
  const ctx = await getContext();
  requirePerm(ctx, "crm.view");
  const rule = await prisma.assignmentRule.findUnique({ where: { workspaceId: ctx.workspaceId } });
  const idle = rule?.idleSec ?? 600;
  const rows = await prisma.lead.findMany({
    where: recoveryWhere(ctx, idle),
    orderBy: { createdAt: "asc" },
    take: 200,
    include: { contact: { select: { id: true, name: true } }, assignee: { select: { id: true, name: true, status: true } } },
  });
  return {
    idleSec: idle,
    scope: seesAll(ctx) ? "company" : "personal",
    rows: rows.map((l) => ({ ...l, reasons: recoveryReasons(l, idle) })),
  };
});
