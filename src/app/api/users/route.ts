import { z } from "zod";
import { route, body, HttpError } from "@/server/http";
import { prisma } from "@/server/db";
import { getContext, requirePerm, actorOf } from "@/server/context";
import { hashPassword } from "@/server/auth/password";
import { audit } from "@/server/audit";

export const GET = route(async () => {
  const ctx = await getContext();
  const users = await prisma.user.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      id: true, name: true, email: true, level: true, status: true, active: true, receivesLeads: true,
      timezone: true, notifyEmail: true, createdAt: true,
      role: { select: { id: true, name: true } },
      google: { select: { googleEmail: true, needsReconnect: true, lastOkAt: true } },
    },
  });
  const counts = await prisma.lead.groupBy({
    by: ["assigneeId"],
    where: { workspaceId: ctx.workspaceId, status: { in: ["OPEN", "ACKNOWLEDGED"] } },
    _count: { _all: true },
  });
  const m = new Map(counts.map((c) => [c.assigneeId, c._count._all]));
  const canManage = ctx.perms.has("users.manage");
  return users.map((u) => ({
    ...u,
    email: canManage || u.id === ctx.userId ? u.email : undefined,
    notifyEmail: canManage || u.id === ctx.userId ? u.notifyEmail : undefined,
    openLeads: m.get(u.id) ?? 0,
    calendar: u.google ? (u.google.needsReconnect ? "NEEDS_RECONNECT" : "CONNECTED") : "NOT_CONNECTED",
    google: undefined,
  }));
});

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, "Temporary password needs at least 8 characters").max(200),
  level: z.enum(["ADMIN", "USER"]),
  roleId: z.string().nullable().optional(),
});

export const POST = route(async (req) => {
  const ctx = await getContext();
  requirePerm(ctx, "users.manage");
  const b = await body(req, createSchema);
  if (b.level === "ADMIN" && ctx.level !== "OWNER") throw new HttpError(403, "Only the Owner can create Admins.");
  if (await prisma.user.findUnique({ where: { email: b.email } })) throw new HttpError(409, "That email is already in use.");
  if (b.roleId && !(await prisma.role.findFirst({ where: { id: b.roleId, workspaceId: ctx.workspaceId } })))
    throw new HttpError(400, "Unknown role.");
  const u = await prisma.user.create({
    data: {
      workspaceId: ctx.workspaceId,
      name: b.name,
      email: b.email,
      passwordHash: await hashPassword(b.password),
      level: b.level,
      roleId: b.roleId ?? null,
      timezone: ctx.timezone,
    },
  });
  await audit(prisma, ctx.workspaceId, actorOf(ctx), "USER_INVITED", { type: "User", id: u.id, label: u.name }, null, {
    email: u.email, level: u.level, roleId: u.roleId,
  });
  return { id: u.id };
});
