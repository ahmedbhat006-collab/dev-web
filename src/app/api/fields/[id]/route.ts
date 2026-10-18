import { z } from "zod";
import { route, body, HttpError, notFound } from "@/server/http";
import { prisma, tx } from "@/server/db";
import { getContext, requirePerm, actorOf } from "@/server/context";
import { audit } from "@/server/audit";

export const PATCH = route(async (req, { params }) => {
  const { id } = await params;
  const ctx = await getContext();
  requirePerm(ctx, "settings.customize");
  const b = await body(req, z.object({
    name: z.string().trim().min(1).max(50).optional(),
    options: z.array(z.string().trim().min(1).max(50)).max(30).optional(),
  }));
  const f = await prisma.customField.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
  if (!f) throw notFound("Field");
  if (b.options && f.type !== "DROPDOWN") throw new HttpError(400, "Only dropdown fields have options.");
  const after = await prisma.customField.update({ where: { id }, data: { name: b.name, options: b.options ? [...new Set(b.options)] : undefined } });
  await audit(prisma, ctx.workspaceId, actorOf(ctx), "FIELD_UPDATED", { type: "CustomField", id, label: after.name },
    { name: f.name, options: f.options }, { name: after.name, options: after.options });
  return { ok: true };
});

/** Deleting a field also strips its values from every record and from stage requirements (no orphaned data). */
export const DELETE = route(async (_req, { params }) => {
  const { id } = await params;
  const ctx = await getContext();
  requirePerm(ctx, "settings.customize");
  const f = await prisma.customField.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
  if (!f) throw notFound("Field");
  await tx(async (db) => {
    const table = f.entity === "CONTACT" ? "Contact" : "Opportunity";
    await db.$executeRawUnsafe(
      `UPDATE "${table}" SET "customValues" = "customValues" - $1::text WHERE "workspaceId" = $2 AND "customValues" ? $1::text`,
      f.key,
      ctx.workspaceId,
    );
    const stages = await db.stage.findMany({ where: { workspaceId: ctx.workspaceId, requiredFieldIds: { has: id } } });
    for (const s of stages)
      await db.stage.update({ where: { id: s.id }, data: { requiredFieldIds: s.requiredFieldIds.filter((x) => x !== id) } });
    await db.customField.delete({ where: { id } });
    await audit(db, ctx.workspaceId, actorOf(ctx), "FIELD_DELETED", { type: "CustomField", id, label: f.name },
      { entity: f.entity, name: f.name, type: f.type, key: f.key }, null);
  });
  return { ok: true };
});
