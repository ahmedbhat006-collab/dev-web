import bcrypt from "bcryptjs";
import { prisma } from "../db";
import { HttpError } from "../http";

export const hashPassword = (p: string) => bcrypt.hash(p, 12);
export const verifyPassword = (p: string, h: string) => bcrypt.compare(p, h);

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_EMAIL = 5;
const MAX_PER_IP = 30;

/** Blocks repeated guessing: 5 failures per email / 30 per IP in 15 minutes. */
export async function assertNotLocked(email: string, ip: string) {
  const since = new Date(Date.now() - WINDOW_MS);
  const [byEmail, byIp] = await Promise.all([
    prisma.loginAttempt.count({ where: { key: `e:${email}`, success: false, createdAt: { gte: since } } }),
    prisma.loginAttempt.count({ where: { key: `i:${ip}`, success: false, createdAt: { gte: since } } }),
  ]);
  if (byEmail >= MAX_PER_EMAIL || byIp >= MAX_PER_IP)
    throw new HttpError(429, "Too many failed sign-in attempts. Wait 15 minutes and try again.");
}

export async function recordAttempt(email: string, ip: string, success: boolean) {
  await prisma.loginAttempt.createMany({
    data: [
      { key: `e:${email}`, success },
      { key: `i:${ip}`, success },
    ],
  });
}
