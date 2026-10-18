import { Level } from "@prisma/client";
import { ALL_PERMISSIONS, Permission } from "@/lib/permissions";
import { getSession } from "./auth/session";
import { HttpError } from "./http";

export type Ctx = {
  userId: string;
  userName: string;
  email: string;
  workspaceId: string;
  level: Level;
  perms: Set<string>;
  timezone: string;
};

export async function getContext(): Promise<Ctx> {
  const s = await getSession();
  if (!s) throw new HttpError(401, "Your session has ended. Please sign in again.");
  const u = s.user;
  const perms = new Set<string>(u.level === "OWNER" ? ALL_PERMISSIONS : (u.role?.permissions ?? []));
  return {
    userId: u.id,
    userName: u.name,
    email: u.email,
    workspaceId: u.workspaceId,
    level: u.level,
    perms,
    timezone: u.timezone,
  };
}

export const can = (ctx: Ctx, p: Permission) => ctx.perms.has(p);

export function requirePerm(ctx: Ctx, ...ps: Permission[]) {
  for (const p of ps)
    if (!ctx.perms.has(p))
      throw new HttpError(403, "You don't have permission to do this. Ask your workspace owner for access.", {
        missing: p,
      });
}

/** Records the caller can see: everything with records.view_all, otherwise only their own. */
export const seesAll = (ctx: Ctx) => ctx.perms.has("records.view_all");

/** Company-wide dashboard figures for Owner/Admin (and anyone allowed to see all records). */
export const companyScope = (ctx: Ctx) => ctx.level !== "USER" || seesAll(ctx);

export const actorOf = (ctx: Ctx) => ({ id: ctx.userId, name: ctx.userName });
