import { z } from "zod";
import { route, body } from "@/server/http";
import { getContext, requirePerm } from "@/server/context";
import { sendMessage } from "@/server/services/messaging";

export const POST = route(async (req, { params }) => {
  const { id } = await params;
  const ctx = await getContext();
  requirePerm(ctx, "crm.edit");
  const b = await body(req, z.object({ text: z.string().trim().min(1, "Type a message").max(4096) }));
  const m = await sendMessage(ctx, id, b.text);
  return { id: m.id };
});
