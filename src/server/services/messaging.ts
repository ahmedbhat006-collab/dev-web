import { MessageStatus, Prisma } from "@prisma/client";
import { prisma, tx as transaction } from "../db";
import { Ctx, seesAll } from "../context";
import { HttpError, notFound } from "../http";
import { SYSTEM, logActivity } from "../audit";
import { enqueueJob } from "../jobs/queue";
import { getCreds, logEvent } from "../integrations/registry";
import { recordAction, intakeLead } from "./leads";
import { toE164 } from "../integrations/whatsapp";

export function conversationScope(ctx: Ctx): Prisma.ConversationWhereInput {
  return seesAll(ctx) ? { workspaceId: ctx.workspaceId } : { workspaceId: ctx.workspaceId, assigneeId: ctx.userId };
}

export async function getOrCreateConversation(ctx: Ctx, contactId: string) {
  const contact = await prisma.contact.findFirst({ where: { id: contactId, workspaceId: ctx.workspaceId } });
  if (!contact) throw notFound("Contact");
  if (!seesAll(ctx) && contact.ownerId !== ctx.userId) throw new HttpError(403, "This contact belongs to another employee.");
  return prisma.conversation.upsert({
    where: { workspaceId_contactId_channel: { workspaceId: ctx.workspaceId, contactId, channel: "WHATSAPP" } },
    create: { workspaceId: ctx.workspaceId, contactId, assigneeId: contact.ownerId },
    update: {},
  });
}

export async function sendMessage(ctx: Ctx, conversationId: string, text: string) {
  const conv = await prisma.conversation.findFirst({
    where: { id: conversationId, ...conversationScope(ctx) },
    include: { contact: true },
  });
  if (!conv) throw notFound("Conversation");
  if (conv.contact.optedOut)
    throw new HttpError(422, `${conv.contact.name} has opted out of messages${conv.contact.optOutReason ? ` (${conv.contact.optOutReason})` : ""}. You can't message them unless they opt back in.`);
  if (!conv.contact.phone) throw new HttpError(422, "This contact has no phone number. Add one first.");
  const creds = await getCreds(ctx.workspaceId, "WHATSAPP");
  if (!creds) throw new HttpError(409, "WhatsApp isn't connected for this workspace. An admin can connect it in Settings > Integrations.");

  const { message, jobId } = await transaction(async (db) => {
    const message = await db.message.create({
      data: {
        workspaceId: ctx.workspaceId,
        conversationId: conv.id,
        direction: "OUT",
        body: text,
        status: "QUEUED",
        sentById: ctx.userId,
        sentByName: ctx.userName,
      },
    });
    const job = await enqueueJob(db, { workspaceId: ctx.workspaceId, kind: "SEND_WHATSAPP", payload: { messageId: message.id }, refId: message.id });
    await db.conversation.update({ where: { id: conv.id }, data: { lastMessageAt: new Date(), unread: 0 } });
    await logActivity(db, {
      workspaceId: ctx.workspaceId, type: "MESSAGE", actor: { id: ctx.userId, name: ctx.userName },
      summary: `WhatsApp sent: "${text.slice(0, 80)}${text.length > 80 ? "…" : ""}"`, contactId: conv.contactId,
    });
    await recordAction(db, ctx, conv.contactId, "message sent");
    return { message, jobId: job.id };
  });
  // Kick the job now for a snappy UI; the worker picks it up anyway if this fails.
  import("../jobs/worker").then((w) => w.processJob(jobId)).catch(() => null);
  return message;
}

export async function retryMessage(ctx: Ctx, messageId: string) {
  const msg = await prisma.message.findFirst({
    where: { id: messageId, workspaceId: ctx.workspaceId, conversation: conversationScope(ctx) },
    include: { conversation: { include: { contact: true } } },
  });
  if (!msg) throw notFound("Message");
  if (msg.status !== "FAILED") throw new HttpError(409, "Only failed messages can be retried.");
  if (msg.conversation.contact.optedOut) throw new HttpError(422, "This contact has opted out of messages.");
  const job = await transaction(async (db) => {
    await db.message.update({ where: { id: msg.id }, data: { status: "QUEUED", errorCode: null, errorMessage: null } });
    return enqueueJob(db, { workspaceId: ctx.workspaceId, kind: "SEND_WHATSAPP", payload: { messageId: msg.id }, refId: msg.id });
  });
  import("../jobs/worker").then((w) => w.processJob(job.id)).catch(() => null);
}

// ------------------------------------------------------------------ inbound webhook processing

type WaValue = {
  metadata?: { phone_number_id?: string };
  contacts?: { profile?: { name?: string }; wa_id: string }[];
  messages?: { from: string; id: string; type: string; text?: { body: string }; button?: { text: string }; interactive?: unknown }[];
  statuses?: { id: string; status: string; errors?: { code: number; title?: string; message?: string }[] }[];
};

const STATUS_RANK: Record<string, number> = { QUEUED: 0, SENT: 1, DELIVERED: 2, READ: 3 };
const STOP_WORDS = /^\s*(stop|unsubscribe|opt[\s-]?out)\s*$/i;

export async function handleWhatsAppPayload(workspaceId: string, phoneNumberId: string, payload: { entry?: { changes?: { value?: WaValue }[] }[] }) {
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value;
      if (!v) continue;
      if (v.metadata?.phone_number_id && v.metadata.phone_number_id !== phoneNumberId) {
        await logEvent({ workspaceId, provider: "WHATSAPP", direction: "IN", type: "webhook", result: "REJECTED", error: "Event for a different phone number ID" });
        continue;
      }
      for (const m of v.messages ?? []) await handleInbound(workspaceId, m, v.contacts?.find((c) => c.wa_id === m.from)?.profile?.name);
      for (const s of v.statuses ?? []) await handleStatus(workspaceId, s);
    }
  }
}

async function handleInbound(workspaceId: string, m: NonNullable<WaValue["messages"]>[number], profileName?: string) {
  const body = m.text?.body ?? m.button?.text ?? `[${m.type} message]`;
  const phone = toE164(m.from);
  try {
    await transaction(async (db) => {
      // Dedupe: the provider message id is unique, so a re-delivered webhook fails here and nothing is created twice.
      await db.integrationEvent.create({
        data: { workspaceId, provider: "WHATSAPP", direction: "IN", type: "message.received", externalId: m.id, result: "OK", summary: `From ${phone}: ${body.slice(0, 120)}` },
      });
      let contact = await db.contact.findFirst({ where: { workspaceId, phone } });
      let createdLead = false;
      if (!contact) {
        const lead = await intakeLead(db, { workspaceId, source: "WHATSAPP", name: profileName || phone, phone, message: body, actor: SYSTEM });
        contact = await db.contact.findUniqueOrThrow({ where: { id: lead.contactId } });
        createdLead = true;
      }
      const conv = await db.conversation.upsert({
        where: { workspaceId_contactId_channel: { workspaceId, contactId: contact.id, channel: "WHATSAPP" } },
        create: { workspaceId, contactId: contact.id, assigneeId: contact.ownerId, lastMessageAt: new Date(), unread: 1 },
        update: { lastMessageAt: new Date(), unread: { increment: 1 } },
      });
      await db.message.create({
        data: { workspaceId, conversationId: conv.id, direction: "IN", body, status: "RECEIVED", providerSid: m.id },
      });
      if (STOP_WORDS.test(body) && !contact.optedOut) {
        await db.contact.update({ where: { id: contact.id }, data: { optedOut: true, optOutReason: `Customer sent "${body.trim()}"` } });
      }
      await logActivity(db, {
        workspaceId, type: "MESSAGE", actor: { id: null, name: contact.name },
        summary: `WhatsApp received: "${body.slice(0, 80)}${body.length > 80 ? "…" : ""}"${createdLead ? " · new lead created" : ""}`,
        contactId: contact.id,
      });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      await logEvent({ workspaceId, provider: "WHATSAPP", direction: "IN", type: "message.received", result: "DUPLICATE", summary: `Duplicate delivery of ${m.id} ignored` });
      return;
    }
    await logEvent({ workspaceId, provider: "WHATSAPP", direction: "IN", type: "message.received", result: "ERROR", error: (e as Error).message });
    throw e;
  }
}

async function handleStatus(workspaceId: string, s: NonNullable<WaValue["statuses"]>[number]) {
  const map: Record<string, MessageStatus> = { sent: "SENT", delivered: "DELIVERED", read: "READ", failed: "FAILED" };
  const next = map[s.status];
  if (!next) return;
  try {
    await prisma.integrationEvent.create({
      data: { workspaceId, provider: "WHATSAPP", direction: "IN", type: `status.${s.status}`, externalId: `${s.id}:${s.status}`, result: "OK" },
    });
  } catch {
    return; // duplicate status callback
  }
  const msg = await prisma.message.findFirst({ where: { providerSid: s.id, workspaceId } });
  if (!msg) return;
  if (next === "FAILED") {
    const err = s.errors?.[0];
    const { explainWhatsAppError } = await import("../integrations/whatsapp");
    await prisma.message.update({
      where: { id: msg.id },
      data: { status: "FAILED", errorCode: err ? String(err.code) : null, errorMessage: explainWhatsAppError(err ? String(err.code) : undefined, err?.message || err?.title || "Delivery failed") },
    });
  } else if ((STATUS_RANK[next] ?? 0) > (STATUS_RANK[msg.status] ?? -1)) {
    await prisma.message.update({ where: { id: msg.id }, data: { status: next } });
  }
}
