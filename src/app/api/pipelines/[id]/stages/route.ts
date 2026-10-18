import { z } from "zod";
import { route, body, HttpError, notFound } from "@/server/http";
import { prisma, tx } from "@/server/db";
import { getContext, requirePerm, actorOf } from "@/server/context";
import { audit } from "@/server/audit";

/** Add a stage. */
export const POST = route(async (req, { params }) => {
  const { id } = await params;
  const ctx = await getContext();
  requirePerm(ctx, "settings.customize");
  const b = await body(req, z.object({ name: z.string().trim().min(1).max(40), kind: z.enum(["OPEN", "WON", "LOST"]).default("OPEN") }));
  const p = await prisma.pipeline.findFirst({ where: { id, workspaceId: ctx.workspaceId }, include: { stages: true } });
  if (!p) throw notFound("Pipeline");
  // New open stages go before the closed (won/lost) stages.
  const firstClosed = p.stages.filter((s) => s.kind !== "OPEN").sort((a, b) => a.order - b.order)[0];
  const s = await tx(async (db) => {
    let order = p.stages.length;
    if (b.kind === "OPEN" && firstClosed) {
      order = firstClosed.order;
      await db.stage.updateMany({ where: { pipelineId: id, order: { gte: order } }, data: { order: { increment: 1 } } });
    }
    const s = await db.stage.create({ data: { workspaceId: ctx.workspaceId, pipelineId: id, name: b.name, kind: b.kind, order } });
    await audit(db, ctx.workspaceId, actorOf(ctx), "STAGE_CREATED", { type: "Stage", id: s.id, label: `${p.name} · ${s.name}` }, null, { name: s.name, kind: s.kind });
    return s;
  });
  return { id: s.id };
});

/** Reorder stages: body { order: [stageId, ...] }. */
export const PUT = route(async (req, { params }) => {
  const { id } = await params;
  const ctx = await getContext();
  requirePerm(ctx, "settings.customize");
  const b = await body(req, z.object({ order: z.array(z.string()).min(1).max(50) }));
  const p = await prisma.pipeline.findFirst({ where: { id, workspaceId: ctx.workspaceId }, include: { stages: { orderBy: { order: "asc" } } } });
  if (!p) throw notFound("Pipeline");
  const ids = new Set(p.stages.map((s) => s.id));
  if (b.order.length !== ids.size || !b.order.every((x) => ids.has(x))) throw new HttpError(400, "The stage list is out of date. Reload and try again.");
  await tx(async (db) => {
    for (const [i, sid] of b.order.entries()) await db.stage.update({ where: { id: sid }, data: { order: i } });
    await audit(db, ctx.workspaceId, actorOf(ctx), "STAGES_REORDERED", { type: "Pipeline", id, label: p.name },
      { order: p.stages.map((s) => s.name) },
      { order: b.order.map((x) => p.stages.find((s) => s.id === x)!.name) });
  });
  return { ok: true };
});
