import { route, notFound } from "@/server/http";
import { prisma } from "@/server/db";
import { getContext } from "@/server/context";

export const DELETE = route(async (_req, { params }) => {
  const { id } = await params;
  const ctx = await getContext();
  const l = await prisma.savedList.findFirst({ where: { id, workspaceId: ctx.workspaceId, userId: ctx.userId } });
  if (!l) throw notFound("List");
  await prisma.savedList.delete({ where: { id } });
  return { ok: true };
});
