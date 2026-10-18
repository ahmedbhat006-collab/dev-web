import { z } from "zod";
import { route, body, notFound } from "@/server/http";
import { prisma } from "@/server/db";
import { getContext, requirePerm, actorOf } from "@/server/context";
import { audit } from "@/server/audit";
import { permsSchema } from "@/server/schemas";
import { invalidateSessions } from "@/server/auth/session";

export const PATCH = route(async (req, { params }) => {
  const { id } = await params;
  const ctx = await getContext();
  requirePerm(ctx, "users.manage");
  const b = await body(req, z.object({ name: z.string().trim().min(2).max(40).optional(), permissions: permsSchema.optional() }));
  const role = await prisma.role.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
  if (!role) throw notFound("Role");
  const after = await prisma.role.update({ where: { id }, data: { name: b.name, permissions: b.permissions } });
  invalidateSessions();
  await audit(prisma, ctx.workspaceId, actorOf(ctx), "ROLE_UPDATED", { type: "Role", id, label: after.name },
    { name: role.name, permissions: role.permissions }, { name: after.name, permissions: after.permissions });
  return { ok: true };
});

export const DELETE = route(async (_req, { params }) => {
  const { id } = await params;
  const ctx = await getContext();
  requirePerm(ctx, "users.manage");
  const role = await prisma.role.findFirst({ where: { id, workspaceId: ctx.workspaceId }, include: { _count: { select: { users: true } } } });
  if (!role) throw notFound("Role");
  await prisma.role.delete({ where: { id } }); // users keep their account; role set to none (no permissions)
  invalidateSessions();
  await audit(prisma, ctx.workspaceId, actorOf(ctx), "ROLE_DELETED", { type: "Role", id, label: role.name },
    { name: role.name, permissions: role.permissions, users: role._count.users }, null);
  return { ok: true };
});
