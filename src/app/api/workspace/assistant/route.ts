import { z } from "zod";
import { route, body } from "@/server/http";
import { prisma } from "@/server/db";
import { getContext, requirePerm, actorOf } from "@/server/context";
import { audit } from "@/server/audit";
import { assistantConfigured, DEFAULT_ASSISTANT_INFO, ASSISTANT_MODEL_LABEL } from "@/server/services/assistant";

export const GET = route(async () => {
  const ctx = await getContext();
  requirePerm(ctx, "integrations.manage");
  const ws = await prisma.workspace.findUniqueOrThrow({ where: { id: ctx.workspaceId } });
  return { info: ws.assistantInfo ?? DEFAULT_ASSISTANT_INFO, online: assistantConfigured(), slug: ws.slug, model: ASSISTANT_MODEL_LABEL };
});

export const PUT = route(async (req) => {
  const ctx = await getContext();
  requirePerm(ctx, "integrations.manage");
  const b = await body(req, z.object({ info: z.string().trim().min(20, "Add a few sentences about your company").max(6000) }));
  const before = await prisma.workspace.findUniqueOrThrow({ where: { id: ctx.workspaceId } });
  await prisma.workspace.update({ where: { id: ctx.workspaceId }, data: { assistantInfo: b.info } });
  await audit(prisma, ctx.workspaceId, actorOf(ctx), "ASSISTANT_KNOWLEDGE_UPDATED", { type: "Workspace", id: ctx.workspaceId, label: "AI assistant" },
    { length: before.assistantInfo?.length ?? 0 }, { length: b.info.length });
  return { ok: true };
});
