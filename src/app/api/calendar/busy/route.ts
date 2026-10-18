import { route, query, HttpError } from "@/server/http";
import { getContext, requirePerm } from "@/server/context";
import { busyBetween } from "@/server/services/appointments";
import { zonedToUtc, isValidTz } from "@/lib/tz";

/** Busy blocks for an employee on a given day (in the chosen time zone). */
export const GET = route(async (req) => {
  const ctx = await getContext();
  requirePerm(ctx, "crm.view");
  const q = query(req);
  if (!q.userId || !/^\d{4}-\d{2}-\d{2}$/.test(q.date ?? "")) throw new HttpError(400, "userId and date are required.");
  const tz = isValidTz(q.timezone ?? "") ? q.timezone : "UTC";
  const start = zonedToUtc(`${q.date}T00:00`, tz);
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  const busy = await busyBetween(ctx, q.userId, start, end);
  return { busy };
});
