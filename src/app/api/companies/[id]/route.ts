import { z } from "zod";
import { route, body, notFound } from "@/server/http";
import { prisma } from "@/server/db";
import { getContext, requirePerm, actorOf } from "@/server/context";
import { contactScope } from "@/server/services/crm";
import { audit } from "@/server/audit";

export const GET = route(async (_req, { params }) => {
  const { id } = await params;
  const ctx = await getContext();
  requirePerm(ctx, "crm.view");
  const c = await prisma.company.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
  if (!c) throw notFound("Company");
  const contacts = await prisma.contact.findMany({
    where: { companyId: id, ...contactScope(ctx) },
    include: { owner: { select: { name: true } }, _count: { select: { opportunities: true } } },
    orderBy: { name: "asc" },
  });
  return { ...c, contacts };
});

export const PATCH = route(async (req, { params }) => {
  const { id } = await params;
  const ctx = await getContext();
  requirePerm(ctx, "crm.edit");
  const b = await body(req, z.object({
    name: z.string().trim().min(1).max(120).optional(),
    domain: z.string().trim().max(120).optional(),
    phone: z.string().trim().max(40).optional(),
  }));
  const c = await prisma.company.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
  if (!c) throw notFound("Company");
  await prisma.company.update({ where: { id }, data: b });
  return { ok: true };
});

export const DELETE = route(async (_req, { params }) => {
  const { id } = await params;
  const ctx = await getContext();
  requirePerm(ctx, "crm.delete");
  const c = await prisma.company.findFirst({ where: { id, workspaceId: ctx.workspaceId }, include: { _count: { select: { contacts: true } } } });
  if (!c) throw notFound("Company");
  await prisma.company.delete({ where: { id } }); // contacts are kept and simply unlinked
  await audit(prisma, ctx.workspaceId, actorOf(ctx), "COMPANY_DELETED", { type: "Company", id, label: c.name },
    { name: c.name, contactsUnlinked: c._count.contacts }, null);
  return { ok: true };
});
