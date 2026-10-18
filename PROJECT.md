# Unified Business Management Platform (CRM)

A multi-tenant CRM for small service businesses where **every incoming lead always has exactly one accountable owner**. Leads are auto-assigned, acknowledged and escalated. The CRM is customizable, every important action is audited, and real integrations cover messaging, payments, calendar and email alerts.

> Constraints: **4-hour competition build, 2 people.** Every timer is configurable in **seconds** so the demo can show escalation live.

---

## 1. Demo story (what we must show)

1. A lead arrives (public web form, WhatsApp message or manual entry).
2. It is auto-assigned **round-robin** to an *Available* employee who is under their open-lead limit. A **countdown** starts.
3. Nobody acknowledges it, so it **escalates** to the next eligible employee, then the backup, then the manager. The new owner gets an **email** (Resend).
4. The manager sees it in the **Recovery queue** and on the **Dashboard**, updating without a page refresh.
5. The employee replies on **WhatsApp** (Meta WhatsApp Cloud API, free test number), sends a **Stripe** payment link and books a **Google Calendar** meeting.
6. All of it appears on the **contact page** (full customer view) and in the **audit log**.

---

## 2. Tech stack

| Layer | Choice | Why |
|---|---|---|
| App | **Next.js 15** (App Router, TypeScript), one app for UI + API route handlers | One codebase, fastest to build |
| UI | Tailwind CSS + shadcn/ui, dnd-kit (pipeline board), SWR | Accessible, responsive components |
| Database | **PostgreSQL (Neon free tier)** + **Prisma** | Transactions and row locks for safe escalation |
| Auth | bcrypt password hashes, JWT (jose) in an httpOnly SameSite=Lax cookie, revocable `Session` table, login rate limit | Q1 |
| Validation | zod on every API route | Q3 |
| Background jobs | DB-driven worker loop started from `instrumentation.ts`, running every 2s (escalation sweep + outbound retries) | No Redis needed; deadlines live in the DB, so it survives restarts |
| Real-time | SWR polling every 3s (leads, inbox, dashboard, payments) | Q11 without websockets |
| Integrations | `stripe` SDK; WhatsApp Cloud API, Google Calendar and Resend via their REST APIs (`fetch`) | All free / test mode (Twilio replaced: not free) |
| Secrets | `.env` (git-ignored) + per-workspace credentials encrypted with AES-256-GCM | I5.2, I5.3 |
| Hosting | ngrok during development, then **Railway or Render** (long-running Node service so the worker runs) before the demo | Webhooks need public HTTPS |

---

## 3. Architecture (Q14)

```
src/
  app/                  # pages (presentation)
    api/**              # thin route handlers
    f/[slug]/           # public lead form
  server/
    auth/               # password, session, rate limit, getContext()
    authz/              # permission list, requirePerm(), field masking
    services/           # business rules: crm, leads, assignment, escalation, payments, metrics...
    repo/               # Prisma access, ALWAYS scoped by workspaceId
    integrations/       # whatsapp.ts, stripe.ts, google.ts, resend.ts (small interfaces)
    jobs/               # worker: escalation sweep, outbound job retries
    audit.ts            # append-only audit writer
  lib/                  # shared types, zod schemas, crypto helpers
prisma/
  schema.prisma
  seed.ts               # demo workspace, users, pipelines, contacts
```

**Request flow:** route handler → `getContext()` (user + workspace from session) → `requirePerm(ctx, "...")` → service → repo (filters by `ctx.workspaceId`).
- IDs are cuids (not guessable). A record from another workspace returns **404**, and a missing permission returns **403** (F1.5, F1.6, Q2).
- Hiding a button is never the only check. The server enforces every rule.

---

## 4. Data model (every table has `workspaceId`)

**Accounts**
- `Workspace` (name, slug)
- `User` (email, passwordHash, level `OWNER|ADMIN|USER`, roleId, status `AVAILABLE|BUSY|ON_LEAVE|OFFLINE`, notifyEmail, timezone)
- `Role` (name, permissions `string[]`). "Manager" is just a role.
- `Session` (userId, expiresAt, revokedAt), `Invite` (email, level, roleId, token)

**CRM**
- `Company` (name, …)
- `Contact` (companyId, name, email, phone E.164 unique per workspace, tags[], ownerId, optedOut, optOutReason, customValues JSON)
- `Pipeline` (name), `Stage` (pipelineId, name, order, kind `OPEN|WON|LOST`, requiredFieldIds[])
- `Opportunity` (contactId, pipelineId, stageId, title, value, currency, ownerId, customValues JSON, **version** for optimistic locking)
- `CustomField` (entity `CONTACT|OPPORTUNITY`, pipelineId nullable, name, key, type `TEXT|NUMBER|DATE|DROPDOWN|CHECKBOX`, options[])
- `SavedList` (entity, name, filters JSON). Filters are re-run on every load, so the list updates automatically.
- `Activity` (contactId?, opportunityId?, leadId?, type `NOTE|STAGE_CHANGE|ASSIGNMENT|FIELD_EDIT|MESSAGE|PAYMENT|APPOINTMENT|ACK|ESCALATION`, actorId or system, data JSON, createdAt)

**Lead engine**
- `Lead` (contactId, opportunityId?, source `WEB_FORM|WHATSAPP|MANUAL`, status `OPEN|ACKNOWLEDGED|CLOSED`, assigneeId, assignedAt, firstAssignedAt, ackDeadline, acknowledgedAt, firstAckAt, escalationLevel, escalationCount, lastActionAt, ownerAway, **version**)
- `AssignmentRule` (one per workspace: mode `ROUND_ROBIN`, maxOpenLeads, rrCursor, ackWindowSec, idleSec, backupUserId, managerUserId)
- `EscalationLevel` (order, target `NEXT_ELIGIBLE|BACKUP|MANAGER`, seconds)

**Audit**
- `AuditLog` (actorId or `system`, action, targetType, targetId, before JSON, after JSON, createdAt). It is **append-only**: no update or delete route exists, and a Postgres trigger rejects UPDATE/DELETE (F4.3).

**Integrations**
- `Integration` (provider `TWILIO|STRIPE|RESEND|GOOGLE`, status `NOT_CONNECTED|CONNECTED|ERROR`, encryptedCreds, lastOkAt, lastError)
- `GoogleConnection` (userId, encrypted access/refresh tokens, expiry, googleEmail, needsReconnect)
- `Conversation` (contactId, channel `WHATSAPP`, assigneeId, opportunityId?)
- `Message` (conversationId, direction `IN|OUT`, body, status `QUEUED|SENT|DELIVERED|READ|FAILED`, errorCode, errorMessage, providerSid **unique**)
- `Payment` (opportunityId, contactId, requestedById, amount (minor units), currency, status `PENDING|PAID|EXPIRED|FAILED|REFUNDED|PARTIALLY_REFUNDED`, stripeSessionId, stripePaymentIntentId, url, refundedAmount, paidAt)
- `Appointment` (contactId, opportunityId?, userId, googleEventId, title, startUtc, endUtc, timezone, status `SCHEDULED|CANCELLED`)
- `IntegrationEvent` (provider, direction `IN|OUT`, type, externalId, result `OK|ERROR|REJECTED|DUPLICATE`, error, createdAt). A unique (provider, externalId) handles dedupe (I1.8, I2.4, I5.4).
- `OutboundJob` (kind `SEND_EMAIL|SEND_WHATSAPP`, payload JSON, status, attempts, maxAttempts=3, nextAttemptAt, lastError), used for retries with backoff (I4.4, I5.5)

**Dashboard**
- `DashboardPref` (userId, hiddenWidgets[])

---

## 5. Roles & permissions (F1)

Base levels: **Owner, Admin, User**. Permissions are granted through roles and are not tied to level names.

| Permission | Meaning |
|---|---|
| `crm.view` / `crm.create` / `crm.edit` / `crm.delete` / `crm.export` | CRM records |
| `opportunity.value.view` | See opportunity values (masked as `•••` in lists, detail and CSV otherwise) |
| `leads.view_all` | See all leads, not just own |
| `leads.reassign` | Manually reassign leads |
| `leads.manage_rules` | Assignment and escalation settings |
| `integrations.manage` | Connect, change or remove integrations |
| `audit.view` | Open the audit log |
| `users.manage` | Invite users, change roles and levels |
| `settings.customize` | Pipelines, stages, custom fields |

Rules:
- The Owner implicitly has everything and cannot be modified by an Admin.
- Signup creates a workspace, makes the user its Owner, and seeds the default roles (Admin, Manager, Sales) and a default pipeline.
- Every role or permission change is audited with before/after values.

---

## 6. Lead engine (F3, the core)

**Intake (F3.1)**: the public form `/f/[workspaceSlug]`, an inbound WhatsApp message from an unknown number, or manual entry. Each one matches or creates the Contact, creates a `Lead` with a source label, then calls `assignLead()`.

**assignLead() (F3.3, F3.8)**, all in one DB transaction:
1. Lock the workspace's `AssignmentRule` row (`SELECT … FOR UPDATE`).
2. Eligible = status `AVAILABLE` **and** open leads < `maxOpenLeads`, ordered by id. Pick the next one after `rrCursor`.
3. Set assignee, assignedAt, ackDeadline = now + window, and advance `rrCursor`.
4. Write Activity + AuditLog. The in-app notification badge picks it up through polling.
5. If nobody is eligible, assign to the backup, else the manager, and flag the lead for the recovery queue.

**Acknowledge (glossary)**: the Acknowledge button, **or** any recorded action (note, message, call log, stage change, appointment). This sets `acknowledgedAt` and `firstAckAt` (first time only) and clears the deadline.

**Escalation sweep (F3.5, F3.8, Q5)**: the worker runs every 2s:
```sql
SELECT id FROM "Lead"
WHERE "acknowledgedAt" IS NULL AND "ackDeadline" < now()
FOR UPDATE SKIP LOCKED
```
For each lead: move to the next `EscalationLevel` target (next eligible → backup → manager), set a new deadline from that level's seconds, then `escalationLevel++`, `escalationCount++`, `version++`, write Audit + Activity (`ESCALATION`, reason "ack window expired"), and enqueue an email to the new owner (F3.9).
- Row locks plus the version check mean two timers can never escalate the same lead twice.
- Deadlines live in the DB, so a server restart simply resumes the sweep.

**Absence (F3.6)**: setting a user to *On leave* or *Offline* immediately reassigns all their **unacknowledged** leads. **Acknowledged** leads stay with that owner but are flagged `ownerAway` and appear in the recovery queue so a manager can reassign them. This rule is shown in the UI next to the status selector.

**Recovery queue (F3.7)**: a computed list, with a reason shown for each lead:
- `Overdue`: unacknowledged past its deadline
- `Escalated ×N`: escalationCount ≥ 2
- `Idle`: no recorded action for `idleSec`
- `Owner away`: acknowledged, but the owner is on leave or offline

**Manual reassignment** is audited as a `REASSIGN` action and counted separately from escalations.

**UI:** every lead shows its owner, source and a **live countdown** (remaining seconds).

---

## 7. Integrations

### I1. WhatsApp Cloud API (Meta, free test number). Replaces Twilio, which isn't free.
- Webhook: `GET/POST /api/webhooks/whatsapp/[workspaceId]`. GET answers Meta's verify-token handshake. On POST, the `X-Hub-Signature-256` HMAC is checked against the workspace's app secret before anything is stored. A forged request returns 401 and is logged as `REJECTED`.
- Dedupe on `MessageSid`, so a repeat delivery creates no new message or lead.
- A known number attaches to the existing contact. An unknown number creates a contact and a lead (source `WHATSAPP`).
- Replies go out through an `OutboundJob`. Failures stay visible as **Failed** with the reason and a **Retry** button.
- Status updates (sent / delivered / read / failed) arrive on the same webhook and are stored on each message, deduped per status.
- Opt-out: contacts with `optedOut` cannot be messaged and the UI explains why. An inbound "STOP" sets the opt-out.
- Conversations show the assigned employee and are visible only to the assignee or users with `leads.view_all`.
- Stated limit: "Sandbox only reaches phones that sent the join phrase."

### I2. Stripe (test mode)
- From an opportunity: amount + currency → **Checkout Session** (metadata: paymentId, workspaceId, opportunityId). The link can be copied or sent over WhatsApp.
- Webhook `POST /api/webhooks/stripe/[workspaceId]`: `stripe.webhooks.constructEvent(rawBody, sig, workspaceSecret)` runs **before** any change, and events are deduped by `event.id`.
- Handled events: `checkout.session.completed` → PAID, `checkout.session.expired` → EXPIRED, `checkout.session.async_payment_failed` / `payment_intent.payment_failed` → FAILED, `charge.refunded` → REFUNDED / PARTIALLY_REFUNDED.
- The payment status updates on screen through polling, with no manual refresh.
- Each payment shows the opportunity, contact, requester and Stripe reference. **No card data is ever stored.**

### I3. Google Calendar (OAuth 2.0)
- The OAuth client (ID/secret) is app-level in env. Each employee connects their own account (`access_type=offline`, `prompt=consent`, scope `calendar.events` + `calendar.freebusy`) and can disconnect it.
- Tokens are encrypted, stored only on the server and auto-refreshed. `invalid_grant` sets `needsReconnect`, and the UI shows a "Reconnect" prompt.
- Booking reads `freebusy.query` for the employee and warns about or blocks overlaps.
- Times are stored in **UTC** plus the employee's IANA timezone and displayed in the viewer's timezone.
- Reschedule patches the Google event and cancel deletes it. Both are logged in the activity history.
- An employee without a connected calendar cannot be booked, and the UI says why. Admins see each user's connection status.

### I4. Resend email (escalation alerts)
- On escalation, an email goes to the new owner's `notifyEmail` (each user sets their own in their profile).
- Content: lead name, source, escalation reason, and a link `APP_URL/leads/[id]`.
- Sending goes through an `OutboundJob`: retried up to 3 times with backoff, and failures show on the Integrations page.
- Stated limit: "Without a verified domain, Resend only delivers to the account owner's email." The demo uses that address.

### I5. Shared rules
- `/settings/integrations` lists each provider with status, last success, recent errors, masked secrets (`sk_test_…4f2a`), a "what it can / can't do" text and the sync history (`IntegrationEvent`).
- Credentials are per workspace and encrypted (Google is per user).
- Only `integrations.manage` users can change integrations, and every change is audited.
- Temporary errors (5xx, timeouts, 429) are retried with backoff. Permanent errors (4xx) get a plain-English message.
- Every provider call is wrapped in try/catch with a timeout, so one provider outage never breaks other pages (I5.8).

---

## 8. Pages

| Page | Notes |
|---|---|
| `/signup`, `/login` | Signup creates workspace + Owner |
| `/dashboard` | Live figures, drill-down, hide/show widgets |
| `/leads` | Mine / All tabs, countdown, Acknowledge, Reassign, New lead |
| `/leads/recovery` | Recovery queue with reasons |
| `/contacts`, `/contacts/[id]` | Filters (≥3 criteria), saved lists, CSV export; detail = **full customer view** (conversations, opportunities, payments, appointments, owner, activity) |
| `/companies`, `/companies/[id]` | |
| `/pipelines/[id]` | Kanban board (drag between stages) + list view |
| `/opportunities/[id]` | Custom fields, stage, payments, appointments, activity |
| `/inbox` | WhatsApp conversations |
| `/settings/users` | Invite, levels, roles, status, calendar connection status |
| `/settings/roles` | Permission checkboxes per role |
| `/settings/pipelines` | Add/rename/reorder/delete stages (deleting a non-empty stage asks for a target stage first), required fields per stage |
| `/settings/fields` | Custom fields per entity / pipeline |
| `/settings/assignment` | Round-robin, max open leads, ack window, idle period, escalation levels, backup, manager |
| `/settings/integrations` | See I5 |
| `/settings/profile` | My status, notify email, timezone, Google connect |
| `/audit` | Filter by event type, user, date (read-only) |
| `/f/[slug]` | Public lead form |

---

## 9. Dashboard (F5) and metric definitions

All figures come from one `server/services/metrics.ts` so every screen shows the same value (Q12).

| Figure | Definition | Drill-down |
|---|---|---|
| New leads today | Leads created since local midnight | `/leads?created=today` |
| Open pipeline value by stage | Sum of opportunity values not in WON/LOST stages, by stage (only with `opportunity.value.view`) | Pipeline list filtered by stage |
| Avg time to first response | avg(firstAckAt − firstAssignedAt) | `/leads?acknowledged=true` |
| Recovery queue | Count of recovery-queue leads | `/leads/recovery` |
| Escalations (24h) | Automatic escalations in the last 24h (manual reassignments excluded) | `/audit?action=ESCALATION` |
| Employee availability | Count per status | `/settings/users` |
| Upcoming appointments | Next 7 days | Appointment list |
| Collected this month | Sum of PAID payments confirmed by webhook, minus refunds | Payments list |

- **User** level sees personal figures (own leads, own response time). **Owner/Admin** see company-wide figures.
- Hidden widgets are saved per user in `DashboardPref`.
- Projected revenue (open opportunity values + unpaid payment requests) is shown separately from collected revenue (I2.6).

---

## 10. Quality checklist (Q1–Q14)

- **Q1**: bcrypt (cost 12), 7-day session expiry, logout revokes the session, 5 failed logins per 15 min per email/IP gets locked out.
- **Q2/F1.5/F1.6**: `requirePerm` + workspace scoping on every route, plus a test that hits another workspace's IDs.
- **Q3**: zod everywhere, Prisma (parameterized queries), React escaping (no `dangerouslySetInnerHTML`), SameSite cookie + Origin check on mutating routes for CSRF. Webhooks are verified by signature instead.
- **Q4**: FKs with restrict/cascade chosen deliberately. Deleting a stage requires moving its opportunities first, and deleting a user requires reassigning their records. Opportunity edits use a `version` check (409 "someone else changed this, reload").
- **Q5**: row locks, SKIP LOCKED, unique external IDs, restart-safe worker.
- **Q6**: everything lives in Postgres, and config is per workspace.
- **Q7/Q8**: mobile-first Tailwind, sidebar collapses to a drawer, labelled inputs, focus rings, status shown as text + color.
- **Q9**: server-side pagination (25/page) and debounced search.
- **Q10**: toasts for success/failure, button loading states, errors that say what to do next.
- **Q11**: 3s SWR polling.
- **Q13**: `.env.example`, README, seed script.

---

## 11. 4-hour build plan (2 people)

| Time | Person A: core app | Person B: integrations |
|---|---|---|
| **0:00–0:30** | `create-next-app`, Tailwind + shadcn, Prisma schema, Neon DB, migrate, auth (signup → workspace + Owner, login, logout, session) | **Create accounts** (see §12), fill `.env`, start ngrok |
| **0:30–1:30** | `getContext` / `requirePerm` / scoping, Contacts, Companies, Opportunities CRUD, pipeline board, custom fields | Crypto helper, Integration / IntegrationEvent / OutboundJob, worker loop, Twilio inbound + send + status + signature check |
| **1:30–2:30** | Lead engine: intake (form, manual), round-robin, ack, escalation sweep, absence, recovery queue, audit log page | Stripe checkout + webhook (+ refunds), Resend escalation email, Integrations page |
| **2:30–3:15** | Dashboard + drill-down, saved lists, stage-required fields, full contact view, roles/permissions UI | Google OAuth, freebusy check, create / reschedule / cancel events |
| **3:15–3:45** | Seed data, mobile + accessibility pass | Deploy to Railway/Render, update all webhook URLs, smoke-test integrations |
| **3:45–4:00** | Rehearse the demo script together | |

**Shared contract (agree in the first 10 minutes):** the Prisma schema (§4) and the `getContext()` / `requirePerm()` / `audit()` / `logActivity()` / `acknowledgeLead()` helper signatures. Person B calls `createLeadFromIntake()` and `acknowledgeLead()` from Person A.

**Cut order if behind schedule:** CSV export → dashboard hide/show → reschedule (keep cancel) → saved-list polish → second pipeline (only if F2.3 is already shown via seed).

---

## 12. Account setup (Person B, first 30 min)

1. **Neon**: create a project and copy the pooled `DATABASE_URL` + direct URL.
2. **WhatsApp Cloud API**: see README "WhatsApp" section (Meta developer app → WhatsApp → API Setup → test number, add your phone as a recipient, set webhook URL + verify token, subscribe to `messages`).
3. **Stripe**: test mode, copy `sk_test_…`, add a webhook endpoint `https://<host>/api/webhooks/stripe/<workspaceId>` with the events in §7 I2, and copy `whsec_…`.
4. **Google Cloud**: new project, enable the Calendar API, set the OAuth consent screen to External/Testing, **add both team emails as test users**, create an OAuth Client (Web) with redirect `https://<host>/api/integrations/google/callback` (+ localhost).
5. **Resend**: sign up, create an API key, and send from `onboarding@resend.dev` to the account email.
6. **ngrok**: `ngrok http 3000`, set `APP_URL` to the ngrok URL.

---

## 13. Environment variables (`.env.example`)

```
DATABASE_URL=
DIRECT_URL=
JWT_SECRET=                 # 32+ random bytes
ENCRYPTION_KEY=             # 32 bytes base64 (AES-256-GCM)
APP_URL=http://localhost:3000
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
# Optional: pre-fill the seeded demo workspace's integrations
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
RESEND_API_KEY=
RESEND_FROM=onboarding@resend.dev
```

**Run:** `npm i` → `npx prisma migrate dev` → `npm run seed` → `npm run dev` → `ngrok http 3000`.

---

## 14. Demo checklist (verification)

1. Sign up → you're the Owner. Refresh keeps you logged in. A second workspace gets a 404 for the first workspace's contact URL.
2. A User without `opportunity.value.view` sees `•••` in list, detail and CSV. A direct `curl` to a forbidden API returns 403.
3. Admin adds a custom field → it appears on forms immediately. A stage that requires it blocks the move with a clear message.
4. Two pipelines show different custom fields for the same contact.
5. A saved list with 3 criteria auto-updates when a record changes.
6. Submit the public form → lead assigned round-robin with a countdown → wait for the window → it escalates, the email arrives, an audit entry is written, and the recovery queue and dashboard update without a refresh.
7. Set an employee On leave → their unacknowledged leads move immediately. Acknowledged ones show "Owner away".
8. WhatsApp from your phone → new contact + lead. Reply from the app → it arrives on the phone with a Delivered status. Replaying the webhook creates no duplicate. A tampered signature returns 403 and is logged.
9. Opt a contact out → sending is blocked with an explanation.
10. Stripe link → pay with `4242 4242 4242 4242` → PAID appears automatically. A refund from the Stripe dashboard → REFUNDED, and collected revenue drops.
11. Connect Google → booking shows a conflict warning on busy time → the event appears in Google Calendar → cancel → the event is removed and logged.
12. The audit log filters by type, user and date, and there is no way to edit or delete entries.
13. Every main page is usable at phone width.

---

## 15. Requirement traceability

| Req | Where |
|---|---|
| F1.1–F1.6 | §3, §5, `server/auth`, `server/authz` |
| F2.1–F2.8 | §4 CRM, §8 pages |
| F3.1–F3.9 | §6 |
| F4.1–F4.3 | `AuditLog`, `audit.ts`, DB trigger |
| F5.1–F5.5 | §9 |
| I1–I5 | §7 |
| Q1–Q14 | §10 |
