import { prisma } from "../db";
import { escalateDue } from "../services/leads";
import { ProviderError } from "./queue";
import { getCreds, logEvent, markError, markOk } from "../integrations/registry";
import { sendEmail, ResendCreds } from "../integrations/resend";
import { sendText, WhatsAppCreds } from "../integrations/whatsapp";
import { Provider } from "@prisma/client";

const BACKOFF_BASE_MS = 5_000;

/** Claims and runs one outbound job. Claiming via a conditional update guarantees a single runner. */
export async function processJob(id: string) {
  const claimed = await prisma.outboundJob.updateMany({
    where: { id, status: { in: ["PENDING", "RETRYING"] }, nextAttemptAt: { lte: new Date() } },
    data: { status: "RUNNING", attempts: { increment: 1 } },
  });
  if (!claimed.count) return;
  const job = await prisma.outboundJob.findUniqueOrThrow({ where: { id } });
  const p = job.payload as Record<string, string>;
  const provider: Provider = job.kind === "SEND_EMAIL" ? "RESEND" : "WHATSAPP";

  try {
    if (job.kind === "SEND_EMAIL") {
      const creds = await getCreds<ResendCreds>(job.workspaceId, "RESEND");
      if (!creds) throw new ProviderError("Email alerts are not connected. Connect Resend in Settings > Integrations.", false);
      const ref = await sendEmail(creds, { to: p.to, subject: p.subject, html: p.html, text: p.text });
      await logEvent({ workspaceId: job.workspaceId, provider, direction: "OUT", type: "email.send", result: "OK", summary: `Escalation email to ${p.to} (${ref})` });
    } else {
      const msg = await prisma.message.findUnique({ where: { id: p.messageId }, include: { conversation: { include: { contact: true } } } });
      if (!msg) throw new ProviderError("Message no longer exists.", false);
      const contact = msg.conversation.contact;
      if (contact.optedOut) throw new ProviderError("Contact has opted out of messages.", false);
      if (!contact.phone) throw new ProviderError("Contact has no phone number.", false);
      const creds = await getCreds<WhatsAppCreds>(job.workspaceId, "WHATSAPP");
      if (!creds) throw new ProviderError("WhatsApp is not connected. Connect it in Settings > Integrations.", false);
      const sid = await sendText(creds, contact.phone, msg.body);
      await prisma.message.update({
        where: { id: msg.id },
        data: { providerSid: sid, status: "SENT", errorCode: null, errorMessage: null },
      });
      await logEvent({ workspaceId: job.workspaceId, provider, direction: "OUT", type: "message.send", result: "OK", externalId: `out:${sid}`, summary: `Message to ${contact.phone}` });
    }
    await prisma.outboundJob.update({ where: { id }, data: { status: "DONE", lastError: null } });
    await markOk(job.workspaceId, provider);
  } catch (e) {
    const pe = e instanceof ProviderError ? e : new ProviderError((e as Error)?.message || String(e), true);
    const retry = pe.transient && job.attempts < job.maxAttempts;
    await prisma.outboundJob.update({
      where: { id },
      data: {
        status: retry ? "RETRYING" : "FAILED",
        lastError: pe.message.slice(0, 500),
        nextAttemptAt: new Date(Date.now() + BACKOFF_BASE_MS * 2 ** (job.attempts - 1)),
      },
    });
    await logEvent({
      workspaceId: job.workspaceId,
      provider,
      direction: "OUT",
      type: job.kind === "SEND_EMAIL" ? "email.send" : "message.send",
      result: "ERROR",
      error: `${retry ? `Attempt ${job.attempts} failed, retrying: ` : ""}${pe.message}`,
    });
    await markError(job.workspaceId, provider, pe.message, !pe.transient);
    if (job.kind === "SEND_WHATSAPP" && p.messageId) {
      await prisma.message
        .update({
          where: { id: p.messageId },
          data: retry
            ? { errorMessage: `Temporary problem, retrying (attempt ${job.attempts}/${job.maxAttempts})…` }
            : { status: "FAILED", errorCode: pe.code ?? null, errorMessage: pe.message },
        })
        .catch(() => null);
    }
  }
}

let lastErrorLog = 0;

export async function tick() {
  // Jobs stuck in RUNNING (server restarted mid-send) go back to the queue.
  await prisma.outboundJob.updateMany({
    where: { status: "RUNNING", updatedAt: { lt: new Date(Date.now() - 60_000) } },
    data: { status: "RETRYING" },
  });
  await escalateDue();
  const due = await prisma.outboundJob.findMany({
    where: { status: { in: ["PENDING", "RETRYING"] }, nextAttemptAt: { lte: new Date() } },
    orderBy: { nextAttemptAt: "asc" },
    take: 10,
    select: { id: true },
  });
  for (const j of due) await processJob(j.id);
}

const g = globalThis as unknown as { __anchorWorker?: NodeJS.Timeout; __anchorBusy?: boolean };

export function startWorker() {
  if (g.__anchorWorker || !process.env.DATABASE_URL) return;
  g.__anchorWorker = setInterval(async () => {
    if (g.__anchorBusy) return;
    g.__anchorBusy = true;
    try {
      await tick();
    } catch (e) {
      if (Date.now() - lastErrorLog > 60_000) {
        lastErrorLog = Date.now();
        console.error("[worker] tick failed:", (e as Error)?.message);
      }
    } finally {
      g.__anchorBusy = false;
    }
  }, 2000);
  console.log("[worker] started: escalation sweep + outbound retries every 2s");
}
