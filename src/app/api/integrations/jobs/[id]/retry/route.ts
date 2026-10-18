import { route, HttpError, notFound } from "@/server/http";
import { prisma } from "@/server/db";
import { getContext, requirePerm } from "@/server/context";

export const POST = route(async (_req, { params }) => {
  const { id } = await params;
  const ctx = await getContext();
  requirePerm(ctx, "integrations.manage");
  const job = await prisma.outboundJob.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
  if (!job) throw notFound("Job");
  if (job.status !== "FAILED") throw new HttpError(409, "Only failed deliveries can be retried.");
  await prisma.outboundJob.update({ where: { id }, data: { status: "PENDING", attempts: 0, nextAttemptAt: new Date(), lastError: null } });
  import("@/server/jobs/worker").then((w) => w.processJob(id)).catch(() => null);
  return { ok: true };
});
