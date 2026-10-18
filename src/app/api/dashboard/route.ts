import { route } from "@/server/http";
import { prisma } from "@/server/db";
import { getContext } from "@/server/context";
import { dashboard } from "@/server/services/metrics";

export const GET = route(async () => {
  const ctx = await getContext();
  const [data, pref] = await Promise.all([dashboard(ctx), prisma.dashboardPref.findUnique({ where: { userId: ctx.userId } })]);
  return { ...data, hidden: pref?.hidden ?? [] };
});
