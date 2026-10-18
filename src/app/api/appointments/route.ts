import { z } from "zod";
import { route, body, query } from "@/server/http";
import { prisma } from "@/server/db";
import { getContext, requirePerm, seesAll } from "@/server/context";
import { book } from "@/server/services/appointments";

export const GET = route(async (req) => {
  const ctx = await getContext();
  requirePerm(ctx, "crm.view");
  const q = query(req);
  const now = new Date();
  return prisma.appointment.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      ...(seesAll(ctx) ? {} : { userId: ctx.userId }),
      ...(q.range === "past" ? { startUtc: { lt: now } } : { startUtc: { gte: new Date(now.getTime() - 3600_000) }, status: "SCHEDULED" }),
    },
    orderBy: { startUtc: q.range === "past" ? "desc" : "asc" },
    take: 100,
    include: { contact: { select: { id: true, name: true } }, user: { select: { id: true, name: true } }, opportunity: { select: { id: true, title: true } } },
  });
});

const schema = z.object({
  contactId: z.string(),
  opportunityId: z.string().nullable().optional(),
  userId: z.string().min(1, "Choose an employee"),
  title: z.string().trim().min(1, "Add a title").max(120),
  notes: z.string().trim().max(1000).optional(),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Pick a date and time"),
  durationMin: z.number().int().min(5).max(8 * 60),
  timezone: z.string().min(1).max(60),
  force: z.boolean().optional(),
});

export const POST = route(async (req) => {
  const ctx = await getContext();
  requirePerm(ctx, "crm.edit");
  const b = await body(req, schema);
  const a = await book(ctx, b);
  return { id: a.id };
});
