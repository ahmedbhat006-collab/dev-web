import { z } from "zod";
import { Prisma } from "@prisma/client";
import { route, body, HttpError, notFound } from "@/server/http";
import { prisma } from "@/server/db";
import { getContext, requirePerm, actorOf, seesAll } from "@/server/context";
import { contactScope, cleanCustomValues, contactFields, maskOpp } from "@/server/services/crm";
import { phoneSchema } from "@/server/schemas";
import { audit, logActivity } from "@/server/audit";

/** Full customer view (F2.8): conversations, opportunities, payments, appointments, owner, activity. */
export const GET = route(async (_req, { params }) => {
  const { id } = await params;
  const ctx = await getContext();
  requirePerm(ctx, "crm.view");
  const c = await prisma.contact.findFirst({
    where: { id, ...contactScope(ctx) },
    include: {
      company: true,
      owner: { select: { id: true, name: true, status: true } },
      opportunities: { include: { stage: true, pipeline: { select: { id: true, name: true } }, owner: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
      payments: { include: { requestedBy: { select: { name: true } }, opportunity: { select: { id: true, title: true } } }, orderBy: { createdAt: "desc" } },
      appointments: { include: { user: { select: { id: true, name: true } } }, orderBy: { startUtc: "desc" } },
      leads: { include: { assignee: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" } },
      conversations: { select: { id: true, unread: true, lastMessageAt: true, assigneeId: true } },
      activities: { orderBy: { createdAt: "desc" }, take: 100 },
    },
  });
  if (!c) throw notFound("Contact");
  const fields = await contactFields(ctx.workspaceId);
  return { ...c, opportunities: c.opportunities.map((o) => maskOpp(ctx, o)), fields };
});

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().email().or(z.literal("")).optional(),
  phone: phoneSchema.optional(),
  companyId: z.string().nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).optional(),
  ownerId: z.string().nullable().optional(),
  customValues: z.record(z.unknown()).optional(),
  optedOut: z.boolean().optional(),
  optOutReason: z.string().max(200).optional(),
});

export const PATCH = route(async (req, { params }) => {
  const { id } = await params;
  const ctx = await getContext();
  requirePerm(ctx, "crm.edit");
  const b = await body(req, patchSchema);
  const c = await prisma.contact.findFirst({ where: { id, ...contactScope(ctx) } });
  if (!c) throw notFound("Contact");
  if (b.companyId && !(await prisma.company.findFirst({ where: { id: b.companyId, workspaceId: ctx.workspaceId } })))
    throw new HttpError(400, "Unknown company.");
  if (b.ownerId !== undefined) {
    if (!seesAll(ctx)) throw new HttpError(403, "Only managers can change a contact's owner.");
    if (b.ownerId && !(await prisma.user.findFirst({ where: { id: b.ownerId, workspaceId: ctx.workspaceId, active: true } })))
      throw new HttpError(400, "Choose an active employee.");
  }
  const fields = await contactFields(ctx.workspaceId);
  const custom = cleanCustomValues(fields, b.customValues, c.customValues as Record<string, unknown>);
  await prisma.contact.update({
    where: { id },
    data: {
      name: b.name,
      email: b.email === undefined ? undefined : b.email || null,
      phone: b.phone === undefined ? undefined : b.phone,
      companyId: b.companyId === undefined ? undefined : b.companyId,
      tags: b.tags,
      ownerId: b.ownerId === undefined ? undefined : b.ownerId,
      customValues: custom as Prisma.InputJsonValue,
      optedOut: b.optedOut,
      optOutReason: b.optedOut === undefined ? undefined : b.optedOut ? b.optOutReason || "Marked by staff" : null,
    },
  });
  const changes: string[] = [];
  if (b.name && b.name !== c.name) changes.push("name");
  if (b.email !== undefined && (b.email || null) !== c.email) changes.push("email");
  if (b.phone !== undefined && b.phone !== c.phone) changes.push("phone");
  if (b.tags) changes.push("tags");
  if (b.customValues) changes.push(...fields.filter((f) => f.key in (b.customValues ?? {})).map((f) => f.name));
  if (b.optedOut !== undefined && b.optedOut !== c.optedOut) changes.push(b.optedOut ? "opted out of messages" : "opted back in");
  if (changes.length)
    await logActivity(prisma, { workspaceId: ctx.workspaceId, type: "FIELD_EDIT", actor: actorOf(ctx), contactId: id, summary: `Edited ${changes.join(", ")}` });
  return { ok: true };
});

export const DELETE = route(async (_req, { params }) => {
  const { id } = await params;
  const ctx = await getContext();
  requirePerm(ctx, "crm.delete");
  const c = await prisma.contact.findFirst({ where: { id, ...contactScope(ctx) }, include: { _count: { select: { payments: true, opportunities: true, leads: true } } } });
  if (!c) throw notFound("Contact");
  if (c._count.payments)
    throw new HttpError(409, `${c.name} has ${c._count.payments} payment record(s). Payment history must be kept, so this contact can't be deleted.`);
  await prisma.contact.delete({ where: { id } });
  await audit(prisma, ctx.workspaceId, actorOf(ctx), "CONTACT_DELETED", { type: "Contact", id, label: c.name },
    { name: c.name, email: c.email, phone: c.phone, opportunities: c._count.opportunities, leads: c._count.leads } as Prisma.InputJsonValue, null);
  return { ok: true };
});
