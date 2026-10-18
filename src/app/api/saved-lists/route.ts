import { z } from "zod";
import { route, body } from "@/server/http";
import { prisma } from "@/server/db";
import { getContext, requirePerm } from "@/server/context";
import { contactFilterSchema } from "@/server/services/crm";

export const GET = route(async () => {
  const ctx = await getContext();
  return prisma.savedList.findMany({ where: { workspaceId: ctx.workspaceId, userId: ctx.userId }, orderBy: { createdAt: "asc" } });
});

export const POST = route(async (req) => {
  const ctx = await getContext();
  requirePerm(ctx, "crm.view");
  const b = await body(req, z.object({ name: z.string().trim().min(1).max(50), filters: contactFilterSchema }));
  const l = await prisma.savedList.create({ data: { workspaceId: ctx.workspaceId, userId: ctx.userId, name: b.name, filters: b.filters } });
  return { id: l.id };
});
