import { z } from "zod";
import { route, body, query, HttpError } from "@/server/http";
import { prisma } from "@/server/db";
import { getContext, requirePerm, actorOf } from "@/server/context";
import { contactFilterSchema, contactWhere, cleanCustomValues, contactFields } from "@/server/services/crm";
import { pageParams, phoneSchema } from "@/server/schemas";
import { logActivity } from "@/server/audit";
import { Prisma } from "@prisma/client";

export const GET = route(async (req) => {
  const ctx = await getContext();
  requirePerm(ctx, "crm.view");
  const q = query(req);
  const filters = contactFilterSchema.parse(q);
  const { page, pageSize, skip, take } = pageParams(q);
  const where = contactWhere(ctx, filters);
  const [total, rows] = await Promise.all([
    prisma.contact.count({ where }),
    prisma.contact.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: {
        company: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
        _count: { select: { opportunities: true } },
      },
    }),
  ]);
  return { total, page, pageSize, rows };
});

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().email("Enter a valid email").or(z.literal("")).optional(),
  phone: phoneSchema.optional(),
  companyId: z.string().nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).optional(),
  customValues: z.record(z.unknown()).optional(),
});

export const POST = route(async (req) => {
  const ctx = await getContext();
  requirePerm(ctx, "crm.create");
  const b = await body(req, createSchema);
  if (b.companyId && !(await prisma.company.findFirst({ where: { id: b.companyId, workspaceId: ctx.workspaceId } })))
    throw new HttpError(400, "Unknown company.");
  const fields = await contactFields(ctx.workspaceId);
  const c = await prisma.contact.create({
    data: {
      workspaceId: ctx.workspaceId,
      name: b.name,
      email: b.email || null,
      phone: b.phone ?? null,
      companyId: b.companyId || null,
      tags: b.tags ?? [],
      ownerId: ctx.userId,
      customValues: cleanCustomValues(fields, b.customValues) as Prisma.InputJsonValue,
    },
  });
  await logActivity(prisma, { workspaceId: ctx.workspaceId, type: "SYSTEM", actor: actorOf(ctx), summary: "Contact created", contactId: c.id });
  return { id: c.id };
});
