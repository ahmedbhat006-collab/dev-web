import { z } from "zod";
import { route, body, HttpError, notFound } from "@/server/http";
import { prisma } from "@/server/db";
import { createLead } from "@/server/services/leads";
import { SYSTEM } from "@/server/audit";
import { phoneSchema } from "@/server/schemas";

export const GET = route(async (_req, { params }) => {
  const { slug } = await params;
  const ws = await prisma.workspace.findUnique({ where: { slug }, select: { name: true } });
  if (!ws) throw notFound("Form");
  return ws;
});

const schema = z.object({
  name: z.string().trim().min(1, "Please enter your name").max(120),
  email: z.string().trim().email("Please enter a valid email").or(z.literal("")).optional(),
  phone: phoneSchema.optional(),
  company: z.string().trim().max(120).optional(),
  message: z.string().trim().max(2000).optional(),
  website: z.string().max(0).optional(), // honeypot: must stay empty
});

/** Public lead form (no login). Rate limited per IP. */
export const POST = route(
  async (req, { params }) => {
    const { slug } = await params;
    const ws = await prisma.workspace.findUnique({ where: { slug } });
    if (!ws) throw notFound("Form");
    const b = await body(req, schema);
    if (!b.email && !b.phone) throw new HttpError(400, "Please leave an email or a phone number so we can reach you.");
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    const key = `form:${ip}`;
    const recent = await prisma.loginAttempt.count({ where: { key, createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) } } });
    if (recent >= 20) throw new HttpError(429, "Too many submissions. Please try again in a few minutes.");
    await prisma.loginAttempt.create({ data: { key, success: true } });
    await createLead({
      workspaceId: ws.id, source: "WEB_FORM", name: b.name, email: b.email || null, phone: b.phone ?? null,
      companyName: b.company, message: b.message, actor: SYSTEM,
    });
    return { ok: true };
  },
  { csrf: false },
);
