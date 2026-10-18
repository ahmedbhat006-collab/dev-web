import { route } from "@/server/http";
import { getContext, requirePerm } from "@/server/context";
import { retryMessage } from "@/server/services/messaging";

export const POST = route(async (_req, { params }) => {
  const { id } = await params;
  const ctx = await getContext();
  requirePerm(ctx, "crm.edit");
  await retryMessage(ctx, id);
  return { ok: true };
});
