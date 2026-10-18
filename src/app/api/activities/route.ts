import { z } from "zod";
import { route, body, HttpError } from "@/server/http";
import { tx } from "@/server/db";
import { getContext, requirePerm, actorOf } from "@/server/context";
import { contactScope, oppScope } from "@/server/services/crm";
import { logActivity } from "@/server/audit";
import { recordAction } from "@/server/services/leads";

/** Add a note or call log to a contact / opportunity. Counts as a recorded action on the lead. */
export const POST = route(async (req) => {
  const ctx = await getContext();
  requirePerm(ctx, "crm.edit");
  const b = await body(req, z.object({
    contactId: z.string().optional(),
    opportunityId: z.string().optional(),
    type: z.enum(["NOTE", "CALL"]),
    text: z.string().trim().min(1, "Write something first").max(4000),
  }));
  await tx(async (db) => {
    let contactId = b.contactId;
    if (b.opportunityId) {
      const o = await db.opportunity.findFirst({ where: { id: b.opportunityId, ...oppScope(ctx) } });
      if (!o) throw new HttpError(404, "Opportunity not found.");
      contactId = o.contactId;
    }
    if (!contactId) throw new HttpError(400, "Choose a contact or opportunity.");
    const c = await db.contact.findFirst({ where: { id: contactId, ...contactScope(ctx) } });
    if (!c) throw new HttpError(404, "Contact not found.");
    await logActivity(db, {
      workspaceId: ctx.workspaceId, type: b.type, actor: actorOf(ctx), contactId, opportunityId: b.opportunityId,
      summary: b.type === "CALL" ? `Call logged: ${b.text}` : b.text,
    });
    await recordAction(db, ctx, contactId, b.type === "CALL" ? "call logged" : "note added");
  });
  return { ok: true };
});
