import { z } from "zod";
import { route, body, HttpError } from "@/server/http";
import { prisma } from "@/server/db";
import { assertNotLocked, recordAttempt, verifyPassword } from "@/server/auth/password";
import { createSession } from "@/server/auth/session";

const schema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password").max(200),
});

export const POST = route(async (req) => {
  const b = await body(req, schema);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  await assertNotLocked(b.email, ip);
  const user = await prisma.user.findUnique({ where: { email: b.email } });
  const ok = !!user && user.active && (await verifyPassword(b.password, user.passwordHash));
  await recordAttempt(b.email, ip, ok);
  if (!ok) throw new HttpError(401, "Email or password is incorrect.");
  await createSession(user!.id);
  return { ok: true };
});
