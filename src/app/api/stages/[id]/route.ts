import { z } from "zod";
import { route, body, query, HttpError, notFound } from "@/server/http";
import { prisma, tx } from "@/server/db";
import { getContext, requirePerm, actorOf } from "@/server/context";
import { audit, logActivity } from "@/server/audit";

export const PATCH = route(async (req, { params }) => {
  const { id } = await params;
  const ctx = await getContext();
  requirePerm(ctx, "settings.customize");
  const b = await body(req, z.object({
    name: z.string().trim().min(1).max(40).optional(),
    kind: z.enum(["OPEN", "WON", "LOST"]).optional(),
    requiredFieldIds: z.array(z.string()).max(30).optional(),
  }));
  const s = await prisma.stage.findFirst({ where: { id, workspaceId: ctx.workspaceId }, include: { pipeline: true } });
  if (!s) throw notFound("Stage");
  if (b.requiredFieldIds?.length) {
    const valid = await prisma.customField.count({
      where: { id: { in: b.requiredFieldIds }, workspaceId: ctx.workspaceId, entity: "OPPORTUNITY", OR: [{ pipelineId: null }, { pipelineId: s.pipelineId }] },
    });
    if (valid !== b.requiredFieldIds.length) throw new HttpError(400, "Required fields must be opportunity fields of this pipeline.");
  }
  const after = await prisma.stage.update({ where: { id }, data: b });
  await audit(prisma, ctx.workspaceId, actorOf(ctx), "STAGE_UPDATED", { type: "Stage", id, label: `${s.pipeline.name} · ${after.name}` },
    { name: s.name, kind: s.kind, requiredFieldIds: s.requiredFieldIds },
    { name: after.name, kind: after.kind, requiredFieldIds: after.requiredFieldIds });
  return { ok: true };
});

/** Delete a stage. If it holds opportunities, ?moveTo=<stageId> is required and they are moved first. */
export const DELETE = route(async (req, { params }) => {
  const { id } = await params;
  const ctx = await getContext();
  requirePerm(ctx, "settings.customize");
  const moveTo = query(req).moveTo;
  const s = await prisma.stage.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    include: { pipeline: { include: { stages: true } }, _count: { select: { opportunities: true } } },
  });
  if (!s) throw notFound("Stage");
  if (s.pipeline.stages.length <= 1) throw new HttpError(409, "A pipeline needs at least one stage.");
  let target: { id: string; name: string } | undefined;
  if (s._count.opportunities) {
    target = s.pipeline.stages.find((x) => x.id === moveTo && x.id !== id);
    if (!target)
      throw new HttpError(409, `"${s.name}" has ${s._count.opportunities} opportunities. Choose a stage to move them to.`, {
        needsMove: true, count: s._count.opportunities,
      });
  }
  await tx(async (db) => {
    if (target) {
      const opps = await db.opportunity.findMany({ where: { stageId: id }, select: { id: true, contactId: true } });
      await db.opportunity.updateMany({ where: { stageId: id }, data: { stageId: target.id, version: { increment: 1 } } });
      for (const o of opps)
        await logActivity(db, {
          workspaceId: ctx.workspaceId, type: "STAGE_CHANGE", actor: actorOf(ctx), opportunityId: o.id, contactId: o.contactId,
          summary: `Stage: ${s.name} → ${target.name} (stage "${s.name}" was deleted)`,
        });
    }
    await db.stage.delete({ where: { id } });
    const rest = await db.stage.findMany({ where: { pipelineId: s.pipelineId }, orderBy: { order: "asc" } });
    for (const [i, r] of rest.entries()) if (r.order !== i) await db.stage.update({ where: { id: r.id }, data: { order: i } });
    await audit(db, ctx.workspaceId, actorOf(ctx), "STAGE_DELETED", { type: "Stage", id, label: `${s.pipeline.name} · ${s.name}` },
      { name: s.name, opportunities: s._count.opportunities }, target ? { movedTo: target.name } : null);
  });
  return { ok: true };
});
