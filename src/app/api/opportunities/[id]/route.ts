import { route, body, HttpError, notFound } from "@/server/http";
import { prisma } from "@/server/db";
import { getContext, requirePerm, actorOf } from "@/server/context";
import { oppScope, maskOpp, opportunityFields, oppPatchSchema, updateOpportunity } from "@/server/services/crm";
import { audit } from "@/server/audit";

export const GET = route(async (_req, { params }) => {
  const { id } = await params;
  const ctx = await getContext();
  requirePerm(ctx, "crm.view");
  const o = await prisma.opportunity.findFirst({
    where: { id, ...oppScope(ctx) },
    include: {
      contact: { select: { id: true, name: true, email: true, phone: true, optedOut: true } },
      owner: { select: { id: true, name: true } },
      stage: true,
      pipeline: { include: { stages: { orderBy: { order: "asc" } } } },
      payments: { include: { requestedBy: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
      appointments: { include: { user: { select: { id: true, name: true } } }, orderBy: { startUtc: "desc" } },
      leads: { include: { assignee: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" } },
      activities: { orderBy: { createdAt: "desc" }, take: 100 },
    },
  });
  if (!o) throw notFound("Opportunity");
  const fields = await opportunityFields(ctx.workspaceId, o.pipelineId);
  return { ...maskOpp(ctx, o), fields };
});

export const PATCH = route(async (req, { params }) => {
  const { id } = await params;
  const ctx = await getContext();
  requirePerm(ctx, "crm.edit");
  const b = await body(req, oppPatchSchema);
  const o = await updateOpportunity(ctx, id, b);
  return maskOpp(ctx, o);
});

export const DELETE = route(async (_req, { params }) => {
  const { id } = await params;
  const ctx = await getContext();
  requirePerm(ctx, "crm.delete");
  const o = await prisma.opportunity.findFirst({ where: { id, ...oppScope(ctx) }, include: { _count: { select: { payments: true } } } });
  if (!o) throw notFound("Opportunity");
  if (o._count.payments) throw new HttpError(409, "This opportunity has payment records, which must be kept. Move it to a Lost stage instead.");
  await prisma.opportunity.delete({ where: { id } });
  await audit(prisma, ctx.workspaceId, actorOf(ctx), "OPPORTUNITY_DELETED", { type: "Opportunity", id, label: o.title },
    { title: o.title, value: o.value, stageId: o.stageId }, null);
  return { ok: true };
});
