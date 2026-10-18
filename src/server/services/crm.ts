import { CustomField, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma, tx as transaction } from "../db";
import { Ctx, can, seesAll, actorOf } from "../context";
import { HttpError, notFound } from "../http";
import { logActivity } from "../audit";
import { recordAction } from "./leads";

// ------------------------------------------------------------ custom values

export function cleanCustomValues(fields: CustomField[], input: Record<string, unknown> | undefined, base: Record<string, unknown> = {}) {
  const out: Record<string, unknown> = { ...base };
  if (!input) return out;
  for (const [key, raw] of Object.entries(input)) {
    const f = fields.find((x) => x.key === key);
    if (!f) continue; // unknown keys are dropped (never trust input)
    if (raw === null || raw === "" || raw === undefined) {
      delete out[key];
      continue;
    }
    switch (f.type) {
      case "NUMBER": {
        const n = Number(raw);
        if (!Number.isFinite(n)) throw new HttpError(400, `"${f.name}" must be a number.`);
        out[key] = n;
        break;
      }
      case "CHECKBOX":
        out[key] = raw === true || raw === "true";
        break;
      case "DATE": {
        const s = String(raw);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new HttpError(400, `"${f.name}" must be a date (YYYY-MM-DD).`);
        out[key] = s;
        break;
      }
      case "DROPDOWN": {
        const s = String(raw);
        if (!f.options.includes(s)) throw new HttpError(400, `"${s}" is not an option for "${f.name}".`);
        out[key] = s;
        break;
      }
      default:
        out[key] = String(raw).slice(0, 2000);
    }
  }
  return out;
}

export const isEmpty = (v: unknown) => v === undefined || v === null || v === "" || v === false;

export function opportunityFields(workspaceId: string, pipelineId: string) {
  return prisma.customField.findMany({
    where: { workspaceId, entity: "OPPORTUNITY", OR: [{ pipelineId: null }, { pipelineId }] },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
}

export function contactFields(workspaceId: string) {
  return prisma.customField.findMany({ where: { workspaceId, entity: "CONTACT" }, orderBy: [{ order: "asc" }, { createdAt: "asc" }] });
}

// ------------------------------------------------------------ masking (F1.4)

export function maskOpp<T extends { value: number }>(ctx: Ctx, o: T): Omit<T, "value"> & { value: number | null; valueHidden: boolean } {
  const ok = can(ctx, "opportunity.value.view");
  return { ...o, value: ok ? o.value : null, valueHidden: !ok };
}

// ------------------------------------------------------------ visibility

export const contactScope = (ctx: Ctx): Prisma.ContactWhereInput =>
  seesAll(ctx) ? { workspaceId: ctx.workspaceId } : { workspaceId: ctx.workspaceId, ownerId: ctx.userId };

export const oppScope = (ctx: Ctx): Prisma.OpportunityWhereInput =>
  seesAll(ctx) ? { workspaceId: ctx.workspaceId } : { workspaceId: ctx.workspaceId, ownerId: ctx.userId };

// ------------------------------------------------------------ filters (F2.6)

export const contactFilterSchema = z.object({
  q: z.string().max(100).optional(),
  tag: z.string().max(50).optional(),
  ownerId: z.string().max(50).optional(),
  companyId: z.string().max(50).optional(),
  stageId: z.string().max(50).optional(),
  createdAfter: z.string().max(30).optional(),
  createdBefore: z.string().max(30).optional(),
  fieldKey: z.string().max(60).optional(),
  fieldValue: z.string().max(200).optional(),
  optedOut: z.enum(["true", "false"]).optional(),
});
export type ContactFilters = z.infer<typeof contactFilterSchema>;

export function contactWhere(ctx: Ctx, f: ContactFilters): Prisma.ContactWhereInput {
  const and: Prisma.ContactWhereInput[] = [contactScope(ctx)];
  if (f.q) {
    and.push({
      OR: [
        { name: { contains: f.q, mode: "insensitive" } },
        { email: { contains: f.q, mode: "insensitive" } },
        { phone: { contains: f.q } },
        { company: { name: { contains: f.q, mode: "insensitive" } } },
      ],
    });
  }
  if (f.tag) and.push({ tags: { has: f.tag } });
  if (f.ownerId) and.push({ ownerId: f.ownerId === "me" ? ctx.userId : f.ownerId === "none" ? null : f.ownerId });
  if (f.companyId) and.push({ companyId: f.companyId });
  if (f.stageId) and.push({ opportunities: { some: { stageId: f.stageId } } });
  if (f.createdAfter) and.push({ createdAt: { gte: new Date(f.createdAfter) } });
  if (f.createdBefore) {
    const d = new Date(f.createdBefore);
    d.setHours(23, 59, 59, 999);
    and.push({ createdAt: { lte: d } });
  }
  if (f.fieldKey && f.fieldValue) {
    const n = Number(f.fieldValue);
    const v = f.fieldValue === "true" ? true : f.fieldValue === "false" ? false : Number.isFinite(n) && f.fieldValue.trim() !== "" ? n : f.fieldValue;
    and.push(
      typeof v === "string"
        ? { customValues: { path: [f.fieldKey], string_contains: v } }
        : { customValues: { path: [f.fieldKey], equals: v } },
    );
  }
  if (f.optedOut) and.push({ optedOut: f.optedOut === "true" });
  return { AND: and };
}

// ------------------------------------------------------------ opportunity update (F2.4, Q4)

export const oppPatchSchema = z.object({
  version: z.number().int(),
  title: z.string().trim().min(1).max(200).optional(),
  value: z.number().min(0).max(1e12).optional(),
  currency: z.string().length(3).optional(),
  stageId: z.string().optional(),
  ownerId: z.string().nullable().optional(),
  customValues: z.record(z.unknown()).optional(),
});

export async function updateOpportunity(ctx: Ctx, id: string, input: z.infer<typeof oppPatchSchema>) {
  return transaction(async (db) => {
    const opp = await db.opportunity.findFirst({ where: { id, ...oppScope(ctx) }, include: { stage: true } });
    if (!opp) throw notFound("Opportunity");
    if (input.value !== undefined && !can(ctx, "opportunity.value.view"))
      throw new HttpError(403, "You don't have permission to see or change opportunity values.");

    const fields = await db.customField.findMany({
      where: { workspaceId: ctx.workspaceId, entity: "OPPORTUNITY", OR: [{ pipelineId: null }, { pipelineId: opp.pipelineId }] },
    });
    const custom = cleanCustomValues(fields, input.customValues, opp.customValues as Record<string, unknown>);

    let newStage = opp.stage;
    if (input.stageId && input.stageId !== opp.stageId) {
      const s = await db.stage.findFirst({ where: { id: input.stageId, workspaceId: ctx.workspaceId, pipelineId: opp.pipelineId } });
      if (!s) throw new HttpError(400, "That stage doesn't belong to this pipeline.");
      const missing = fields.filter((f) => s.requiredFieldIds.includes(f.id) && isEmpty(custom[f.key]));
      if (missing.length)
        throw new HttpError(422, `Fill in ${missing.map((m) => `"${m.name}"`).join(", ")} before moving to "${s.name}".`, {
          missingFieldIds: missing.map((m) => m.id),
          stageName: s.name,
        });
      newStage = s;
    }
    if (input.ownerId) {
      const u = await db.user.findFirst({ where: { id: input.ownerId, workspaceId: ctx.workspaceId, active: true } });
      if (!u) throw new HttpError(400, "Choose an active employee as owner.");
    }

    const r = await db.opportunity.updateMany({
      where: { id: opp.id, version: input.version },
      data: {
        title: input.title,
        value: input.value,
        currency: input.currency?.toUpperCase(),
        stageId: newStage.id,
        ownerId: input.ownerId === undefined ? undefined : input.ownerId,
        customValues: custom as Prisma.InputJsonValue,
        closedAt: newStage.kind === "OPEN" ? null : opp.closedAt ?? new Date(),
        version: { increment: 1 },
      },
    });
    if (!r.count)
      throw new HttpError(409, "Someone else changed this opportunity a moment ago. Reload to see their changes, then try again.");

    const actor = actorOf(ctx);
    if (newStage.id !== opp.stageId) {
      await logActivity(db, {
        workspaceId: ctx.workspaceId, type: "STAGE_CHANGE", actor, opportunityId: opp.id, contactId: opp.contactId,
        summary: `Stage: ${opp.stage.name} → ${newStage.name}`, data: { from: opp.stageId, to: newStage.id },
      });
      await recordAction(db, ctx, opp.contactId, "stage change");
      if (newStage.kind !== "OPEN")
        await db.lead.updateMany({
          where: { opportunityId: opp.id, status: { in: ["OPEN", "ACKNOWLEDGED"] }, acknowledgedAt: { not: null } },
          data: { status: "CLOSED", ackDeadline: null },
        });
    }
    const changed: string[] = [];
    if (input.title !== undefined && input.title !== opp.title) changed.push(`title → "${input.title}"`);
    if (input.value !== undefined && input.value !== opp.value) changed.push(`value ${opp.value} → ${input.value}`);
    for (const f of fields) {
      const a = (opp.customValues as Record<string, unknown>)[f.key];
      const b = custom[f.key];
      if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) changed.push(`${f.name} → ${b ?? "empty"}`);
    }
    if (changed.length)
      await logActivity(db, {
        workspaceId: ctx.workspaceId, type: "FIELD_EDIT", actor, opportunityId: opp.id, contactId: opp.contactId,
        summary: `Edited ${changed.join(", ")}`,
      });
    return db.opportunity.findUniqueOrThrow({ where: { id: opp.id } });
  });
}

export function csvEscape(v: unknown) {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // spreadsheet formula injection guard
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
