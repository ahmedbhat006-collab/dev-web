import { route, query } from "@/server/http";
import { prisma } from "@/server/db";
import { getContext, requirePerm, can } from "@/server/context";
import { contactFilterSchema, contactWhere, csvEscape, contactFields } from "@/server/services/crm";

export const GET = route(async (req) => {
  const ctx = await getContext();
  requirePerm(ctx, "crm.view", "crm.export");
  const where = contactWhere(ctx, contactFilterSchema.parse(query(req)));
  const [rows, fields] = await Promise.all([
    prisma.contact.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 5000,
      include: { company: true, owner: true, opportunities: { select: { value: true, stage: { select: { kind: true } } } } },
    }),
    contactFields(ctx.workspaceId),
  ]);
  const showValue = can(ctx, "opportunity.value.view");
  const header = ["Name", "Email", "Phone", "Company", "Owner", "Tags", "Opted out", "Open pipeline value", ...fields.map((f) => f.name), "Created"];
  const lines = [header.map(csvEscape).join(",")];
  for (const c of rows) {
    const open = c.opportunities.filter((o) => o.stage.kind === "OPEN").reduce((s, o) => s + o.value, 0);
    const cv = c.customValues as Record<string, unknown>;
    lines.push(
      [c.name, c.email, c.phone, c.company?.name, c.owner?.name, c.tags.join("; "), c.optedOut ? "yes" : "no",
        showValue ? open : "hidden", ...fields.map((f) => cv[f.key]), c.createdAt.toISOString()]
        .map(csvEscape)
        .join(","),
    );
  }
  return new Response(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contacts-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
});
