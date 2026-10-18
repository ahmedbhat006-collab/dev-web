import { route } from "@/server/http";
import { tx } from "@/server/db";
import { getContext } from "@/server/context";
import { acknowledgeLead } from "@/server/services/leads";

export const POST = route(async (_req, { params }) => {
  const { id } = await params;
  const ctx = await getContext();
  await tx((db) => acknowledgeLead(db, ctx, id));
  return { ok: true };
});
