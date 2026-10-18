import { z } from "zod";
import { route, body } from "@/server/http";
import { prisma } from "@/server/db";
import { getContext, requirePerm, actorOf } from "@/server/context";
import { audit } from "@/server/audit";
import { permsSchema } from "@/server/schemas";

export const GET = route(async () => {
  const ctx = await getContext();
  const roles = await prisma.role.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { users: true } } },
  });
  return roles.map((r) => ({ id: r.id, name: r.name, permissions: r.permissions, users: r._count.users }));
});

export const POST = route(async (req) => {
  const ctx = await getContext();
  requirePerm(ctx, "users.manage");
  const b = await body(req, z.object({ name: z.string().trim().min(2).max(40), permissions: permsSchema }));
  const r = await prisma.role.create({ data: { workspaceId: ctx.workspaceId, name: b.name, permissions: b.permissions } });
  await audit(prisma, ctx.workspaceId, actorOf(ctx), "ROLE_CREATED", { type: "Role", id: r.id, label: r.name }, null, { permissions: r.permissions });
  return { id: r.id };
});
