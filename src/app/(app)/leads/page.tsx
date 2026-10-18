"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Plus, Zap, Search, Check, Shuffle, Info } from "lucide-react";
import { useApi, api, useAction, refresh, qs, timeAgo } from "@/lib/client";
import { PageHeader, Button, Segmented, Card, Input, Select, Skeleton, EmptyState, ErrorState, Pagination, Avatar, Modal, Field, Textarea, cx } from "@/components/ui";
import { LeadStatus, SourceBadge, useSkew } from "@/components/crm";
import { useMe } from "@/components/me";

type Lead = {
  id: string; source: string; status: string; title: string | null; acknowledgedAt: string | null; ackDeadline: string | null; exhausted: boolean;
  escalationCount: number; createdAt: string; ownerAway: boolean;
  contact: { id: string; name: string; phone: string | null; email: string | null }; assignee: { id: string; name: string } | null;
};
type Resp = { total: number; page: number; pageSize: number; rows: Lead[]; serverNow: string };

export default function LeadsPage() {
  return <Suspense><Leads /></Suspense>;
}

function Leads() {
  const me = useMe();
  const sp = useSearchParams();
  const router = useRouter();
  const [scope, setScope] = useState<"mine" | "all">(me.seesAll ? "all" : "mine");
  const [status, setStatus] = useState("active");
  const [source, setSource] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const created = sp.get("created") ?? "";
  useEffect(() => {
    if (sp.get("new") === "1") { setCreating(true); router.replace("/leads"); }
  }, [sp, router]);
  const url = `/api/leads${qs({ scope, status, source, q, page, created })}`;
  const { data, error, mutate, isLoading } = useApi<Resp>(url, { live: 3000 });
  const skew = useSkew(data?.serverNow);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Leads"
        description="Every lead has one accountable owner. Unacknowledged leads escalate automatically when their timer runs out."
        actions={me.can("crm.create") && <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>New lead</Button>}
      />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {me.seesAll && <Segmented label="Scope" value={scope} onChange={(v) => { setScope(v); setPage(1); }} options={[{ value: "all", label: "All leads" }, { value: "mine", label: "My leads" }]} />}
          <Segmented label="Status" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[{ value: "active", label: "Active" }, { value: "open", label: "Waiting" }, { value: "acknowledged", label: "Acknowledged" }, { value: "closed", label: "Closed" }]} />
          {created === "today" && <button onClick={() => router.replace("/leads")} className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-xs text-accent">Created today ✕</button>}
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1 lg:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
            <Input aria-label="Search leads" placeholder="Search by name" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="pl-9" />
          </div>
          <Select aria-label="Source" value={source} onChange={(e) => { setSource(e.target.value); setPage(1); }} className="w-36">
            <option value="">All sources</option>
            <option value="WEB_FORM">Web form</option>
            <option value="WHATSAPP">WhatsApp</option>
            <option value="MANUAL">Manual</option>
            <option value="CHATBOT">AI chat</option>
          </Select>
        </div>
      </div>

      {error && <ErrorState error={error} onRetry={() => mutate()} />}
      <Card padded={false} className="overflow-hidden">
        <div className="hidden md:grid grid-cols-[minmax(0,2fr)_120px_minmax(0,1.2fr)_170px_150px] gap-4 border-b border-line bg-surface-2/50 px-5 py-2.5 text-xs font-medium text-muted">
          <span>Lead</span><span>Source</span><span>Owner</span><span>Status</span><span className="text-right">Action</span>
        </div>
        {isLoading && !data && <div className="p-5 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>}
        {data && !data.rows.length && (
          <EmptyState icon={<Zap className="size-5" />} title="No leads here" description={scope === "mine" ? "New leads assigned to you will appear instantly." : "Leads from the web form, WhatsApp and manual entry show up here."} />
        )}
        <ul className="divide-y divide-line">
          {data?.rows.map((l) => <LeadRow key={l.id} lead={l} skew={skew} onChanged={() => mutate()} />)}
        </ul>
        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
      </Card>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-subtle"><Info className="size-3.5" />Any recorded action (note, message, call log, stage change or appointment) also counts as acknowledgement.</p>
      <NewLeadModal open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function LeadRow({ lead: l, skew, onChanged }: { lead: Lead; skew: number; onChanged: () => void }) {
  const me = useMe();
  const { pending, run } = useAction();
  const mine = l.assignee?.id === me.id;
  const ack = () => run(() => api(`/api/leads/${l.id}/ack`, { body: {} }), { success: `Acknowledged ${l.contact.name}` }).then(() => { onChanged(); refresh("/api/notifications"); }).catch(() => onChanged());
  return (
    <li className={cx("flex flex-col gap-2.5 px-4 py-3.5 sm:px-5 md:grid md:grid-cols-[minmax(0,2fr)_120px_minmax(0,1.2fr)_170px_150px] md:items-center md:gap-4 transition-colors hover:bg-surface-2/40", mine && !l.acknowledgedAt && l.status === "OPEN" && "bg-accent/[0.04]")}>
      <div className="min-w-0 flex items-center gap-3">
        <Avatar name={l.contact.name} />
        <div className="min-w-0">
          <Link href={`/leads/${l.id}`} className="block truncate text-sm font-medium hover:underline">{l.contact.name}</Link>
          <p className="truncate text-xs text-muted">{l.title || l.contact.phone || l.contact.email} · {timeAgo(l.createdAt)}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pl-11 md:contents">
      <div><SourceBadge source={l.source} /></div>
      <div className="min-w-0 flex items-center gap-2 text-[13px]">
        {l.assignee ? <><Avatar name={l.assignee.name} size="sm" /><span className="truncate">{mine ? "You" : l.assignee.name}</span></> : <span className="text-muted">Unassigned</span>}
        {l.escalationCount > 0 && <span className="shrink-0 rounded-full bg-warning/10 px-1.5 text-[10.5px] font-medium text-warning" title="Times escalated">↑{l.escalationCount}</span>}
      </div>
      <div><LeadStatus lead={l} skew={skew} /></div>
      <div className="ml-auto flex gap-2 md:ml-0 md:justify-end">
        {mine && !l.acknowledgedAt && l.status === "OPEN" ? (
          <Button size="sm" variant="primary" icon={<Check className="size-3.5" />} loading={pending} onClick={ack}>Acknowledge</Button>
        ) : (
          <Link href={`/leads/${l.id}`} className="hidden md:inline-flex h-8 items-center rounded-md px-3 text-[13px] text-muted hover:bg-surface-2 hover:text-fg">Open</Link>
        )}
      </div>
      </div>
    </li>
  );
}

function NewLeadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [f, setF] = useState({ name: "", email: "", phone: "", companyName: "", message: "" });
  const { pending, run } = useAction();
  const router = useRouter();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const submit = async () => {
    const r = await run(() => api<{ id: string }>("/api/leads", { body: f }), { success: "Lead created and assigned" }).catch(() => null);
    if (r) {
      setF({ name: "", email: "", phone: "", companyName: "", message: "" });
      refresh("/api/");
      onClose();
      router.push(`/leads/${r.id}`);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="New lead" description="Manual entry. The lead is assigned round-robin to an available teammate."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={pending} onClick={submit} icon={<Shuffle className="size-4" />}>Create & assign</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required className="sm:col-span-2"><Input value={f.name} onChange={set("name")} /></Field>
        <Field label="Email"><Input type="email" value={f.email} onChange={set("email")} /></Field>
        <Field label="Phone" hint="e.g. +923001234567"><Input type="tel" value={f.phone} onChange={set("phone")} /></Field>
        <Field label="Company" className="sm:col-span-2"><Input value={f.companyName} onChange={set("companyName")} /></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea rows={3} value={f.message} onChange={set("message")} placeholder="What do they need?" /></Field>
      </div>
    </Modal>
  );
}
