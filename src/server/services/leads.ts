import { LeadSource, Prisma, UserStatus } from "@prisma/client";
import { prisma, tx as transaction, Tx } from "../db";
import { Actor, SYSTEM, audit, logActivity, notify } from "../audit";
import { Ctx, seesAll } from "../context";
import { HttpError, appUrl, notFound } from "../http";
import { enqueueJob } from "../jobs/queue";
import { SOURCE_LABEL } from "@/lib/labels";

type Rule = Prisma.AssignmentRuleGetPayload<{ include: { levels: true } }>;
type Person = { id: string; name: string };
type Pick = { user: Person; via: "ROUND_ROBIN" | "BACKUP" | "MANAGER" | "OWNER" };

const AWAY: UserStatus[] = ["ON_LEAVE", "OFFLINE"];

/** Serialises assignment decisions per workspace (row lock on the rule). */
async function lockRule(db: Tx, workspaceId: string): Promise<Rule> {
  await db.$queryRaw`SELECT id FROM "AssignmentRule" WHERE "workspaceId" = ${workspaceId} FOR UPDATE`;
  const rule = await db.assignmentRule.findUnique({
    where: { workspaceId },
    include: { levels: { orderBy: { order: "asc" } } },
  });
  if (!rule) throw new HttpError(500, "Assignment rules are missing for this workspace.");
  return rule;
}

/** Available employee = status AVAILABLE and open-lead count below the limit (glossary). */
export async function eligibleUsers(db: Tx | typeof prisma, workspaceId: string, max: number, exclude: string[] = []) {
  const users = await db.user.findMany({
    where: {
      workspaceId,
      active: true,
      receivesLeads: true,
      status: "AVAILABLE",
      ...(exclude.length ? { id: { notIn: exclude } } : {}),
    },
    orderBy: { id: "asc" },
    select: { id: true, name: true },
  });
  if (!users.length) return [];
  const counts = await db.lead.groupBy({
    by: ["assigneeId"],
    where: { workspaceId, status: { in: ["OPEN", "ACKNOWLEDGED"] }, assigneeId: { in: users.map((u) => u.id) } },
    _count: { _all: true },
  });
  const m = new Map(counts.map((c) => [c.assigneeId, c._count._all]));
  return users.filter((u) => (m.get(u.id) ?? 0) < max);
}

async function person(db: Tx, workspaceId: string, id: string | null | undefined, allowAway = false) {
  if (!id) return null;
  const u = await db.user.findFirst({
    where: { id, workspaceId, active: true },
    select: { id: true, name: true, status: true },
  });
  if (!u || (!allowAway && AWAY.includes(u.status))) return null;
  return { id: u.id, name: u.name };
}

/**
 * Picks the next accountable person. Chain: round-robin -> backup -> manager -> owner.
 * The Owner is the last resort so a lead is never left without an accountable person.
 */
async function chooseAssignee(
  db: Tx,
  rule: Rule,
  mode: "NEXT_ELIGIBLE" | "BACKUP" | "MANAGER",
  exclude: string[],
): Promise<Pick | null> {
  const ws = rule.workspaceId;
  if (mode === "NEXT_ELIGIBLE") {
    const list = await eligibleUsers(db, ws, rule.maxOpenLeads, exclude);
    if (list.length) {
      const next = list.find((u) => rule.rrCursor && u.id > rule.rrCursor) ?? list[0];
      await db.assignmentRule.update({ where: { id: rule.id }, data: { rrCursor: next.id } });
      rule.rrCursor = next.id;
      return { user: next, via: "ROUND_ROBIN" };
    }
  }
  if (mode !== "MANAGER") {
    const b = await person(db, ws, rule.backupUserId);
    if (b && !exclude.includes(b.id)) return { user: b, via: "BACKUP" };
  }
  const m = await person(db, ws, rule.managerUserId);
  if (m && !exclude.includes(m.id)) return { user: m, via: "MANAGER" };
  const owner = await db.user.findFirst({ where: { workspaceId: ws, level: "OWNER" }, select: { id: true, name: true } });
  return owner ? { user: owner, via: "OWNER" } : null;
}

type LeadRow = Prisma.LeadGetPayload<{ include: { contact: true; assignee: { select: { id: true; name: true } } } }>;

/** Applies a new owner to a lead and keeps the related records, history and alerts in sync. */
async function setOwner(
  db: Tx,
  lead: LeadRow,
  pick: Pick,
  o: { windowSec: number; kind: "ASSIGNED" | "ESCALATED" | "REASSIGNED"; reason: string; actor: Actor },
) {
  const now = new Date();
  const from = lead.assignee;
  await db.lead.update({
    where: { id: lead.id },
    data: {
      assigneeId: pick.user.id,
      assignedAt: now,
      firstAssignedAt: lead.firstAssignedAt ?? now,
      ackDeadline: new Date(now.getTime() + o.windowSec * 1000),
      acknowledgedAt: null,
      status: "OPEN",
      ownerAway: false,
      exhausted: false,
      escalationLevel: o.kind === "ESCALATED" ? { increment: 1 } : o.kind === "REASSIGNED" ? 0 : undefined,
      escalationCount: o.kind === "ESCALATED" ? { increment: 1 } : undefined,
      version: { increment: 1 },
    },
  });
  if (lead.opportunityId)
    await db.opportunity.update({ where: { id: lead.opportunityId }, data: { ownerId: pick.user.id } });
  await db.contact.update({ where: { id: lead.contactId }, data: { ownerId: pick.user.id } });
  await db.conversation.updateMany({ where: { contactId: lead.contactId }, data: { assigneeId: pick.user.id } });

  const verb = o.kind === "ASSIGNED" ? "Assigned" : o.kind === "ESCALATED" ? "Escalated" : "Reassigned";
  const summary = `${verb} to ${pick.user.name}${from && o.kind !== "ASSIGNED" ? ` (from ${from.name})` : ""} · ${o.reason}`;
  await logActivity(db, {
    workspaceId: lead.workspaceId,
    type: o.kind === "ESCALATED" ? "ESCALATION" : "ASSIGNMENT",
    actor: o.actor,
    summary,
    leadId: lead.id,
    contactId: lead.contactId,
    opportunityId: lead.opportunityId,
    fromUserId: from?.id,
    toUserId: pick.user.id,
    data: { reason: o.reason, via: pick.via },
  });
  await audit(
    db,
    lead.workspaceId,
    o.actor,
    o.kind === "ASSIGNED" ? "LEAD_ASSIGNED" : o.kind === "ESCALATED" ? "LEAD_ESCALATED" : "LEAD_REASSIGNED",
    { type: "Lead", id: lead.id, label: lead.contact.name },
    from ? { assigneeId: from.id, assignee: from.name } : null,
    { assigneeId: pick.user.id, assignee: pick.user.name, reason: o.reason, ackWindowSec: o.windowSec },
  );
  await notify(db, {
    workspaceId: lead.workspaceId,
    userId: pick.user.id,
    title: o.kind === "ESCALATED" ? `Escalated lead: ${lead.contact.name}` : `New lead: ${lead.contact.name}`,
    body: `${SOURCE_LABEL[lead.source]} · acknowledge within ${o.windowSec}s`,
    link: `/leads/${lead.id}`,
  });

  if (o.kind === "ESCALATED") {
    const u = await db.user.findUnique({ where: { id: pick.user.id }, select: { email: true, notifyEmail: true } });
    const to = u?.notifyEmail || u?.email;
    if (to) {
      const link = `${appUrl()}/leads/${lead.id}`;
      await enqueueJob(db, {
        workspaceId: lead.workspaceId,
        kind: "SEND_EMAIL",
        refId: lead.id,
        payload: {
          to,
          subject: `Escalated lead: ${lead.contact.name} needs you now`,
          text: `${lead.contact.name} (${SOURCE_LABEL[lead.source]}) was escalated to you.\nReason: ${o.reason}\nAcknowledge within ${o.windowSec}s: ${link}`,
          html: escalationEmail({
            name: lead.contact.name,
            source: SOURCE_LABEL[lead.source],
            reason: o.reason,
            windowSec: o.windowSec,
            link,
          }),
        },
      });
    }
  }
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function escalationEmail(p: { name: string; source: string; reason: string; windowSec: number; link: string }) {
  return `<div style="font-family:Inter,Segoe UI,Arial,sans-serif;max-width:520px;margin:auto;padding:24px;color:#1a1a19">
  <p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6b6a65;margin:0 0 8px">LeadGuard · Lead escalation</p>
  <h1 style="font-size:20px;margin:0 0 16px">${esc(p.name)} needs a response</h1>
  <table style="font-size:14px;line-height:1.6;margin-bottom:20px">
    <tr><td style="color:#6b6a65;padding-right:16px">Source</td><td>${esc(p.source)}</td></tr>
    <tr><td style="color:#6b6a65;padding-right:16px">Reason</td><td>${esc(p.reason)}</td></tr>
    <tr><td style="color:#6b6a65;padding-right:16px">Respond within</td><td>${p.windowSec} seconds</td></tr>
  </table>
  <a href="${esc(p.link)}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px">Open lead</a>
</div>`;
}

const leadInclude = { contact: true, assignee: { select: { id: true, name: true } } } as const;

// ---------------------------------------------------------------- intake

export type IntakeInput = {
  workspaceId: string;
  source: LeadSource;
  name: string;
  email?: string | null;
  phone?: string | null;
  message?: string | null;
  companyName?: string | null;
  actor: Actor;
};

/** Creates (or matches) the contact, a lead + opportunity, and assigns it. Must run inside a transaction. */
export async function intakeLead(db: Tx, i: IntakeInput) {
  const ws = i.workspaceId;
  let contact =
    (i.phone ? await db.contact.findFirst({ where: { workspaceId: ws, phone: i.phone } }) : null) ??
    (i.email
      ? await db.contact.findFirst({ where: { workspaceId: ws, email: { equals: i.email, mode: "insensitive" } } })
      : null);

  if (!contact) {
    let companyId: string | null = null;
    if (i.companyName?.trim()) {
      const name = i.companyName.trim();
      const c =
        (await db.company.findFirst({ where: { workspaceId: ws, name: { equals: name, mode: "insensitive" } } })) ??
        (await db.company.create({ data: { workspaceId: ws, name } }));
      companyId = c.id;
    }
    contact = await db.contact.create({
      data: { workspaceId: ws, name: i.name, email: i.email || null, phone: i.phone || null, companyId },
    });
  }

  const rule = await lockRule(db, ws);

  const pipeline = await db.pipeline.findFirst({
    where: { workspaceId: ws },
    orderBy: { order: "asc" },
    include: { stages: { where: { kind: "OPEN" }, orderBy: { order: "asc" }, take: 1 } },
  });
  const opp =
    pipeline && pipeline.stages[0]
      ? await db.opportunity.create({
          data: {
            workspaceId: ws,
            title: `${contact.name} · ${SOURCE_LABEL[i.source]}`,
            contactId: contact.id,
            pipelineId: pipeline.id,
            stageId: pipeline.stages[0].id,
          },
        })
      : null;

  const created = await db.lead.create({
    data: {
      workspaceId: ws,
      contactId: contact.id,
      opportunityId: opp?.id,
      source: i.source,
      title: i.message?.slice(0, 500) || null,
    },
    include: leadInclude,
  });
  await logActivity(db, {
    workspaceId: ws,
    type: "SYSTEM",
    actor: i.actor,
    summary: `Lead captured from ${SOURCE_LABEL[i.source]}`,
    leadId: created.id,
    contactId: contact.id,
    opportunityId: opp?.id,
    data: i.message ? { message: i.message.slice(0, 500) } : undefined,
  });
  await audit(db, ws, i.actor, "LEAD_CREATED", { type: "Lead", id: created.id, label: contact.name }, null, {
    source: i.source,
  });

  const pick = await chooseAssignee(db, rule, "NEXT_ELIGIBLE", []);
  if (pick) {
    await setOwner(db, created, pick, {
      windowSec: rule.ackWindowSec,
      kind: "ASSIGNED",
      reason: pick.via === "ROUND_ROBIN" ? "Round-robin" : `No available employee, sent to ${pick.via.toLowerCase()}`,
      actor: SYSTEM,
    });
  }
  return created;
}

export const createLead = (i: IntakeInput) => transaction((db) => intakeLead(db, i));

// ---------------------------------------------------------------- acknowledgement

export async function acknowledgeLead(db: Tx, ctx: Ctx, leadId: string, via = "Acknowledge button") {
  const lead = await db.lead.findFirst({ where: { id: leadId, workspaceId: ctx.workspaceId }, include: leadInclude });
  if (!lead) throw notFound("Lead");
  if (lead.assigneeId !== ctx.userId)
    throw new HttpError(403, "Only the lead's current owner can acknowledge it.");
  if (lead.acknowledgedAt) return lead;
  const now = new Date();
  const r = await db.lead.updateMany({
    where: { id: lead.id, version: lead.version, acknowledgedAt: null, assigneeId: ctx.userId },
    data: {
      acknowledgedAt: now,
      firstAckAt: lead.firstAckAt ?? now,
      firstAckById: lead.firstAckById ?? ctx.userId,
      status: "ACKNOWLEDGED",
      ackDeadline: null,
      lastActionAt: now,
      version: { increment: 1 },
    },
  });
  if (!r.count) throw new HttpError(409, "This lead was just escalated to someone else. Refresh to see its owner.");
  const actor = { id: ctx.userId, name: ctx.userName };
  await logActivity(db, {
    workspaceId: ctx.workspaceId,
    type: "ACK",
    actor,
    summary: `Acknowledged by ${ctx.userName} (${via})`,
    leadId: lead.id,
    contactId: lead.contactId,
    opportunityId: lead.opportunityId,
  });
  await audit(db, ctx.workspaceId, actor, "LEAD_ACKNOWLEDGED", { type: "Lead", id: lead.id, label: lead.contact.name }, null, {
    via,
  });
  return lead;
}

/**
 * Any recorded action by the owner (note, message, call, stage change, appointment) counts as
 * acknowledgement and refreshes the idle timer.
 */
export async function recordAction(db: Tx, ctx: Ctx, contactId: string, via: string) {
  const leads = await db.lead.findMany({
    where: { workspaceId: ctx.workspaceId, contactId, status: { in: ["OPEN", "ACKNOWLEDGED"] }, assigneeId: ctx.userId },
  });
  for (const l of leads) {
    if (!l.acknowledgedAt) {
      try {
        await acknowledgeLead(db, ctx, l.id, via);
      } catch {
        /* lost a race with escalation; the action itself still stands */
      }
    } else await db.lead.update({ where: { id: l.id }, data: { lastActionAt: new Date() } });
  }
}

export async function closeLead(ctx: Ctx, leadId: string) {
  return transaction(async (db) => {
    const lead = await db.lead.findFirst({ where: { id: leadId, workspaceId: ctx.workspaceId }, include: leadInclude });
    if (!lead) throw notFound("Lead");
    if (lead.assigneeId !== ctx.userId && !ctx.perms.has("leads.reassign"))
      throw new HttpError(403, "Only the lead's owner or a manager can close it.");
    await db.lead.update({
      where: { id: lead.id },
      data: { status: "CLOSED", ackDeadline: null, version: { increment: 1 }, lastActionAt: new Date() },
    });
    const actor = { id: ctx.userId, name: ctx.userName };
    await logActivity(db, {
      workspaceId: ctx.workspaceId, type: "SYSTEM", actor, summary: `Lead closed by ${ctx.userName}`,
      leadId: lead.id, contactId: lead.contactId, opportunityId: lead.opportunityId,
    });
    await audit(db, ctx.workspaceId, actor, "LEAD_CLOSED", { type: "Lead", id: lead.id, label: lead.contact.name });
  });
}

// ---------------------------------------------------------------- manual reassignment

export async function reassignLead(ctx: Ctx, leadId: string, toUserId: string) {
  return transaction(async (db) => {
    const locked = await db.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Lead" WHERE id = ${leadId} AND "workspaceId" = ${ctx.workspaceId} FOR UPDATE`;
    if (!locked.length) throw notFound("Lead");
    const rule = await lockRule(db, ctx.workspaceId);
    const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId }, include: leadInclude });
    if (lead.status === "CLOSED") throw new HttpError(409, "This lead is closed.");
    const to = await person(db, ctx.workspaceId, toUserId, true);
    if (!to) throw new HttpError(400, "Choose an active employee from this workspace.");
    if (to.id === lead.assigneeId) throw new HttpError(400, `${to.name} already owns this lead.`);
    await setOwner(db, lead, { user: to, via: "MANAGER" }, {
      windowSec: rule.ackWindowSec,
      kind: "REASSIGNED",
      reason: `Manual reassignment by ${ctx.userName}`,
      actor: { id: ctx.userId, name: ctx.userName },
    });
  });
}

// ---------------------------------------------------------------- escalation sweep (worker)

/** Escalates every lead whose acknowledgement window has expired. Safe to run concurrently and after restarts. */
export async function escalateDue() {
  const due = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Lead"
    WHERE "acknowledgedAt" IS NULL AND status = 'OPEN' AND exhausted = false AND "ackDeadline" < now()
    ORDER BY "ackDeadline" ASC LIMIT 25`;
  let n = 0;
  for (const { id } of due) {
    try {
      const done = await transaction(async (db) => {
        // Re-check under a row lock; SKIP LOCKED means a parallel sweep never touches the same lead.
        const rows = await db.$queryRaw<{ id: string }[]>`
          SELECT id FROM "Lead"
          WHERE id = ${id} AND "acknowledgedAt" IS NULL AND status = 'OPEN' AND exhausted = false AND "ackDeadline" < now()
          FOR UPDATE SKIP LOCKED`;
        if (!rows.length) return false;
        const lead = await db.lead.findUniqueOrThrow({ where: { id }, include: leadInclude });
        const rule = await lockRule(db, lead.workspaceId);
        const level = rule.levels[lead.escalationLevel];
        if (!level) {
          await db.lead.update({ where: { id }, data: { exhausted: true, version: { increment: 1 } } });
          await audit(db, lead.workspaceId, SYSTEM, "LEAD_ESCALATION_EXHAUSTED", {
            type: "Lead", id, label: lead.contact.name,
          }, null, { assignee: lead.assignee?.name ?? null });
          await logActivity(db, {
            workspaceId: lead.workspaceId, type: "SYSTEM", actor: SYSTEM,
            summary: "All escalation levels used. Lead moved to the recovery queue.",
            leadId: id, contactId: lead.contactId, opportunityId: lead.opportunityId,
          });
          return true;
        }
        const exclude = lead.assigneeId ? [lead.assigneeId] : [];
        const pick = await chooseAssignee(db, rule, level.target, exclude);
        if (!pick) return false;
        await setOwner(db, lead, pick, {
          windowSec: level.seconds,
          kind: "ESCALATED",
          reason: `Not acknowledged in time (level ${lead.escalationLevel + 1}: ${level.target.replace("_", " ").toLowerCase()})`,
          actor: SYSTEM,
        });
        return true;
      });
      if (done) n++;
    } catch (e) {
      console.error("[escalation] failed for lead", id, e);
    }
  }
  return n;
}

// ---------------------------------------------------------------- absence

/**
 * On leave / Offline: unacknowledged leads are reassigned immediately.
 * Acknowledged leads stay with the owner but are flagged "owner away" (shown in the recovery queue).
 */
export async function applyStatusChange(actor: Actor, workspaceId: string, userId: string, status: UserStatus, deactivated = false) {
  return transaction(async (db) => {
    const user = await db.user.findFirstOrThrow({ where: { id: userId, workspaceId } });
    const before = user.status;
    await db.user.update({ where: { id: userId }, data: { status, ...(deactivated ? { active: false } : {}) } });
    await audit(db, workspaceId, actor, deactivated ? "USER_DEACTIVATED" : "USER_STATUS_CHANGED", {
      type: "User", id: userId, label: user.name,
    }, { status: before }, { status, ...(deactivated ? { active: false } : {}) });

    if (AWAY.includes(status) || deactivated) {
      const ids = await db.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Lead" WHERE "assigneeId" = ${userId} AND "workspaceId" = ${workspaceId}
        AND status IN ('OPEN','ACKNOWLEDGED') ${deactivated ? Prisma.empty : Prisma.sql`AND "acknowledgedAt" IS NULL`}
        FOR UPDATE`;
      if (ids.length) {
        const rule = await lockRule(db, workspaceId);
        for (const { id } of ids) {
          const lead = await db.lead.findUniqueOrThrow({ where: { id }, include: leadInclude });
          const pick = await chooseAssignee(db, rule, "NEXT_ELIGIBLE", [userId]);
          if (pick)
            await setOwner(db, lead, pick, {
              windowSec: rule.ackWindowSec,
              kind: "REASSIGNED",
              reason: deactivated ? `${user.name} was deactivated` : `${user.name} is ${status === "ON_LEAVE" ? "on leave" : "offline"}`,
              actor: SYSTEM,
            });
        }
      }
      if (!deactivated)
        await db.lead.updateMany({
          where: { assigneeId: userId, status: "ACKNOWLEDGED" },
          data: { ownerAway: true },
        });
      return { reassigned: ids.length };
    }
    await db.lead.updateMany({ where: { assigneeId: userId, ownerAway: true }, data: { ownerAway: false } });
    return { reassigned: 0 };
  });
}

// ---------------------------------------------------------------- recovery queue

export function recoveryWhere(ctx: Ctx, idleSec: number, personal = !seesAll(ctx)): Prisma.LeadWhereInput {
  return {
    workspaceId: ctx.workspaceId,
    status: { in: ["OPEN", "ACKNOWLEDGED"] },
    ...(personal ? { assigneeId: ctx.userId } : {}),
    OR: [
      { acknowledgedAt: null, ackDeadline: { lt: new Date() } },
      { escalationCount: { gte: 2 } },
      { lastActionAt: { lt: new Date(Date.now() - idleSec * 1000) } },
      { ownerAway: true },
      { assigneeId: null },
    ],
  };
}

export function recoveryReasons(
  l: { acknowledgedAt: Date | null; ackDeadline: Date | null; escalationCount: number; lastActionAt: Date; ownerAway: boolean; assigneeId: string | null; exhausted: boolean },
  idleSec: number,
) {
  const r: string[] = [];
  if (!l.assigneeId) r.push("No owner");
  if (!l.acknowledgedAt && l.ackDeadline && l.ackDeadline < new Date())
    r.push(l.exhausted ? "Unacknowledged after final escalation" : "Acknowledgement overdue");
  if (l.escalationCount >= 2) r.push(`Escalated ${l.escalationCount}×`);
  if (l.lastActionAt < new Date(Date.now() - idleSec * 1000)) r.push(`No action for ${fmtDur(idleSec)}+`);
  if (l.ownerAway) r.push("Owner is away");
  return r;
}

function fmtDur(s: number) {
  if (s < 120) return `${s}s`;
  if (s < 7200) return `${Math.round(s / 60)} min`;
  return `${Math.round(s / 3600)} h`;
}
