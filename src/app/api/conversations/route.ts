import { route, query } from "@/server/http";
import { prisma } from "@/server/db";
import { getContext, requirePerm } from "@/server/context";
import { conversationScope } from "@/server/services/messaging";

export const GET = route(async (req) => {
  const ctx = await getContext();
  requirePerm(ctx, "crm.view");
  const q = query(req);
  const rows = await prisma.conversation.findMany({
    where: {
      ...conversationScope(ctx),
      ...(q.q ? { contact: { name: { contains: q.q, mode: "insensitive" } } } : {}),
    },
    orderBy: { lastMessageAt: "desc" },
    take: 100,
    include: {
      contact: { select: { id: true, name: true, phone: true, optedOut: true } },
      assignee: { select: { id: true, name: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, direction: true, status: true, createdAt: true } },
    },
  });
  return rows.map(({ messages, ...c }) => ({ ...c, last: messages[0] ?? null }));
});
