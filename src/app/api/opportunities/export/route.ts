import { route, query } from "@/server/http";
import { prisma } from "@/server/db";
import { getContext, requirePerm, can } from "@/server/context";
import { oppScope, csvEscape } from "@/server/services/crm";

export const GET = route(async (req) => {
  const ctx = await getContext();
  requirePerm(ctx, "crm.view", "crm.export");
  const q = query(req);
  const rows = await prisma.opportunity.findMany({
    where: { ...oppScope(ctx), ...(q.pipelineId ? { pipelineId: q.pipelineId } : {}) },
    include: { contact: true, owner: true, stage: true, pipeline: true },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });
  const showValue = can(ctx, "opportunity.value.view");
  const lines = [["Title", "Contact", "Pipeline", "Stage", "Owner", "Value", "Currency", "Created"].join(",")];
  for (const o of rows)
    lines.push(
      [o.title, o.contact.name, o.pipeline.name, o.stage.name, o.owner?.name, showValue ? o.value : "hidden", o.currency, o.createdAt.toISOString()]
        .map(csvEscape)
        .join(","),
    );
  return new Response(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="opportunities-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
});
