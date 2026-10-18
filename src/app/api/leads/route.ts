import { z } from "zod";
import { Prisma } from "@prisma/client";
import { route, body, query, HttpError } from "@/server/http";
import { prisma } from "@/server/db";
import { getContext, requirePerm, seesAll, actorOf } from "@/server/context";
import { createLead } from "@/server/services/leads";
import { pageParams, phoneSchema } from "@/server/schemas";

export const GET = route(async (req) => {
  const ctx = await getContext();
  requirePerm(ctx, "crm.view");
  const q = query(req);
  const { page, pageSize, skip, take } = pageParams(q);
  const all = q.scope === "all" && seesAll(ctx);
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const where: Prisma.LeadWhereInput = {
    workspaceId: ctx.workspaceId,
    ...(all ? {} : { assigneeId: ctx.userId }),
    ...(q.status === "open" ? { status: "OPEN" } : q.status === "acknowledged" ? { status: "ACKNOWLEDGED" } : q.status === "closed" ? { status: "CLOSED" } : q.status === "all" ? {} : { status: { in: ["OPEN", "ACKNOWLEDGED"] } }),
    ...(q.source && ["WEB_FORM", "WHATSAPP", "MANUAL", "CHATBOT"].includes(q.source) ? { source: q.source as "WEB_FORM" } : {}),
    ...(q.created === "today" ? { createdAt: { gte: startOfDay } } : {}),
    ...(q.q ? { contact: { name: { contains: q.q, mode: "insensitive" } } } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.findMany({
      where,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      skip,
      take,
      include: { contact: { select: { id: true, name: true, phone: true, email: true } }, assignee: { select: { id: true, name: true } } },
    }),
  ]);
  return { total, page, pageSize, rows, serverNow: new Date().toISOString() };
});

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().email("Enter a valid email").or(z.literal("")).optional(),
  phone: phoneSchema.optional(),
  companyName: z.string().trim().max(120).optional(),
  message: z.string().trim().max(2000).optional(),
});

export const POST = route(async (req) => {
  const ctx = await getContext();
  requirePerm(ctx, "crm.create");
  const b = await body(req, createSchema);
  if (!b.email && !b.phone) throw new HttpError(400, "Add an email or a phone number so the lead can be contacted.");
  const lead = await createLead({
    workspaceId: ctx.workspaceId, source: "MANUAL", name: b.name, email: b.email || null, phone: b.phone ?? null,
    companyName: b.companyName, message: b.message, actor: actorOf(ctx),
  });
  return { id: lead.id };
});
