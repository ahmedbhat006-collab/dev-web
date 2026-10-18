import { z } from "zod";
import { route, body, HttpError } from "@/server/http";
import { prisma, tx } from "@/server/db";
import { getContext, requirePerm, actorOf } from "@/server/context";
import { audit } from "@/server/audit";

export const GET = route(async () => {
  const ctx = await getContext();
  return prisma.assignmentRule.findUnique({
    where: { workspaceId: ctx.workspaceId },
    include: { levels: { orderBy: { order: "asc" } } },
  });
});

const schema = z.object({
  maxOpenLeads: z.number().int().min(1).max(500),
  ackWindowSec: z.number().int().min(5, "Minimum 5 seconds").max(7 * 24 * 3600),
  idleSec: z.number().int().min(10).max(30 * 24 * 3600),
  backupUserId: z.string().nullable(),
  managerUserId: z.string().nullable(),
  levels: z
    .array(z.object({ target: z.enum(["NEXT_ELIGIBLE", "BACKUP", "MANAGER"]), seconds: z.number().int().min(5).max(7 * 24 * 3600) }))
    .min(1, "Add at least one escalation level")
    .max(10),
});

export const PUT = route(async (req) => {
  const ctx = await getContext();
  requirePerm(ctx, "leads.manage_rules");
  const b = await body(req, schema);
  for (const uid of [b.backupUserId, b.managerUserId])
    if (uid && !(await prisma.user.findFirst({ where: { id: uid, workspaceId: ctx.workspaceId, active: true } })))
      throw new HttpError(400, "Backup and manager must be active employees of this workspace.");
  const before = await prisma.assignmentRule.findUnique({ where: { workspaceId: ctx.workspaceId }, include: { levels: { orderBy: { order: "asc" } } } });
  if (!before) throw new HttpError(500, "Rules missing.");
  await tx(async (db) => {
    await db.assignmentRule.update({
      where: { id: before.id },
      data: { maxOpenLeads: b.maxOpenLeads, ackWindowSec: b.ackWindowSec, idleSec: b.idleSec, backupUserId: b.backupUserId, managerUserId: b.managerUserId },
    });
    await db.escalationLevel.deleteMany({ where: { ruleId: before.id } });
    await db.escalationLevel.createMany({ data: b.levels.map((l, i) => ({ ruleId: before.id, order: i + 1, target: l.target, seconds: l.seconds })) });
    await audit(db, ctx.workspaceId, actorOf(ctx), "ASSIGNMENT_RULES_UPDATED", { type: "AssignmentRule", id: before.id, label: "Assignment & escalation" },
      {
        maxOpenLeads: before.maxOpenLeads, ackWindowSec: before.ackWindowSec, idleSec: before.idleSec,
        backupUserId: before.backupUserId, managerUserId: before.managerUserId,
        levels: before.levels.map((l) => `${l.target}:${l.seconds}s`),
      },
      { ...b, levels: b.levels.map((l) => `${l.target}:${l.seconds}s`) });
  });
  return { ok: true };
});
