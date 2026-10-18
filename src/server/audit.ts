import { ActivityType, Prisma } from "@prisma/client";
import { prisma, Tx } from "./db";

export type Actor = { id: string | null; name: string };
export const SYSTEM: Actor = { id: null, name: "System" };

type Json = Prisma.InputJsonValue | undefined;

/** Append-only audit entry. There is no update/delete path anywhere in the app. */
export async function audit(
  db: Tx | typeof prisma,
  workspaceId: string,
  actor: Actor,
  action: string,
  target: { type: string; id?: string | null; label?: string | null },
  before?: unknown,
  after?: unknown,
) {
  await db.auditLog.create({
    data: {
      workspaceId,
      actorId: actor.id,
      actorName: actor.name,
      action,
      targetType: target.type,
      targetId: target.id ?? null,
      targetLabel: target.label ?? null,
      before: (before ?? undefined) as Json,
      after: (after ?? undefined) as Json,
    },
  });
}

export async function logActivity(
  db: Tx | typeof prisma,
  a: {
    workspaceId: string;
    type: ActivityType;
    actor: Actor;
    summary: string;
    contactId?: string | null;
    opportunityId?: string | null;
    leadId?: string | null;
    fromUserId?: string | null;
    toUserId?: string | null;
    data?: unknown;
  },
) {
  await db.activity.create({
    data: {
      workspaceId: a.workspaceId,
      type: a.type,
      actorId: a.actor.id,
      actorName: a.actor.name,
      summary: a.summary,
      contactId: a.contactId ?? null,
      opportunityId: a.opportunityId ?? null,
      leadId: a.leadId ?? null,
      fromUserId: a.fromUserId ?? null,
      toUserId: a.toUserId ?? null,
      data: (a.data ?? undefined) as Json,
    },
  });
}

export async function notify(
  db: Tx | typeof prisma,
  n: { workspaceId: string; userId: string; title: string; body?: string; link?: string },
) {
  await db.notification.create({ data: n });
}
