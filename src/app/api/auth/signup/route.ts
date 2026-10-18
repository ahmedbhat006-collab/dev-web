import { z } from "zod";
import { route, body, HttpError } from "@/server/http";
import { tx } from "@/server/db";
import { prisma } from "@/server/db";
import { hashPassword } from "@/server/auth/password";
import { createSession } from "@/server/auth/session";
import { createWorkspace } from "@/server/services/workspace";

const schema = z.object({
  companyName: z.string().trim().min(2, "Enter your company name").max(80),
  name: z.string().trim().min(2, "Enter your name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(8, "Use at least 8 characters").max(200),
  timezone: z.string().max(60).optional(),
});

export const POST = route(async (req) => {
  const b = await body(req, schema);
  if (await prisma.user.findUnique({ where: { email: b.email } }))
    throw new HttpError(409, "An account with this email already exists. Sign in instead.");
  const passwordHash = await hashPassword(b.password);
  const { owner } = await tx((db) => createWorkspace(db, { ...b, passwordHash }));
  await createSession(owner.id);
  return { ok: true };
});
