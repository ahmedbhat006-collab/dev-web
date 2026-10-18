# Dastak: every lead, owned

A multi-tenant CRM for service businesses. Every inbound lead gets one accountable owner, a live acknowledgement timer, and automatic escalation. It connects to WhatsApp, Stripe, Google Calendar and email. All of them are free or test-mode services.

Stack: Next.js 15 (App Router, TypeScript) · PostgreSQL (Neon) + Prisma · Tailwind CSS v4 · light/dark theme.

## Quick start

```bash
npm install
cp .env.example .env        # then fill in DATABASE_URL (Neon, non-pooled) and JWT_SECRET
npm run setup               # creates tables, installs the audit-log trigger, loads demo data
npm run dev                 # http://localhost:3000
```

Demo accounts (password `demo1234`):

| Email | Role |
|---|---|
| owner@demo.test | Owner (all permissions) |
| admin@demo.test | Admin, the backup in the escalation chain |
| manager@demo.test | "Manager" role, the final escalation level |
| ali@demo.test, bilal@demo.test, hina@demo.test | Sales, who receive leads |

Public lead form: `http://localhost:3000/f/sunrise-solar`

Demo timers: 30s to acknowledge, then the lead escalates to the next available employee, then the backup, then the manager. Change these in **Settings → Lead rules**.

## Presentation day

```bash
npm run tunnel   # terminal 1: prints https://<random>.trycloudflare.com (free, no account)
# put that URL in .env as APP_URL, and update the WhatsApp / Stripe webhook URLs + Google redirect URI if it changed
npm run demo     # terminal 2: optimized production build + start (fast tab switching)
```

Use `npm run dev` only while editing code; it compiles each page on first visit and feels slow.

## Webhooks need a public URL

Run `ngrok http 3000` (or deploy), set `APP_URL` in `.env` to that https URL, and restart. Webhook URLs for your workspace are listed on **Settings → Integrations**.

## Integrations (all free)

Each workspace connects its own keys in **Settings → Integrations**. Keys are checked against the provider, encrypted (AES-256-GCM), and never sent back to the browser.

### WhatsApp: Meta WhatsApp Cloud API (replaces Twilio)
1. Go to developers.facebook.com, choose **My Apps → Create app → Business**, then add the **WhatsApp** product.
2. Open **WhatsApp → API Setup**. Copy the **Phone number ID** and the **temporary access token**. Under "To", add and verify your own phone number (up to 5 recipients).
3. Open **App settings → Basic** and copy the **App secret**.
4. In Dastak, connect WhatsApp with those values plus a verify token of your choice.
5. Open **WhatsApp → Configuration → Webhook**. Paste the webhook URL from Dastak and the same verify token, then subscribe to **messages**.
6. Send a WhatsApp message from your phone to the test number. A contact and a lead appear in Dastak.

Limits: the test number only reaches verified recipients. Free-form replies only work within 24h of the customer's last message. Temporary tokens expire after 24h (create a System User token for a permanent one).

### Stripe (test mode)
1. Go to dashboard.stripe.com, switch to **Test mode**, and copy the **Secret key** (`sk_test_…`) from **Developers → API keys**.
2. Open **Developers → Webhooks → Add endpoint**. Use the URL from Dastak and select these events: `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `payment_intent.payment_failed`, `charge.refunded`. Copy the signing secret (`whsec_…`).
3. Connect Stripe in Dastak. Pay with test card `4242 4242 4242 4242`.

### Google Calendar (OAuth 2.0)
1. In console.cloud.google.com, create a project and enable the **Google Calendar API**.
2. Set up the **OAuth consent screen**: External, Testing. Add every employee's Gmail as a **test user**.
3. Open **Credentials → Create OAuth client → Web**, and set the redirect URI to the one shown on Dastak's Integrations page (`APP_URL/api/integrations/google/callback`).
4. Put `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env` and restart.
5. Each employee connects their own calendar in **Settings → Profile**.

### Resend (escalation emails)
1. Sign up at resend.com and create an API key (`re_…`).
2. Connect Resend in Dastak. Without a verified domain, Resend only delivers to your own Resend account email, so set that as your alert email in **Settings → Profile**.

### AI chat assistant (Google Gemini, free tier)
1. Create a key at aistudio.google.com → **Get API key**, put it in `.env` as `GEMINI_API_KEY`, restart.
2. The "Chat with us · 24/7" bubble appears on the public form (`/f/<slug>`). It answers from the company info you write in **Settings → Integrations → AI chat assistant**, and when a visitor leaves a name + phone/email it creates a lead (source "AI chat") that goes through normal assignment and escalation.
3. Default model is `gemini-flash-lite-latest` (fast, free); override with `GEMINI_MODEL`.

## How it's built

- `src/server/services`: business rules (lead engine, CRM, metrics, appointments, messaging)
- `src/server/integrations`: provider adapters (WhatsApp, Stripe, Google, Resend)
- `src/server/jobs`: background worker. Every 2s it runs the escalation sweep and retries outbound sends. It's started from `instrumentation.ts`, and it survives restarts because all deadlines live in the database.
- `src/app/api`: thin route handlers. Every handler checks the session, the workspace and the permission on the server.
- `src/app/(app)`: UI pages. They poll every 3–5s, so new leads, escalations and messages appear without a manual page refresh.

Key guarantees:
- **One owner, no double escalation**: row locks (`FOR UPDATE SKIP LOCKED`) plus a version check on each lead.
- **Idempotent webhooks**: provider event and message IDs are unique in `IntegrationEvent`, so a replayed webhook is recorded as a duplicate and changes nothing.
- **Tamper-proof audit**: a Postgres trigger rejects any UPDATE or DELETE on `AuditLog`.
- **Workspace isolation**: every query is scoped by `workspaceId`, and IDs from another workspace return 404.
