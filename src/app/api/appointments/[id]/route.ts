import { z } from "zod";
import { route, body } from "@/server/http";
import { getContext, requirePerm } from "@/server/context";
import { cancel, reschedule } from "@/server/services/appointments";

export const PATCH = route(async (req, { params }) => {
  const { id } = await params;
  const ctx = await getContext();
  requirePerm(ctx, "crm.edit");
  const b = await body(req, z.object({
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Pick a date and time"),
    durationMin: z.number().int().min(5).max(8 * 60),
    timezone: z.string().min(1).max(60),
    force: z.boolean().optional(),
  }));
  await reschedule(ctx, id, b);
  return { ok: true };
});

export const DELETE = route(async (_req, { params }) => {
  const { id } = await params;
  const ctx = await getContext();
  requirePerm(ctx, "crm.edit");
  await cancel(ctx, id);
  return { ok: true };
});
