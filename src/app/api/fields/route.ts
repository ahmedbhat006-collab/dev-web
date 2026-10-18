import { z } from "zod";
import { route, body, query, HttpError } from "@/server/http";
import { prisma } from "@/server/db";
import { getContext, requirePerm, actorOf } from "@/server/context";
import { audit } from "@/server/audit";
import { randomBytes } from "crypto";

export const GET = route(async (req) => {
  const ctx = await getContext();
  const q = query(req);
  return prisma.customField.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      ...(q.entity === "CONTACT" || q.entity === "OPPORTUNITY" ? { entity: q.entity } : {}),
    },
    orderBy: [{ entity: "asc" }, { order: "asc" }, { createdAt: "asc" }],
    include: { pipeline: { select: { id: true, name: true } } },
  });
});

const schema = z.object({
  entity: z.enum(["CONTACT", "OPPORTUNITY"]),
  name: z.string().trim().min(1, "Name is required").max(50),
  type: z.enum(["TEXT", "NUMBER", "DATE", "DROPDOWN", "CHECKBOX"]),
  options: z.array(z.string().trim().min(1).max(50)).max(30).optional(),
  pipelineId: z.string().nullable().optional(),
});

export const POST = route(async (req) => {
  const ctx = await getContext();
  requirePerm(ctx, "settings.customize");
  const b = await body(req, schema);
  if (b.type === "DROPDOWN" && !b.options?.length) throw new HttpError(400, "Add at least one option for a dropdown.");
  if (b.pipelineId) {
    if (b.entity !== "OPPORTUNITY") throw new HttpError(400, "Only opportunity fields can belong to a pipeline.");
    if (!(await prisma.pipeline.findFirst({ where: { id: b.pipelineId, workspaceId: ctx.workspaceId } }))) throw new HttpError(400, "Unknown pipeline.");
  }
  const base = b.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30) || "field";
  const exists = await prisma.customField.findFirst({ where: { workspaceId: ctx.workspaceId, key: base } });
  const key = exists ? `${base}_${randomBytes(2).toString("hex")}` : base;
  const count = await prisma.customField.count({ where: { workspaceId: ctx.workspaceId, entity: b.entity } });
  const f = await prisma.customField.create({
    data: {
      workspaceId: ctx.workspaceId, entity: b.entity, name: b.name, key, type: b.type,
      options: b.type === "DROPDOWN" ? [...new Set(b.options)] : [], pipelineId: b.pipelineId || null, order: count,
    },
  });
  await audit(prisma, ctx.workspaceId, actorOf(ctx), "FIELD_CREATED", { type: "CustomField", id: f.id, label: f.name }, null, {
    entity: f.entity, name: f.name, type: f.type, options: f.options, pipelineId: f.pipelineId,
  });
  return { id: f.id };
});
