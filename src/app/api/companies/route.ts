import { z } from "zod";
import { route, body, query } from "@/server/http";
import { prisma } from "@/server/db";
import { getContext, requirePerm } from "@/server/context";
import { pageParams } from "@/server/schemas";

export const GET = route(async (req) => {
  const ctx = await getContext();
  requirePerm(ctx, "crm.view");
  const q = query(req);
  const { page, pageSize, skip, take } = pageParams(q);
  const where = {
    workspaceId: ctx.workspaceId,
    ...(q.q ? { name: { contains: q.q, mode: "insensitive" as const } } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.company.count({ where }),
    prisma.company.findMany({ where, orderBy: { name: "asc" }, skip, take, include: { _count: { select: { contacts: true } } } }),
  ]);
  return { total, page, pageSize, rows };
});

export const POST = route(async (req) => {
  const ctx = await getContext();
  requirePerm(ctx, "crm.create");
  const b = await body(req, z.object({
    name: z.string().trim().min(1, "Name is required").max(120),
    domain: z.string().trim().max(120).optional(),
    phone: z.string().trim().max(40).optional(),
  }));
  const c = await prisma.company.create({ data: { workspaceId: ctx.workspaceId, name: b.name, domain: b.domain || null, phone: b.phone || null } });
  return { id: c.id };
});
