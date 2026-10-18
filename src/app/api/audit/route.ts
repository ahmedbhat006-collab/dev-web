import { Prisma } from "@prisma/client";
import { route, query } from "@/server/http";
import { prisma } from "@/server/db";
import { getContext, requirePerm } from "@/server/context";
import { pageParams } from "@/server/schemas";

/** Read-only. There is intentionally no POST/PATCH/DELETE for audit entries (F4.3). */
export const GET = route(async (req) => {
  const ctx = await getContext();
  requirePerm(ctx, "audit.view");
  const q = query(req);
  const { page, pageSize, skip, take } = pageParams(q);
  const where: Prisma.AuditLogWhereInput = {
    workspaceId: ctx.workspaceId,
    ...(q.action ? { action: q.action } : {}),
    ...(q.actorId ? { actorId: q.actorId === "system" ? null : q.actorId } : {}),
    ...(q.from || q.to
      ? {
          createdAt: {
            ...(q.from ? { gte: new Date(q.from) } : {}),
            ...(q.to ? { lte: new Date(new Date(q.to).getTime() + 24 * 3600 * 1000 - 1) } : {}),
          },
        }
      : {}),
  };
  const [total, rows, actions] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.auditLog.groupBy({ by: ["action"], where: { workspaceId: ctx.workspaceId }, orderBy: { action: "asc" } }),
  ]);
  return { total, page, pageSize, rows, actions: actions.map((a) => a.action) };
});
