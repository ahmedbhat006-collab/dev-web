import { prisma } from "./db";
import { getSession } from "./auth/session";
import { ALL_PERMISSIONS } from "@/lib/permissions";

export type Me = {
  id: string;
  name: string;
  email: string;
  level: "OWNER" | "ADMIN" | "USER";
  status: "AVAILABLE" | "BUSY" | "ON_LEAVE" | "OFFLINE";
  timezone: string;
  roleName: string | null;
  perms: string[];
  workspace: { id: string; name: string; slug: string };
};

export async function loadMe(): Promise<Me | null> {
  const s = await getSession();
  if (!s) return null;
  const u = s.user;
  const ws = await prisma.workspace.findUnique({ where: { id: u.workspaceId } });
  if (!ws) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    level: u.level,
    status: u.status,
    timezone: u.timezone,
    roleName: u.level === "OWNER" ? "Owner" : (u.role?.name ?? null),
    perms: u.level === "OWNER" ? ALL_PERMISSIONS : (u.role?.permissions ?? []),
    workspace: { id: ws.id, name: ws.name, slug: ws.slug },
  };
}
