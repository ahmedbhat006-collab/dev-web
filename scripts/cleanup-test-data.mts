// Removes records created by automated tests so the demo workspace looks clean.
// Audit entries are append-only by design and are left untouched.
// Usage: npx tsx --env-file=.env scripts/cleanup-test-data.mts
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const demo = await prisma.user.findUniqueOrThrow({ where: { email: "owner@demo.test" } });
const W = demo.workspaceId;

const testContacts = await prisma.contact.findMany({
  where: { workspaceId: W, OR: [{ name: { in: ["Smoke Test Lead", "Absence Test"] } }, { email: { startsWith: "smoke" } }] },
  select: { id: true },
});
const ids = testContacts.map((c) => c.id);
await prisma.payment.deleteMany({ where: { contactId: { in: ids } } });
const delC = await prisma.contact.deleteMany({ where: { id: { in: ids } } });
const delO = await prisma.opportunity.deleteMany({ where: { workspaceId: W, title: "Req field test", payments: { none: {} } } });
await prisma.notification.deleteMany({ where: { workspaceId: W, title: { contains: "Smoke Test" } } });
await prisma.notification.deleteMany({ where: { workspaceId: W, title: { contains: "Absence Test" } } });

// Throwaway workspaces created by the isolation test.
const others = await prisma.workspace.findMany({ where: { name: "Other Co" }, select: { id: true } });
for (const o of others) {
  await prisma.user.deleteMany({ where: { workspaceId: o.id } });
  await prisma.role.deleteMany({ where: { workspaceId: o.id } });
  await prisma.stage.deleteMany({ where: { workspaceId: o.id } });
  await prisma.pipeline.deleteMany({ where: { workspaceId: o.id } });
  await prisma.assignmentRule.deleteMany({ where: { workspaceId: o.id } });
  await prisma.workspace.delete({ where: { id: o.id } });
}

// Put the sales team back to a sensible demo state.
await prisma.user.updateMany({ where: { workspaceId: W, email: { in: ["ali@demo.test", "bilal@demo.test"] } }, data: { status: "AVAILABLE" } });
await prisma.user.updateMany({ where: { workspaceId: W, email: "hina@demo.test" }, data: { status: "BUSY" } });

console.log(`Removed ${delC.count} test contacts (with their leads), ${delO.count} test opportunities, ${others.length} test workspaces.`);
await prisma.$disconnect();
