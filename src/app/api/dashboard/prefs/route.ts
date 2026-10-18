import { z } from "zod";
import { route, body } from "@/server/http";
import { prisma } from "@/server/db";
import { getContext } from "@/server/context";

export const PUT = route(async (req) => {
  const ctx = await getContext();
  const b = await body(req, z.object({ hidden: z.array(z.string().max(40)).max(20) }));
  await prisma.dashboardPref.upsert({
    where: { userId: ctx.userId },
    create: { userId: ctx.userId, hidden: b.hidden },
    update: { hidden: b.hidden },
  });
  return { ok: true };
});
