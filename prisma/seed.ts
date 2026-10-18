/* Demo data: one workspace ("Sunrise Solar") with a team, two pipelines, custom fields, contacts and history.
   Safe to re-run: it skips if the demo workspace exists. Also installs the append-only audit trigger. */
import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createWorkspace } from "../src/server/services/workspace";
import { encrypt, mask } from "../src/server/crypto";

const prisma = new PrismaClient();
const PASSWORD = "demo1234";

async function installAuditTrigger() {
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'AuditLog is append-only: % is not allowed', TG_OP;
    END;
    $$ LANGUAGE plpgsql;`);
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS audit_log_no_change ON "AuditLog";`);
  await prisma.$executeRawUnsafe(
    `CREATE TRIGGER audit_log_no_change BEFORE UPDATE OR DELETE ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();`,
  );
  console.log("✓ Audit log is append-only (trigger installed)");
}

const pick = <T,>(a: T[], i: number) => a[i % a.length];
const daysAgo = (d: number, h = 0) => new Date(Date.now() - d * 86400000 - h * 3600000);

async function main() {
  await installAuditTrigger();
  if (await prisma.user.findUnique({ where: { email: "owner@demo.test" } })) {
    console.log("Demo workspace already exists. Skipping seed.");
    return;
  }
  const hash = await bcrypt.hash(PASSWORD, 12);

  const { workspace: ws, owner } = await prisma.$transaction(
    (tx) => createWorkspace(tx, { companyName: "Sunrise Solar", name: "Sarah Siddiqui", email: "owner@demo.test", passwordHash: hash, timezone: "Asia/Karachi" }),
    { timeout: 30000 },
  );
  await prisma.workspace.update({ where: { id: ws.id }, data: { slug: "sunrise-solar" } });
  const W = ws.id;
  const roles = Object.fromEntries((await prisma.role.findMany({ where: { workspaceId: W } })).map((r) => [r.name, r.id]));

  const mk = (name: string, email: string, level: "ADMIN" | "USER", role: string, extra: Partial<Prisma.UserCreateManyInput> = {}) =>
    prisma.user.create({ data: { workspaceId: W, name, email, passwordHash: hash, level, roleId: roles[role], timezone: "Asia/Karachi", ...extra } });
  const admin = await mk("Usman Tariq", "admin@demo.test", "ADMIN", "Admin", { receivesLeads: false });
  const manager = await mk("Mariam Malik","manager@demo.test", "USER", "Manager", { receivesLeads: false });
  const ali = await mk("Ali Raza", "ali@demo.test", "USER", "Sales");
  const bilal = await mk("Bilal Ahmed", "bilal@demo.test", "USER", "Sales");
  const hina = await mk("Hina Shah", "hina@demo.test", "USER", "Sales", { status: "BUSY" });
  const sales = [ali, bilal, hina];

  // Lead rules tuned for a live demo: 30s to acknowledge, then escalate.
  const rule = await prisma.assignmentRule.update({
    where: { workspaceId: W },
    data: { ackWindowSec: 30, maxOpenLeads: 6, idleSec: 900, backupUserId: admin.id, managerUserId: manager.id },
  });
  await prisma.escalationLevel.deleteMany({ where: { ruleId: rule.id } });
  await prisma.escalationLevel.createMany({
    data: [
      { ruleId: rule.id, order: 1, target: "NEXT_ELIGIBLE", seconds: 30 },
      { ruleId: rule.id, order: 2, target: "BACKUP", seconds: 30 },
      { ruleId: rule.id, order: 3, target: "MANAGER", seconds: 60 },
    ],
  });

  // Pipelines
  const resi = await prisma.pipeline.findFirstOrThrow({ where: { workspaceId: W }, include: { stages: { orderBy: { order: "asc" } } } });
  await prisma.pipeline.update({ where: { id: resi.id }, data: { name: "Residential solar" } });
  const comm = await prisma.pipeline.create({
    data: {
      workspaceId: W, name: "Commercial projects", order: 1,
      stages: { create: ["Discovery", "Site visit", "Qualified", "Proposal", "Won", "Lost"].map((n, i) => ({ workspaceId: W, name: n, order: i, kind: n === "Won" ? "WON" : n === "Lost" ? "LOST" : "OPEN" })) },
    },
    include: { stages: { orderBy: { order: "asc" } } },
  });

  // Custom fields
  const f = async (entity: "CONTACT" | "OPPORTUNITY", name: string, key: string, type: "TEXT" | "NUMBER" | "DATE" | "DROPDOWN" | "CHECKBOX", options: string[] = [], pipelineId: string | null = null, order = 0) =>
    prisma.customField.create({ data: { workspaceId: W, entity, name, key, type, options, pipelineId, order } });
  await f("CONTACT", "City", "city", "DROPDOWN", ["Lahore", "Karachi", "Islamabad", "Faisalabad"], null, 0);
  await f("CONTACT", "Referral source", "referral_source", "TEXT", [], null, 1);
  await f("CONTACT", "Prefers WhatsApp", "prefers_whatsapp", "CHECKBOX", [], null, 2);
  const kw = await f("OPPORTUNITY", "System size (kW)", "system_kw", "NUMBER", [], resi.id, 0);
  await f("OPPORTUNITY", "Roof type", "roof_type", "DROPDOWN", ["Flat concrete", "Sloped", "Metal sheet"], resi.id, 1);
  await f("OPPORTUNITY", "Site survey date", "survey_date", "DATE", [], null, 2);
  await f("OPPORTUNITY", "Building area (sq ft)", "building_sqft", "NUMBER", [], comm.id, 0);
  const dm = await f("OPPORTUNITY", "Decision maker", "decision_maker", "TEXT", [], comm.id, 1);

  const resiProposal = resi.stages.find((s) => s.name === "Proposal")!;
  await prisma.stage.update({ where: { id: resiProposal.id }, data: { requiredFieldIds: [kw.id] } });
  const commQualified = comm.stages.find((s) => s.name === "Qualified")!;
  await prisma.stage.update({ where: { id: commQualified.id }, data: { requiredFieldIds: [dm.id] } });

  // Companies & contacts
  const companies = await Promise.all(
    ["Gulberg Textiles", "Crescent Foods", "Al-Noor Schools", "Indus Pharma", "Margalla Heights", "Ravi Logistics"].map((name, i) =>
      prisma.company.create({ data: { workspaceId: W, name, domain: `${name.toLowerCase().replace(/[^a-z]+/g, "")}.pk`, phone: `+9242${3500000 + i * 1111}` } }),
    ),
  );
  const first = ["Ahmed", "Fatima", "Zain", "Ayesha", "Hamza", "Maryam", "Saad", "Noor", "Imran", "Sana", "Kamran", "Mehwish", "Faisal", "Rabia", "Tariq", "Amna", "Danish", "Iqra", "Waqas", "Hira", "Asad", "Zoya", "Shoaib", "Laiba", "Yasir", "Komal", "Junaid", "Aliya", "Naveed", "Sidra", "Owais", "Mahnoor", "Farhan", "Anum", "Haris", "Bushra"];
  const last = ["Khan", "Butt", "Qureshi", "Chaudhry", "Sheikh", "Mirza", "Abbasi", "Hussain", "Iqbal", "Javed"];
  const cities = ["Lahore", "Karachi", "Islamabad", "Faisalabad"];
  const tags = [["homeowner"], ["homeowner", "hot"], ["business"], ["referral"], ["business", "hot"], ["homeowner", "referral"]];
  const contacts = [];
  for (let i = 0; i < first.length; i++) {
    const owner = pick(sales, i);
    const name = `${first[i]} ${pick(last, i * 3)}`;
    contacts.push(
      await prisma.contact.create({
        data: {
          workspaceId: W, name, email: `${first[i].toLowerCase()}.${pick(last, i * 3).toLowerCase()}@example.com`,
          phone: `+92300${String(1000000 + i * 7919).slice(0, 7)}`, companyId: i % 3 === 0 ? pick(companies, i).id : null,
          ownerId: owner.id, tags: pick(tags, i), createdAt: daysAgo(i % 20, i % 7),
          customValues: { city: pick(cities, i), prefers_whatsapp: i % 2 === 0, ...(i % 4 === 0 ? { referral_source: "Facebook ad" } : {}) },
        },
      }),
    );
  }

  // Opportunities
  const roofs = ["Flat concrete", "Sloped", "Metal sheet"];
  for (let i = 0; i < contacts.length; i++) {
    const c = contacts[i];
    const isComm = !!c.companyId;
    const p = isComm ? comm : resi;
    const stage = p.stages[(i * 5) % p.stages.length];
    const value = isComm ? 2_500_000 + ((i * 731_000) % 9_000_000) : 450_000 + ((i * 97_000) % 1_600_000);
    const cv: Record<string, unknown> = isComm
      ? { building_sqft: 8000 + i * 650, ...(stage.order >= 2 ? { decision_maker: "Operations Director" } : {}) }
      : { roof_type: pick(roofs, i), ...(stage.order >= 2 || i % 2 ? { system_kw: 5 + (i % 8) } : {}) };
    const o = await prisma.opportunity.create({
      data: {
        workspaceId: W, title: isComm ? `${companies.find((x) => x.id === c.companyId)!.name} rooftop` : `${c.name.split(" ")[0]}'s home system`,
        contactId: c.id, pipelineId: p.id, stageId: stage.id, value, currency: "PKR", ownerId: c.ownerId, customValues: cv as Prisma.InputJsonValue,
        createdAt: c.createdAt, closedAt: stage.kind === "OPEN" ? null : daysAgo(i % 5),
      },
    });
    await prisma.activity.create({
      data: { workspaceId: W, type: "SYSTEM", actorId: c.ownerId, actorName: sales.find((s) => s.id === c.ownerId)!.name, summary: `Opportunity "${o.title}" created in ${p.name} · ${stage.name}`, contactId: c.id, opportunityId: o.id, createdAt: c.createdAt },
    });
  }

  // Historical leads (closed / acknowledged) so response-time metrics have data
  const sources = ["WEB_FORM", "WHATSAPP", "MANUAL"] as const;
  for (let i = 0; i < 14; i++) {
    const c = contacts[i];
    const assigned = daysAgo(i % 6, 2 + (i % 5));
    const ackAfter = 20 + ((i * 37) % 240);
    const ackAt = new Date(assigned.getTime() + ackAfter * 1000);
    const l = await prisma.lead.create({
      data: {
        workspaceId: W, contactId: c.id, source: pick([...sources], i), status: i < 4 ? "ACKNOWLEDGED" : "CLOSED",
        assigneeId: c.ownerId, assignedAt: assigned, firstAssignedAt: assigned, acknowledgedAt: ackAt, firstAckAt: ackAt, firstAckById: c.ownerId,
        lastActionAt: i < 4 ? new Date() : ackAt, createdAt: assigned, title: "Interested in a solar quote",
      },
    });
    const ownerName = sales.find((s) => s.id === c.ownerId)!.name;
    await prisma.activity.createMany({
      data: [
        { workspaceId: W, type: "ASSIGNMENT", actorName: "System", summary: `Assigned to ${ownerName} · Round-robin`, leadId: l.id, contactId: c.id, toUserId: c.ownerId, createdAt: assigned },
        { workspaceId: W, type: "ACK", actorId: c.ownerId, actorName: ownerName, summary: `Acknowledged by ${ownerName} (Acknowledge button)`, leadId: l.id, contactId: c.id, createdAt: ackAt },
      ],
    });
  }
  // One lead that bounced around: shows up in the recovery queue ("Escalated 2×").
  const bounced = contacts[20];
  const bl = await prisma.lead.create({
    data: {
      workspaceId: W, contactId: bounced.id, source: "WEB_FORM", status: "ACKNOWLEDGED", assigneeId: manager.id,
      assignedAt: daysAgo(0, 3), firstAssignedAt: daysAgo(0, 4), acknowledgedAt: daysAgo(0, 2), firstAckAt: daysAgo(0, 2), firstAckById: manager.id,
      escalationLevel: 2, escalationCount: 2, lastActionAt: daysAgo(0, 2), createdAt: daysAgo(0, 4), title: "Need 10kW system for a new house",
    },
  });
  await prisma.activity.createMany({
    data: [
      { workspaceId: W, type: "ESCALATION", actorName: "System", summary: `Escalated to ${bilal.name} (from ${ali.name}) · Not acknowledged in time`, leadId: bl.id, contactId: bounced.id, fromUserId: ali.id, toUserId: bilal.id, createdAt: daysAgo(0, 3.9) },
      { workspaceId: W, type: "ESCALATION", actorName: "System", summary: `Escalated to ${manager.name} (from ${bilal.name}) · Not acknowledged in time`, leadId: bl.id, contactId: bounced.id, fromUserId: bilal.id, toUserId: manager.id, createdAt: daysAgo(0, 3.5) },
    ],
  });

  // Integrations from env (optional) — stored encrypted, per workspace.
  const integ = async (provider: "WHATSAPP" | "STRIPE" | "RESEND", creds: Record<string, string | undefined>, secretKeys: string[]) => {
    if (Object.values(creds).some((v) => !v && v !== undefined)) return;
    if (!Object.values(creds).every(Boolean)) return;
    const hints = Object.fromEntries(Object.entries(creds).map(([k, v]) => [k, secretKeys.includes(k) ? mask(v) : v!]));
    await prisma.integration.create({ data: { workspaceId: W, provider, status: "CONNECTED", encryptedCreds: encrypt(JSON.stringify(creds)), hints, lastOkAt: new Date() } });
    console.log(`✓ ${provider} connected from .env`);
  };
  const e = process.env;
  await integ("WHATSAPP", { phoneNumberId: e.WHATSAPP_PHONE_NUMBER_ID, accessToken: e.WHATSAPP_ACCESS_TOKEN, appSecret: e.WHATSAPP_APP_SECRET, verifyToken: e.WHATSAPP_VERIFY_TOKEN }, ["accessToken", "appSecret", "verifyToken"]);
  await integ("STRIPE", { secretKey: e.STRIPE_SECRET_KEY, webhookSecret: e.STRIPE_WEBHOOK_SECRET }, ["secretKey", "webhookSecret"]);
  await integ("RESEND", { apiKey: e.RESEND_API_KEY, from: e.RESEND_FROM || "Dastak <onboarding@resend.dev>" }, ["apiKey"]);

  await prisma.auditLog.create({ data: { workspaceId: W, actorName: "System", action: "DEMO_DATA_SEEDED", targetType: "Workspace", targetId: W, targetLabel: ws.name } });

  console.log(`
✓ Demo workspace "Sunrise Solar" ready  (public form: /f/sunrise-solar)
  Password for every account: ${PASSWORD}
  owner@demo.test    Owner
  admin@demo.test    Admin (backup in escalation chain)
  manager@demo.test  Manager role (final escalation level)
  ali@demo.test, bilal@demo.test, hina@demo.test   Sales (receive leads)
  Workspace ID (for webhook URLs): ${W}
  Owner id: ${owner.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
