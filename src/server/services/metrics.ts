import { prisma } from "../db";
import { Ctx, can, companyScope } from "../context";
import { recoveryWhere } from "./leads";

/** Every dashboard figure, computed from the same records and glossary definitions used elsewhere (Q12). */
export async function dashboard(ctx: Ctx) {
  const ws = ctx.workspaceId;
  const company = companyScope(ctx);
  const me = ctx.userId;
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const dayAgo = new Date(now.getTime() - 24 * 3600 * 1000);
  const weekAhead = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
  const rule = await prisma.assignmentRule.findUnique({ where: { workspaceId: ws } });

  const [newLeads, acked, recovery, escalations, users, appts, payments, pending, stages, openOpps] = await Promise.all([
    prisma.lead.count({ where: { workspaceId: ws, createdAt: { gte: startOfDay }, ...(company ? {} : { assigneeId: me }) } }),
    prisma.lead.findMany({
      where: { workspaceId: ws, firstAckAt: { not: null }, firstAssignedAt: { not: null }, ...(company ? {} : { firstAckById: me }) },
      select: { firstAckAt: true, firstAssignedAt: true },
      orderBy: { firstAckAt: "desc" },
      take: 500,
    }),
    prisma.lead.count({ where: recoveryWhere(ctx, rule?.idleSec ?? 600, !company) }),
    prisma.activity.count({ where: { workspaceId: ws, type: "ESCALATION", createdAt: { gte: dayAgo }, ...(company ? {} : { fromUserId: me }) } }),
    prisma.user.findMany({ where: { workspaceId: ws, active: true }, select: { id: true, name: true, status: true }, orderBy: { name: "asc" } }),
    prisma.appointment.findMany({
      where: { workspaceId: ws, status: "SCHEDULED", startUtc: { gte: now, lte: weekAhead }, ...(company ? {} : { userId: me }) },
      include: { contact: { select: { id: true, name: true } }, user: { select: { name: true } } },
      orderBy: { startUtc: "asc" },
      take: 6,
    }),
    prisma.payment.findMany({
      where: { workspaceId: ws, status: { in: ["PAID", "REFUNDED", "PARTIALLY_REFUNDED"] }, paidAt: { gte: startOfMonth }, ...(company ? {} : { requestedById: me }) },
      select: { amount: true, refundedAmount: true, currency: true },
    }),
    prisma.payment.findMany({
      where: { workspaceId: ws, status: "PENDING", ...(company ? {} : { requestedById: me }) },
      select: { amount: true, currency: true },
    }),
    prisma.stage.findMany({
      where: { workspaceId: ws, kind: "OPEN" },
      include: { pipeline: { select: { name: true, order: true } } },
      orderBy: [{ pipeline: { order: "asc" } }, { order: "asc" }],
    }),
    prisma.opportunity.groupBy({
      by: ["stageId"],
      where: { workspaceId: ws, stage: { kind: "OPEN" }, ...(company ? {} : { ownerId: me }) },
      _sum: { value: true },
      _count: { _all: true },
    }),
  ]);

  const avgFirstResponseSec = acked.length
    ? Math.round(acked.reduce((s, l) => s + (l.firstAckAt!.getTime() - l.firstAssignedAt!.getTime()) / 1000, 0) / acked.length)
    : null;

  const sumBy = (rows: { amount: number; currency: string; refundedAmount?: number }[]) => {
    const m: Record<string, number> = {};
    for (const r of rows) m[r.currency] = (m[r.currency] ?? 0) + r.amount - (r.refundedAmount ?? 0);
    return m;
  };

  const showValues = can(ctx, "opportunity.value.view");
  const byStage = stages.map((s) => {
    const g = openOpps.find((o) => o.stageId === s.id);
    return { stageId: s.id, stage: s.name, pipeline: s.pipeline.name, count: g?._count._all ?? 0, value: showValues ? g?._sum.value ?? 0 : null };
  });

  const availability = { AVAILABLE: 0, BUSY: 0, ON_LEAVE: 0, OFFLINE: 0 } as Record<string, number>;
  for (const u of users) availability[u.status]++;

  return {
    scope: company ? "company" : "personal",
    newLeadsToday: newLeads,
    avgFirstResponseSec,
    recoveryCount: recovery,
    escalations24h: escalations,
    pipelineByStage: byStage,
    openPipelineValue: showValues ? byStage.reduce((s, x) => s + (x.value ?? 0), 0) : null,
    valuesHidden: !showValues,
    availability,
    team: users,
    upcomingAppointments: appts.map((a) => ({
      id: a.id, title: a.title, startUtc: a.startUtc, timezone: a.timezone, contact: a.contact, employee: a.user.name,
    })),
    collectedThisMonth: sumBy(payments), // minor units per currency; webhook-confirmed payments minus refunds
    projectedPayments: sumBy(pending),
  };
}
