import { z } from "zod";
import { route, body, HttpError, notFound } from "@/server/http";
import { prisma } from "@/server/db";
import { getContext, requirePerm, actorOf } from "@/server/context";
import { audit } from "@/server/audit";

export const PATCH = route(async (req, { params }) => {
  const { id } = await params;
  const ctx = await getContext();
  requirePerm(ctx, "settings.customize");
  const b = await body(req, z.object({ name: z.string().trim().min(2).max(60) }));
  const p = await prisma.pipeline.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
  if (!p) throw notFound("Pipeline");
  await prisma.pipeline.update({ where: { id }, data: { name: b.name } });
  await audit(prisma, ctx.workspaceId, actorOf(ctx), "PIPELINE_RENAMED", { type: "Pipeline", id, label: b.name }, { name: p.name }, { name: b.name });
  return { ok: true };
});

export const DELETE = route(async (_req, { params }) => {
  const { id } = await params;
  const ctx = await getContext();
  requirePerm(ctx, "settings.customize");
  const p = await prisma.pipeline.findFirst({ where: { id, workspaceId: ctx.workspaceId }, include: { _count: { select: { opportunities: true } } } });
  if (!p) throw notFound("Pipeline");
  if ((await prisma.pipeline.count({ where: { workspaceId: ctx.workspaceId } })) <= 1)
    throw new HttpError(409, "You need at least one pipeline.");
  if (p._count.opportunities)
    throw new HttpError(409, `This pipeline still has ${p._count.opportunities} opportunities. Move or delete them first.`);
  await prisma.pipeline.delete({ where: { id } });
  await audit(prisma, ctx.workspaceId, actorOf(ctx), "PIPELINE_DELETED", { type: "Pipeline", id, label: p.name }, { name: p.name }, null);
  return { ok: true };
});
