import { route, notFound } from "@/server/http";
import { prisma } from "@/server/db";
import { getContext, requirePerm } from "@/server/context";
import { conversationScope } from "@/server/services/messaging";
import { getCreds } from "@/server/integrations/registry";

export const GET = route(async (_req, { params }) => {
  const { id } = await params;
  const ctx = await getContext();
  requirePerm(ctx, "crm.view");
  const conv = await prisma.conversation.findFirst({
    where: { id, ...conversationScope(ctx) },
    include: {
      contact: { select: { id: true, name: true, phone: true, optedOut: true, optOutReason: true } },
      assignee: { select: { id: true, name: true } },
      messages: { orderBy: { createdAt: "asc" }, take: 300 },
    },
  });
  if (!conv) throw notFound("Conversation");
  if (conv.unread) await prisma.conversation.update({ where: { id }, data: { unread: 0 } });
  const lastInbound = [...conv.messages].reverse().find((m) => m.direction === "IN");
  return {
    ...conv,
    whatsappConnected: !!(await getCreds(ctx.workspaceId, "WHATSAPP")),
    windowOpen: !!lastInbound && Date.now() - lastInbound.createdAt.getTime() < 24 * 3600 * 1000,
  };
});
