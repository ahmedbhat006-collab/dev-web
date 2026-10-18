import { route, query, HttpError } from "@/server/http";
import { prisma } from "@/server/db";
import { getContext } from "@/server/context";
import { pageParams } from "@/server/schemas";
import { Prisma } from "@prisma/client";

/** Synchronization history (I5.4): every inbound event and outbound call. */
export const GET = route(async (req) => {
  const ctx = await getContext();
  if (!ctx.perms.has("integrations.manage") && !ctx.perms.has("audit.view"))
    throw new HttpError(403, "You don't have permission to view the sync history.");
  const q = query(req);
  const { page, pageSize, skip, take } = pageParams(q);
  const where: Prisma.IntegrationEventWhereInput = {
    workspaceId: ctx.workspaceId,
    ...(q.provider ? { provider: q.provider as "STRIPE" } : {}),
    ...(q.result ? { result: q.result as "OK" } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.integrationEvent.count({ where }),
    prisma.integrationEvent.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
  ]);
  return { total, page, pageSize, rows };
});
