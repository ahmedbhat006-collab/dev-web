import { z } from "zod";
import { route, body, HttpError, notFound } from "@/server/http";
import { prisma } from "@/server/db";
import { getContext, requirePerm, actorOf } from "@/server/context";
import { audit } from "@/server/audit";
import { applyStatusChange } from "@/server/services/leads";
import { invalidateSessions } from "@/server/auth/session";

const schema = z.object({
  level: z.enum(["ADMIN", "USER"]).optional(),
  roleId: z.string().nullable().optional(),
  receivesLeads: z.boolean().optional(),
  active: z.boolean().optional(),
  status: z.enum(["AVAILABLE", "BUSY", "ON_LEAVE", "OFFLINE"]).optional(),
  notifyEmail: z.string().trim().email().nullable().optional().or(z.literal("")),
});

export const PATCH = route(async (req, { params }) => {
  const { id } = await params;
  const ctx = await getContext();
  const b = await body(req, schema);
  const target = await prisma.user.findFirst({ where: { id, workspaceId: ctx.workspaceId }, include: { role: true } });
  if (!target) throw notFound("User");

  const onlyStatus = Object.keys(b).length === 1 && b.status !== undefined;
  if (!(onlyStatus && id === ctx.userId)) requirePerm(ctx, "users.manage");
  if (target.level === "OWNER" && ctx.level !== "OWNER") throw new HttpError(403, "Admins can't modify the Owner.");
  if (b.level && id === ctx.userId) throw new HttpError(400, "You can't change your own level.");
  if (b.level === "ADMIN" && ctx.level !== "OWNER") throw new HttpError(403, "Only the Owner can make someone an Admin.");
  if (target.level === "ADMIN" && b.level && ctx.level !== "OWNER") throw new HttpError(403, "Only the Owner can change an Admin's level.");
  if (b.active === false && target.level === "OWNER") throw new HttpError(400, "The Owner can't be deactivated.");
  if (b.roleId && !(await prisma.role.findFirst({ where: { id: b.roleId, workspaceId: ctx.workspaceId } })))
    throw new HttpError(400, "Unknown role.");

  const actor = actorOf(ctx);
  let reassigned = 0;
  if (b.active === false && target.active) {
    reassigned += (await applyStatusChange(actor, ctx.workspaceId, id, "OFFLINE", true)).reassigned;
  } else if (b.status && b.status !== target.status) {
    reassigned += (await applyStatusChange(actor, ctx.workspaceId, id, b.status)).reassigned;
  }

  const data: Record<string, unknown> = {};
  if (b.level) data.level = b.level;
  if (b.roleId !== undefined) data.roleId = b.roleId;
  if (b.receivesLeads !== undefined) data.receivesLeads = b.receivesLeads;
  if (b.active === true) data.active = true;
  if (b.notifyEmail !== undefined) data.notifyEmail = b.notifyEmail || null;
  if (Object.keys(data).length) {
    const after = await prisma.user.update({ where: { id }, data, include: { role: true } });
    await audit(prisma, ctx.workspaceId, actor, "USER_UPDATED", { type: "User", id, label: target.name },
      { level: target.level, role: target.role?.name ?? null, receivesLeads: target.receivesLeads, active: target.active },
      { level: after.level, role: after.role?.name ?? null, receivesLeads: after.receivesLeads, active: after.active },
    );
  }
  invalidateSessions(id);
  return { ok: true, reassigned };
});
