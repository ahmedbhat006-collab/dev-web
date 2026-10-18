import { JobKind, Prisma } from "@prisma/client";
import { prisma, Tx } from "../db";

export async function enqueueJob(
  db: Tx | typeof prisma,
  j: { workspaceId: string; kind: JobKind; payload: Record<string, unknown>; refId?: string },
) {
  return db.outboundJob.create({
    data: {
      workspaceId: j.workspaceId,
      kind: j.kind,
      payload: j.payload as Prisma.InputJsonValue,
      refId: j.refId ?? null,
    },
  });
}

/** Error from a provider. `transient` errors are retried with backoff; permanent ones are shown to users. */
export class ProviderError extends Error {
  constructor(message: string, public transient: boolean, public code?: string) {
    super(message);
  }
}

export function isTransientStatus(status: number) {
  return status === 429 || status >= 500;
}
