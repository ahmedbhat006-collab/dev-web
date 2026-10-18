import { PrismaClient, Prisma } from "@prisma/client";

const g = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = g.prisma ?? new PrismaClient({ log: ["error"] });
if (process.env.NODE_ENV !== "production") g.prisma = prisma;

export type Tx = Prisma.TransactionClient;

/** Run an interactive transaction with sane timeouts for a remote DB. */
export function tx<T>(fn: (tx: Tx) => Promise<T>) {
  return prisma.$transaction(fn, { maxWait: 10_000, timeout: 20_000 });
}
