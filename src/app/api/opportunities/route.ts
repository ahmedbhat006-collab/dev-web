import { z } from "zod";
import { Prisma } from "@prisma/client";
import { route, body, query, HttpError } from "@/server/http";
import { prisma } from "@/server/db";
import { getContext, requirePerm, actorOf, can } from "@/server/context";
import { oppScope, maskOpp, cleanCustomValues, opportunityFields, contactScope } from "@/server/services/crm";
import { logActivity } from "@/server/audit";

export const GET = route(async (req) => {
  const ctx = await getContext();
  requirePerm(ctx, "crm.view");
  const q = query(req);
  const where: Prisma.OpportunityWhereInput = {
    ...oppScope(ctx),
    ...(q.pipelineId ? { pipelineId: q.pipelineId } : {}),
    ...(q.stageId ? { stageId: q.stageId } : {}),
    ...(q.ownerId ? { ownerId: q.ownerId === "me" ? ctx.userId : q.ownerId } : {}),
    ...(q.q ? { OR: [{ title: { contains: q.q, mode: "insensitive" } }, { contact: { name: { contains: q.q, mode: "insensitive" } } }] } : {}),
    ...(q.open === "true" ? { stage: { kind: "OPEN" } } : {}),
  };
  const rows = await prisma.opportunity.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: Math.min(500, Number(q.limit) || 500),
    include: {
      contact: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
      stage: { select: { id: true, name: true, kind: true } },
      pipeline: { select: { id: true, name: true } },
      payments: { select: { status: true } },
    },
  });
  return rows.map((o) => maskOpp(ctx, o));
});

const createSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  contactId: z.string(),
  pipelineId: z.string(),
  stageId: z.string().optional(),
  value: z.number().min(0).max(1e12).optional(),
  currency: z.string().length(3).optional(),
  customValues: z.record(z.unknown()).optional(),
});

export const POST = route(async (req) => {
  const ctx = await getContext();
  requirePerm(ctx, "crm.create");
  const b = await body(req, createSchema);
  if (b.value && !can(ctx, "opportunity.value.view")) throw new HttpError(403, "You can't set opportunity values.");
  const contact = await prisma.contact.findFirst({ where: { id: b.contactId, ...contactScope(ctx) } });
  if (!contact) throw new HttpError(400, "Choose a contact you have access to.");
  const pipeline = await prisma.pipeline.findFirst({
    where: { id: b.pipelineId, workspaceId: ctx.workspaceId },
    include: { stages: { orderBy: { order: "asc" } } },
  });
  if (!pipeline) throw new HttpError(400, "Unknown pipeline.");
  const stage = b.stageId ? pipeline.stages.find((s) => s.id === b.stageId) : pipeline.stages.find((s) => s.kind === "OPEN");
  if (!stage) throw new HttpError(400, "Choose a stage from this pipeline.");
  const fields = await opportunityFields(ctx.workspaceId, pipeline.id);
  const custom = cleanCustomValues(fields, b.customValues);
  const missing = fields.filter((f) => stage.requiredFieldIds.includes(f.id) && (custom[f.key] === undefined || custom[f.key] === false));
  if (missing.length) throw new HttpError(422, `Fill in ${missing.map((m) => `"${m.name}"`).join(", ")} for the "${stage.name}" stage.`);
  const o = await prisma.opportunity.create({
    data: {
      workspaceId: ctx.workspaceId,
      title: b.title,
      contactId: contact.id,
      pipelineId: pipeline.id,
      stageId: stage.id,
      value: b.value ?? 0,
      currency: (b.currency ?? "USD").toUpperCase(),
      ownerId: contact.ownerId ?? ctx.userId,
      customValues: custom as Prisma.InputJsonValue,
    },
  });
  await logActivity(prisma, {
    workspaceId: ctx.workspaceId, type: "SYSTEM", actor: actorOf(ctx), opportunityId: o.id, contactId: contact.id,
    summary: `Opportunity "${o.title}" created in ${pipeline.name} · ${stage.name}`,
  });
  return { id: o.id };
});
