import { route } from "@/server/http";
import { getContext } from "@/server/context";
import { closeLead } from "@/server/services/leads";

export const POST = route(async (_req, { params }) => {
  const { id } = await params;
  const ctx = await getContext();
  await closeLead(ctx, id);
  return { ok: true };
});
