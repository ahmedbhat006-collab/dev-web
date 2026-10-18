import { prisma } from "../db";
import { Ctx, actorOf } from "../context";
import { HttpError, notFound } from "../http";
import { logActivity } from "../audit";
import { createEvent, deleteEvent, freeBusy, patchEvent, ReconnectNeeded } from "../integrations/google";
import { logEvent } from "../integrations/registry";
import { ProviderError } from "../jobs/queue";
import { isValidTz, zonedToUtc, fmtInTz, tzAbbr } from "@/lib/tz";
import { contactScope } from "./crm";
import { tx } from "../db";
import { recordAction } from "./leads";

export async function assertBookable(workspaceId: string, userId: string) {
  const u = await prisma.user.findFirst({ where: { id: userId, workspaceId, active: true }, include: { google: true } });
  if (!u) throw new HttpError(400, "Choose an active employee.");
  if (!u.google) throw new HttpError(409, `${u.name} hasn't connected Google Calendar, so they can't be booked yet. They can connect it in Settings > Profile.`);
  if (u.google.needsReconnect) throw new HttpError(409, `${u.name}'s Google Calendar connection expired. They need to reconnect it in Settings > Profile.`);
  return u;
}

function wrap(e: unknown, workspaceId: string, type: string): never {
  const msg = e instanceof ProviderError ? e.message : (e as Error)?.message || "Google Calendar error";
  void logEvent({ workspaceId, provider: "GOOGLE", direction: "OUT", type, result: "ERROR", error: msg });
  if (e instanceof ReconnectNeeded) throw new HttpError(409, msg);
  throw new HttpError(502, `Google Calendar: ${msg}`);
}

export async function busyBetween(ctx: Ctx, userId: string, start: Date, end: Date) {
  await assertBookable(ctx.workspaceId, userId);
  try {
    return await freeBusy(userId, start, end);
  } catch (e) {
    wrap(e, ctx.workspaceId, "freebusy");
  }
}

const overlaps = (a0: Date, a1: Date, busy: { start: string; end: string }[]) =>
  busy.filter((b) => new Date(b.start) < a1 && new Date(b.end) > a0);

export async function book(
  ctx: Ctx,
  i: { contactId: string; opportunityId?: string | null; userId: string; title: string; notes?: string; start: string; durationMin: number; timezone: string; force?: boolean },
) {
  if (!isValidTz(i.timezone)) throw new HttpError(400, "Unknown time zone.");
  const contact = await prisma.contact.findFirst({ where: { id: i.contactId, ...contactScope(ctx) } });
  if (!contact) throw notFound("Contact");
  if (i.opportunityId && !(await prisma.opportunity.findFirst({ where: { id: i.opportunityId, contactId: contact.id } })))
    throw new HttpError(400, "That opportunity doesn't belong to this contact.");
  const employee = await assertBookable(ctx.workspaceId, i.userId);
  const start = zonedToUtc(i.start, i.timezone);
  const end = new Date(start.getTime() + i.durationMin * 60000);
  if (start.getTime() < Date.now() - 60000) throw new HttpError(400, "Pick a time in the future.");

  let busy: { start: string; end: string }[] = [];
  try {
    busy = await freeBusy(employee.id, start, end);
  } catch (e) {
    wrap(e, ctx.workspaceId, "freebusy");
  }
  const clash = overlaps(start, end, busy);
  if (clash.length && !i.force)
    throw new HttpError(409, `${employee.name} is busy at that time. Pick another slot or book anyway.`, { conflict: true, busy: clash });

  let ev: { id: string; htmlLink?: string };
  try {
    ev = await createEvent(employee.id, {
      summary: i.title,
      description: `${i.notes ? `${i.notes}\n\n` : ""}Customer: ${contact.name}${contact.phone ? ` · ${contact.phone}` : ""}${contact.email ? ` · ${contact.email}` : ""}\nBooked via LeadGuard by ${ctx.userName}`,
      start, end, timeZone: i.timezone,
    });
  } catch (e) {
    wrap(e, ctx.workspaceId, "event.create");
  }
  await logEvent({ workspaceId: ctx.workspaceId, provider: "GOOGLE", direction: "OUT", type: "event.create", result: "OK", summary: `Event ${ev.id} for ${employee.name}` });

  return tx(async (db) => {
    const a = await db.appointment.create({
      data: {
        workspaceId: ctx.workspaceId, contactId: contact.id, opportunityId: i.opportunityId || null, userId: employee.id,
        googleEventId: ev.id, googleLink: ev.htmlLink ?? null, title: i.title, notes: i.notes || null,
        startUtc: start, endUtc: end, timezone: i.timezone,
      },
    });
    await logActivity(db, {
      workspaceId: ctx.workspaceId, type: "APPOINTMENT", actor: actorOf(ctx), contactId: contact.id, opportunityId: i.opportunityId,
      summary: `Appointment booked with ${employee.name}: "${i.title}" · ${fmtInTz(start, i.timezone)} ${tzAbbr(i.timezone, start)}${clash.length ? " (overlaps a busy slot)" : ""}`,
    });
    await recordAction(db, ctx, contact.id, "appointment booked");
    return a;
  });
}

export async function reschedule(ctx: Ctx, id: string, i: { start: string; durationMin: number; timezone: string; force?: boolean }) {
  const a = await prisma.appointment.findFirst({ where: { id, workspaceId: ctx.workspaceId, contact: contactScope(ctx) }, include: { user: true } });
  if (!a) throw notFound("Appointment");
  if (a.status === "CANCELLED") throw new HttpError(409, "This appointment was cancelled.");
  if (!isValidTz(i.timezone)) throw new HttpError(400, "Unknown time zone.");
  await assertBookable(ctx.workspaceId, a.userId);
  const start = zonedToUtc(i.start, i.timezone);
  const end = new Date(start.getTime() + i.durationMin * 60000);
  let busy: { start: string; end: string }[] = [];
  try {
    busy = (await freeBusy(a.userId, start, end)).filter(
      (b) => !(new Date(b.start).getTime() === a.startUtc.getTime() && new Date(b.end).getTime() === a.endUtc.getTime()),
    );
  } catch (e) {
    wrap(e, ctx.workspaceId, "freebusy");
  }
  const clash = overlaps(start, end, busy);
  if (clash.length && !i.force) throw new HttpError(409, `${a.user.name} is busy at that time.`, { conflict: true, busy: clash });
  try {
    if (a.googleEventId) await patchEvent(a.userId, a.googleEventId, { start, end, timeZone: i.timezone });
  } catch (e) {
    wrap(e, ctx.workspaceId, "event.patch");
  }
  await logEvent({ workspaceId: ctx.workspaceId, provider: "GOOGLE", direction: "OUT", type: "event.patch", result: "OK", summary: `Event ${a.googleEventId} moved` });
  await prisma.appointment.update({ where: { id }, data: { startUtc: start, endUtc: end, timezone: i.timezone } });
  await logActivity(prisma, {
    workspaceId: ctx.workspaceId, type: "APPOINTMENT", actor: actorOf(ctx), contactId: a.contactId, opportunityId: a.opportunityId,
    summary: `Appointment "${a.title}" rescheduled: ${fmtInTz(a.startUtc, a.timezone)} → ${fmtInTz(start, i.timezone)} ${tzAbbr(i.timezone, start)}`,
  });
}

export async function cancel(ctx: Ctx, id: string) {
  const a = await prisma.appointment.findFirst({ where: { id, workspaceId: ctx.workspaceId, contact: contactScope(ctx) } });
  if (!a) throw notFound("Appointment");
  if (a.status === "CANCELLED") return;
  try {
    if (a.googleEventId) await deleteEvent(a.userId, a.googleEventId);
  } catch (e) {
    wrap(e, ctx.workspaceId, "event.delete");
  }
  await logEvent({ workspaceId: ctx.workspaceId, provider: "GOOGLE", direction: "OUT", type: "event.delete", result: "OK", summary: `Event ${a.googleEventId} cancelled` });
  await prisma.appointment.update({ where: { id }, data: { status: "CANCELLED" } });
  await logActivity(prisma, {
    workspaceId: ctx.workspaceId, type: "APPOINTMENT", actor: actorOf(ctx), contactId: a.contactId, opportunityId: a.opportunityId,
    summary: `Appointment "${a.title}" on ${fmtInTz(a.startUtc, a.timezone)} cancelled`,
  });
}
