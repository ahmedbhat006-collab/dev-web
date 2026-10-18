import { route } from "@/server/http";
import { getContext, requirePerm } from "@/server/context";
import { getOrCreateConversation } from "@/server/services/messaging";

export const POST = route(async (_req, { params }) => {
  const { id } = await params;
  const ctx = await getContext();
  requirePerm(ctx, "crm.view");
  const c = await getOrCreateConversation(ctx, id);
  return { id: c.id };
});
