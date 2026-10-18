import { z } from "zod";
import { route, body } from "@/server/http";
import { getContext, requirePerm } from "@/server/context";
import { reassignLead } from "@/server/services/leads";

export const POST = route(async (req, { params }) => {
  const { id } = await params;
  const ctx = await getContext();
  requirePerm(ctx, "leads.reassign");
  const b = await body(req, z.object({ userId: z.string().min(1, "Choose an employee") }));
  await reassignLead(ctx, id, b.userId);
  return { ok: true };
});
