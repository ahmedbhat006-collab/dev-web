import { z } from "zod";
import { route, body } from "@/server/http";
import { prisma, tx } from "@/server/db";
import { getContext, requirePerm, actorOf } from "@/server/context";
import { createPipeline } from "@/server/services/workspace";
import { audit } from "@/server/audit";

export const GET = route(async () => {
  const ctx = await getContext();
  return prisma.pipeline.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: { order: "asc" },
    include: {
      stages: { orderBy: { order: "asc" }, include: { _count: { select: { opportunities: true } } } },
      fields: { orderBy: { order: "asc" } },
    },
  });
});

export const POST = route(async (req) => {
  const ctx = await getContext();
  requirePerm(ctx, "settings.customize");
  const b = await body(req, z.object({ name: z.string().trim().min(2).max(60) }));
  const count = await prisma.pipeline.count({ where: { workspaceId: ctx.workspaceId } });
  const p = await tx(async (db) => {
    const p = await createPipeline(db, ctx.workspaceId, b.name, count);
    await audit(db, ctx.workspaceId, actorOf(ctx), "PIPELINE_CREATED", { type: "Pipeline", id: p.id, label: p.name }, null, {
      name: p.name, stages: p.stages.map((s) => s.name),
    });
    return p;
  });
  return { id: p.id };
});
