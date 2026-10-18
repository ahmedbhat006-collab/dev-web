import { randomBytes } from "crypto";
import { Tx } from "../db";
import { DEFAULT_ROLES } from "@/lib/permissions";
import { audit } from "../audit";

export function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 30) || "workspace"
  );
}

export const DEFAULT_STAGES = [
  { name: "New", kind: "OPEN" as const },
  { name: "Contacted", kind: "OPEN" as const },
  { name: "Qualified", kind: "OPEN" as const },
  { name: "Proposal", kind: "OPEN" as const },
  { name: "Won", kind: "WON" as const },
  { name: "Lost", kind: "LOST" as const },
];

export async function createPipeline(tx: Tx, workspaceId: string, name: string, order = 0) {
  return tx.pipeline.create({
    data: {
      workspaceId,
      name,
      order,
      stages: { create: DEFAULT_STAGES.map((s, i) => ({ ...s, order: i, workspaceId })) },
    },
    include: { stages: true },
  });
}

/** Signup bootstrap: workspace, default roles, Owner, a pipeline and lead rules. */
export async function createWorkspace(
  tx: Tx,
  i: { companyName: string; name: string; email: string; passwordHash: string; timezone?: string },
) {
  const ws = await tx.workspace.create({
    data: { name: i.companyName, slug: `${slugify(i.companyName)}-${randomBytes(2).toString("hex")}` },
  });
  for (const r of DEFAULT_ROLES)
    await tx.role.create({ data: { workspaceId: ws.id, name: r.name, permissions: r.permissions } });

  const owner = await tx.user.create({
    data: {
      workspaceId: ws.id,
      email: i.email.toLowerCase(),
      name: i.name,
      passwordHash: i.passwordHash,
      level: "OWNER",
      receivesLeads: false,
      timezone: i.timezone || "UTC",
    },
  });

  await createPipeline(tx, ws.id, "Sales pipeline", 0);

  await tx.assignmentRule.create({
    data: {
      workspaceId: ws.id,
      maxOpenLeads: 5,
      ackWindowSec: 60,
      idleSec: 600,
      managerUserId: owner.id,
      levels: {
        create: [
          { order: 1, target: "NEXT_ELIGIBLE", seconds: 60 },
          { order: 2, target: "BACKUP", seconds: 60 },
          { order: 3, target: "MANAGER", seconds: 120 },
        ],
      },
    },
  });

  await audit(tx, ws.id, { id: owner.id, name: owner.name }, "WORKSPACE_CREATED", {
    type: "Workspace",
    id: ws.id,
    label: ws.name,
  });
  return { workspace: ws, owner };
}
