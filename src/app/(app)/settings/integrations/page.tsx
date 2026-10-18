"use client";

import { Fragment, useState } from "react";
import { toast } from "sonner";
import { MessageCircle, CreditCard, Mail, CalendarDays, Copy, Check, X, RotateCw, Unplug, TriangleAlert, History } from "lucide-react";
import { useApi, api, useAction, timeAgo, qs } from "@/lib/client";
import { Card, Button, Badge, Field, Input, Modal, Skeleton, Segmented, Pagination, Tone, cx } from "@/components/ui";
import { PROVIDER_LABEL } from "@/lib/labels";
import { AssistantSettings } from "@/components/assistant-settings";

type FieldDef = { key: string; label: string; secret: boolean; placeholder?: string; help?: string };
type Ev = { id: string; provider: string; direction: string; type: string; result: string; summary: string | null; error: string | null; createdAt: string; externalId?: string | null };
type Prov = { provider: string; status: string; lastOkAt: string | null; lastError: string | null; lastErrorAt: string | null; hints: Record<string, string>; fields: FieldDef[]; can: string[]; cannot: string[]; webhookUrl: string | null; recentErrors: Ev[] };
type Data = {
  providers: Prov[];
  google: { configured: boolean; status: string; redirectUri: string; lastOkAt: string | null; can: string[]; cannot: string[]; users: { id: string; name: string; status: string; email: string | null; lastError: string | null }[]; recentErrors: Ev[] };
  failedJobs: { id: string; kind: string; status: string; attempts: number; lastError: string | null; updatedAt: string; payload: { to?: string; subject?: string } }[];
};

const ICON: Record<string, typeof Mail> = { WHATSAPP: MessageCircle, STRIPE: CreditCard, RESEND: Mail, GOOGLE: CalendarDays };
const STATUS: Record<string, { tone: Tone; label: string }> = { CONNECTED: { tone: "success", label: "Connected" }, ERROR: { tone: "danger", label: "Error" }, NOT_CONNECTED: { tone: "neutral", label: "Not connected" } };

export default function IntegrationsPage() {
  const { data, mutate } = useApi<Data>("/api/integrations", { live: 8000 });
  const [editing, setEditing] = useState<Prov | null>(null);
  const { run } = useAction();
  if (!data) return <div className="grid gap-4 md:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-lg" />)}</div>;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-2">
        {data.providers.map((p) => (
          <ProviderCard key={p.provider} name={PROVIDER_LABEL[p.provider]} provider={p.provider} status={p.status} lastOkAt={p.lastOkAt} lastError={p.lastError} can={p.can} cannot={p.cannot} errors={p.recentErrors}
            details={
              <>
                {Object.keys(p.hints).length > 0 && (
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                    {p.fields.map((f) => p.hints[f.key] && <Fragment key={f.key}><dt className="text-muted">{f.label}</dt><dd className="truncate font-mono">{p.hints[f.key]}</dd></Fragment>)}
                  </dl>
                )}
                {p.webhookUrl && <CopyRow label="Webhook URL" value={p.webhookUrl} />}
              </>
            }
            actions={
              <>
                <Button size="sm" variant={p.status === "NOT_CONNECTED" ? "primary" : "secondary"} onClick={() => setEditing(p)}>{p.status === "NOT_CONNECTED" ? "Connect" : "Update keys"}</Button>
                {p.status !== "NOT_CONNECTED" && <Button size="sm" variant="ghost" icon={<Unplug className="size-3.5" />} onClick={() => confirm(`Disconnect ${PROVIDER_LABEL[p.provider]}?`) && run(() => api(`/api/integrations/${p.provider.toLowerCase()}`, { method: "DELETE" }), { success: "Disconnected" }).then(() => mutate()).catch(() => null)}>Disconnect</Button>}
              </>
            }
          />
        ))}
        <ProviderCard name="Google Calendar" provider="GOOGLE" status={data.google.status} lastOkAt={data.google.lastOkAt} lastError={null} can={data.google.can} cannot={data.google.cannot} errors={data.google.recentErrors}
          details={
            <>
              {!data.google.configured && <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the server .env to enable connections.</p>}
              <CopyRow label="OAuth redirect URI" value={data.google.redirectUri} />
              <ul className="mt-1 flex flex-col gap-1.5">
                {data.google.users.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate">{u.name}{u.email && <span className="text-muted"> · {u.email}</span>}</span>
                    <Badge tone={u.status === "CONNECTED" ? "success" : u.status === "NEEDS_RECONNECT" ? "danger" : "neutral"}>{u.status === "CONNECTED" ? "Connected" : u.status === "NEEDS_RECONNECT" ? "Reconnect needed" : "Not connected"}</Badge>
                  </li>
                ))}
              </ul>
            </>
          }
          actions={<a href="/settings/profile" className="text-[13px] text-accent hover:underline">Connect your own calendar →</a>}
        />
      </div>

      {data.failedJobs.length > 0 && (
        <Card>
          <h2 className="mb-1 flex items-center gap-2 text-[15px] font-semibold"><TriangleAlert className="size-4 text-danger" />Failed deliveries</h2>
          <p className="mb-4 text-[13px] text-muted">Alerts and messages that couldn&apos;t be delivered. Temporary errors retry automatically (up to 3 attempts).</p>
          <ul className="divide-y divide-line">
            {data.failedJobs.map((j) => (
              <li key={j.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium">{j.kind === "SEND_EMAIL" ? `Email to ${j.payload.to}` : "WhatsApp message"} <Badge tone={j.status === "FAILED" ? "danger" : "warning"}>{j.status === "FAILED" ? `Failed after ${j.attempts} attempt(s)` : `Retrying (${j.attempts})`}</Badge></p>
                  <p className="truncate text-xs text-danger">{j.lastError}</p>
                </div>
                {j.status === "FAILED" && <Button size="sm" icon={<RotateCw className="size-3.5" />} onClick={() => run(() => api(`/api/integrations/jobs/${j.id}/retry`, { body: {} }), { success: "Retrying now" }).then(() => mutate()).catch(() => null)}>Retry</Button>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <AssistantSettings />
      <SyncHistory />
      {editing && <ConnectModal p={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); mutate(); }} />}
    </div>
  );
}

function ProviderCard({ name, provider, status, lastOkAt, lastError, can, cannot, errors, details, actions }: {
  name: string; provider: string; status: string; lastOkAt: string | null; lastError: string | null; can: string[]; cannot: string[]; errors: Ev[]; details: React.ReactNode; actions: React.ReactNode;
}) {
  const I = ICON[provider];
  const s = STATUS[status] ?? STATUS.NOT_CONNECTED;
  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg border border-line bg-surface-2"><I className="size-5 text-fg" /></span>
          <div>
            <p className="text-[15px] font-semibold">{name}</p>
            <p className="text-xs text-muted">{lastOkAt ? `Last worked ${timeAgo(lastOkAt)}` : "Never used"}</p>
          </div>
        </div>
        <Badge tone={s.tone} dot>{s.label}</Badge>
      </div>
      {lastError && status === "ERROR" && <p className="mt-3 rounded-lg bg-danger/8 px-3 py-2 text-xs text-danger">{lastError}</p>}
      <div className="mt-4 flex flex-col gap-2">{details}</div>
      <div className="mt-4 grid gap-3 border-t border-line pt-4 text-xs sm:grid-cols-2">
        <div><p className="mb-1.5 font-semibold text-muted">Can</p><ul className="space-y-1">{can.map((c) => <li key={c} className="flex gap-1.5"><Check className="size-3.5 shrink-0 text-success" />{c}</li>)}</ul></div>
        <div><p className="mb-1.5 font-semibold text-muted">Limits</p><ul className="space-y-1">{cannot.map((c) => <li key={c} className="flex gap-1.5 text-muted"><X className="size-3.5 shrink-0" />{c}</li>)}</ul></div>
      </div>
      {errors.length > 0 && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-danger">{errors.length} recent error(s)</summary>
          <ul className="mt-2 space-y-1.5">{errors.map((e) => <li key={e.id} className="text-muted"><span className="text-subtle">{timeAgo(e.createdAt)}</span> · {e.type}: <span className="text-danger">{e.error}</span></li>)}</ul>
        </details>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">{actions}</div>
    </Card>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1 text-xs text-muted">{label}</p>
      <div className="flex items-center gap-1 rounded-lg border border-line bg-surface-2/60 pl-2.5">
        <code className="flex-1 truncate py-1.5 text-[11.5px]">{value}</code>
        <button onClick={() => { navigator.clipboard.writeText(value); toast.success("Copied"); }} className="rounded-md p-1.5 text-muted hover:text-fg" aria-label={`Copy ${label}`}><Copy className="size-3.5" /></button>
      </div>
    </div>
  );
}

function ConnectModal({ p, onClose, onDone }: { p: Prov; onClose: () => void; onDone: () => void }) {
  const [creds, setCreds] = useState<Record<string, string>>({});
  const { pending, run } = useAction();
  const connected = p.status !== "NOT_CONNECTED";
  return (
    <Modal open onClose={onClose} title={`${connected ? "Update" : "Connect"} ${PROVIDER_LABEL[p.provider]}`} description="Keys are checked against the provider, encrypted, and never sent back to the browser."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={pending} onClick={() => run(() => api<{ detail: string }>(`/api/integrations/${p.provider.toLowerCase()}`, { method: "PUT", body: { creds } })).then((r) => { toast.success(`${PROVIDER_LABEL[p.provider]} connected`, { description: r?.detail }); onDone(); }).catch(() => null)}>{pending ? "Checking…" : "Save & test"}</Button></>}>
      <div className="flex flex-col gap-4">
        {p.fields.map((f) => (
          <Field key={f.key} label={f.label} hint={f.help}>
            <Input type={f.secret ? "password" : "text"} autoComplete="off" value={creds[f.key] ?? ""} onChange={(e) => setCreds({ ...creds, [f.key]: e.target.value })} placeholder={connected && p.hints[f.key] ? `${p.hints[f.key]} (leave empty to keep)` : f.placeholder} className="font-mono" />
          </Field>
        ))}
        {p.webhookUrl && <CopyRow label="Paste this webhook URL in the provider dashboard" value={p.webhookUrl} />}
      </div>
    </Modal>
  );
}

function SyncHistory() {
  const [provider, setProvider] = useState("");
  const [page, setPage] = useState(1);
  const { data } = useApi<{ rows: Ev[]; total: number; page: number; pageSize: number }>(`/api/integrations/events${qs({ provider, page })}`, { live: 5000 });
  const tone: Record<string, Tone> = { OK: "success", ERROR: "danger", REJECTED: "danger", DUPLICATE: "warning" };
  return (
    <Card padded={false}>
      <div className="flex flex-col gap-3 border-b border-line p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold"><History className="size-4" />Sync history</h2>
          <p className="text-[13px] text-muted">Every inbound webhook and outbound call, including rejected and duplicate ones.</p>
        </div>
        <Segmented label="Provider" value={provider} onChange={(v) => { setProvider(v); setPage(1); }} options={[{ value: "", label: "All" }, { value: "WHATSAPP", label: "WhatsApp" }, { value: "STRIPE", label: "Stripe" }, { value: "GOOGLE", label: "Google" }, { value: "RESEND", label: "Email" }]} />
      </div>
      {!data && <div className="p-5"><Skeleton className="h-32" /></div>}
      {data && !data.rows.length && <p className="p-8 text-center text-[13px] text-muted">No events yet.</p>}
      <ul className="divide-y divide-line">
        {data?.rows.map((e) => (
          <li key={e.id} className="grid gap-1 px-5 py-2.5 text-[13px] md:grid-cols-[90px_80px_minmax(0,1fr)_100px_110px] md:items-center md:gap-3">
            <span className="text-xs text-muted">{PROVIDER_LABEL[e.provider]?.split(" ")[0]}</span>
            <span className={cx("text-xs font-medium", e.direction === "IN" ? "text-info" : "text-accent")}>{e.direction === "IN" ? "← Inbound" : "→ Outbound"}</span>
            <span className="min-w-0 truncate"><span className="font-mono text-xs">{e.type}</span>{(e.summary || e.error) && <span className={cx("ml-2 text-xs", e.error ? "text-danger" : "text-muted")}>{e.error ?? e.summary}</span>}</span>
            <span><Badge tone={tone[e.result]}>{e.result.toLowerCase()}</Badge></span>
            <span className="text-xs text-subtle md:text-right">{timeAgo(e.createdAt)}</span>
          </li>
        ))}
      </ul>
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
    </Card>
  );
}
