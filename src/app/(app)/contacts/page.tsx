"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Plus, Search, Download, Bookmark, SlidersHorizontal, X, Users, Ban } from "lucide-react";
import { useApi, api, useAction, refresh, qs, timeAgo } from "@/lib/client";
import { PageHeader, Button, Card, Input, Select, Field, Modal, Skeleton, EmptyState, ErrorState, Pagination, Avatar, Badge, cx } from "@/components/ui";
import { CustomFieldDef, CustomFieldInput } from "@/components/crm";
import { useMe } from "@/components/me";

type Contact = {
  id: string; name: string; email: string | null; phone: string | null; tags: string[]; createdAt: string; optedOut: boolean;
  company: { id: string; name: string } | null; owner: { id: string; name: string } | null; _count: { opportunities: number };
};
type Filters = { q?: string; tag?: string; ownerId?: string; stageId?: string; createdAfter?: string; createdBefore?: string; fieldKey?: string; fieldValue?: string; optedOut?: string };
type SavedList = { id: string; name: string; filters: Filters };
type Pipeline = { id: string; name: string; stages: { id: string; name: string }[] };

const EMPTY: Filters = {};

export default function ContactsPage() {
  const me = useMe();
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [panel, setPanel] = useState(false);
  const [activeList, setActiveList] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);

  // debounce search so typing never freezes the list
  useEffect(() => {
    const t = setTimeout(() => { setFilters((f) => ({ ...f, q: q || undefined })); setPage(1); }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const query = qs({ ...filters, page });
  const { data, error, mutate, isLoading, isValidating } = useApi<{ total: number; page: number; pageSize: number; rows: Contact[] }>(`/api/contacts${query}`, { live: 10000 });
  const { data: lists, mutate: mutateLists } = useApi<SavedList[]>("/api/saved-lists");
  const { data: users } = useApi<{ id: string; name: string }[]>("/api/users");
  const { data: pipelines } = useApi<Pipeline[]>("/api/pipelines");
  const { data: fields } = useApi<(CustomFieldDef & { entity: string })[]>("/api/fields?entity=CONTACT");
  const { run } = useAction();

  const activeCount = Object.entries(filters).filter(([k, v]) => v && k !== "q").length;
  const setF = (k: keyof Filters, v: string) => { setFilters({ ...filters, [k]: v || undefined }); setPage(1); setActiveList(null); };
  const applyList = (l: SavedList | null) => {
    setActiveList(l?.id ?? null);
    setFilters(l?.filters ?? EMPTY);
    setQ(l?.filters.q ?? "");
    setPage(1);
  };
  const exportUrl = `/api/contacts/export${qs({ ...filters })}`;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Contacts"
        description="Everyone you do business with, with their full history."
        actions={
          <>
            {me.can("crm.export") && <a href={exportUrl} className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3.5 text-sm font-medium shadow-soft hover:bg-surface-2"><Download className="size-4" />Export CSV</a>}
            {me.can("crm.create") && <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>New contact</Button>}
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button onClick={() => applyList(null)} className={cx("rounded-full border px-3 py-1 text-[13px] transition-colors", !activeList ? "border-accent/30 bg-accent/10 text-accent font-medium" : "border-line text-muted hover:text-fg")}>All contacts</button>
        {lists?.map((l) => (
          <span key={l.id} className={cx("group inline-flex items-center rounded-full border text-[13px] transition-colors", activeList === l.id ? "border-accent/30 bg-accent/10 text-accent font-medium" : "border-line text-muted hover:text-fg")}>
            <button onClick={() => applyList(l)} className="flex items-center gap-1.5 py-1 pl-3 pr-1.5"><Bookmark className="size-3" />{l.name}</button>
            <button aria-label={`Delete list ${l.name}`} className="mr-1 rounded-full p-0.5 opacity-50 hover:opacity-100 hover:bg-surface-2" onClick={() => run(() => api(`/api/saved-lists/${l.id}`, { method: "DELETE" }), { success: "List deleted" }).then(() => { mutateLists(); if (activeList === l.id) applyList(null); }).catch(() => null)}>
              <X className="size-3" />
            </button>
          </span>
        ))}
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <Input aria-label="Search contacts" placeholder="Search name, email, phone or company" value={q} onChange={(e) => { setQ(e.target.value); setActiveList(null); }} className="pl-9" />
        </div>
        <div className="flex gap-2">
          <Button icon={<SlidersHorizontal className="size-4" />} onClick={() => setPanel(!panel)} aria-expanded={panel}>
            Filters{activeCount > 0 && <span className="rounded-full bg-accent px-1.5 text-[11px] text-accent-fg tabular">{activeCount}</span>}
          </Button>
          <Button icon={<Bookmark className="size-4" />} onClick={() => setSaving(true)} disabled={!activeCount && !filters.q}>Save list</Button>
        </div>
      </div>

      {panel && (
        <Card className="mb-4 animate-pop">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Tag"><Input value={filters.tag ?? ""} onChange={(e) => setF("tag", e.target.value.trim())} placeholder="e.g. hot" /></Field>
            <Field label="Owner">
              <Select value={filters.ownerId ?? ""} onChange={(e) => setF("ownerId", e.target.value)}>
                <option value="">Anyone</option>
                <option value="me">Me</option>
                <option value="none">Unassigned</option>
                {users?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
            </Field>
            <Field label="Has opportunity in stage">
              <Select value={filters.stageId ?? ""} onChange={(e) => setF("stageId", e.target.value)}>
                <option value="">Any stage</option>
                {pipelines?.map((p) => <optgroup key={p.id} label={p.name}>{p.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>)}
              </Select>
            </Field>
            <Field label="Messaging">
              <Select value={filters.optedOut ?? ""} onChange={(e) => setF("optedOut", e.target.value)}>
                <option value="">Any</option>
                <option value="false">Can be messaged</option>
                <option value="true">Opted out</option>
              </Select>
            </Field>
            <Field label="Created after"><Input type="date" value={filters.createdAfter ?? ""} onChange={(e) => setF("createdAfter", e.target.value)} /></Field>
            <Field label="Created before"><Input type="date" value={filters.createdBefore ?? ""} onChange={(e) => setF("createdBefore", e.target.value)} /></Field>
            <Field label="Custom field">
              <Select value={filters.fieldKey ?? ""} onChange={(e) => setFilters({ ...filters, fieldKey: e.target.value || undefined, fieldValue: undefined })}>
                <option value="">None</option>
                {fields?.map((f) => <option key={f.id} value={f.key}>{f.name}</option>)}
              </Select>
            </Field>
            {filters.fieldKey && fields && (() => {
              const f = fields.find((x) => x.key === filters.fieldKey);
              if (!f) return null;
              return <CustomFieldInput field={{ ...f, name: `${f.name} is` }} value={f.type === "CHECKBOX" ? filters.fieldValue === "true" : filters.fieldValue} onChange={(v) => setF("fieldValue", v === null || v === undefined ? "" : String(v))} />;
            })()}
          </div>
          <div className="mt-4 flex justify-between gap-2 border-t border-line pt-4">
            <p className="text-xs text-muted self-center">Combine any criteria. Saved lists re-run these filters every time, so they stay up to date.</p>
            <Button size="sm" variant="ghost" onClick={() => { setFilters(EMPTY); setQ(""); setActiveList(null); }}>Clear all</Button>
          </div>
        </Card>
      )}

      {error && <ErrorState error={error} onRetry={() => mutate()} />}
      <Card padded={false} className="overflow-hidden">
        <div className="hidden md:grid grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)_90px] gap-4 border-b border-line bg-surface-2/50 px-5 py-2.5 text-xs font-medium text-muted">
          <span>Name</span><span>Company</span><span>Owner</span><span>Tags</span><span className="text-right">Added</span>
        </div>
        {isLoading && !data && <div className="p-5 space-y-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-11" />)}</div>}
        {data && !data.rows.length && <EmptyState icon={<Users className="size-5" />} title="No contacts match" description="Try removing a filter, or add a new contact." />}
        <ul className={cx("divide-y divide-line transition-opacity", isValidating && data && "opacity-80")}>
          {data?.rows.map((c) => (
            <li key={c.id}>
              <Link href={`/contacts/${c.id}`} className="grid gap-2 px-5 py-3 transition-colors hover:bg-surface-2/50 md:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)_90px] md:items-center md:gap-4">
                <span className="flex min-w-0 items-center gap-3">
                  <Avatar name={c.name} />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 truncate text-sm font-medium">{c.name}{c.optedOut && <Ban className="size-3 text-danger" aria-label="Opted out" />}</span>
                    <span className="block truncate text-xs text-muted">{c.email ?? c.phone ?? "—"}</span>
                  </span>
                </span>
                <span className="truncate text-[13px] text-muted">{c.company?.name ?? "—"}</span>
                <span className="truncate text-[13px]">{c.owner?.name ?? <span className="text-subtle">Unassigned</span>}</span>
                <span className="flex flex-wrap gap-1">{c.tags.slice(0, 3).map((t) => <Badge key={t} tone={t === "hot" ? "danger" : "neutral"}>{t}</Badge>)}</span>
                <span className="text-xs text-subtle md:text-right">{timeAgo(c.createdAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
      </Card>

      <SaveListModal open={saving} onClose={() => setSaving(false)} filters={filters} onSaved={(id) => { mutateLists(); setActiveList(id); }} />
      <NewContactModal open={creating} onClose={() => setCreating(false)} fields={fields ?? []} />
    </div>
  );
}

function SaveListModal({ open, onClose, filters, onSaved }: { open: boolean; onClose: () => void; filters: Filters; onSaved: (id: string) => void }) {
  const [name, setName] = useState("");
  const { pending, run } = useAction();
  const clean = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
  return (
    <Modal open={open} onClose={onClose} size="sm" title="Save as list" description="The list keeps these filters and updates automatically as contacts start or stop matching."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={pending} disabled={!name.trim()} onClick={() => run(() => api<{ id: string }>("/api/saved-lists", { body: { name, filters: clean } }), { success: "List saved" }).then((r) => { if (r) onSaved(r.id); setName(""); onClose(); }).catch(() => null)}>Save list</Button></>}>
      <Field label="List name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Hot homeowners in Lahore" /></Field>
      <div className="mt-3 flex flex-wrap gap-1.5">{Object.entries(clean).map(([k, v]) => <Badge key={k}>{k}: {String(v)}</Badge>)}</div>
    </Modal>
  );
}

function NewContactModal({ open, onClose, fields }: { open: boolean; onClose: () => void; fields: CustomFieldDef[] }) {
  const router = useRouter();
  const [f, setF] = useState({ name: "", email: "", phone: "", tags: "" });
  const [custom, setCustom] = useState<Record<string, unknown>>({});
  const { pending, run } = useAction();
  const submit = () =>
    run(() => api<{ id: string }>("/api/contacts", { body: { ...f, tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean), customValues: custom } }), { success: "Contact created" })
      .then((r) => { refresh("/api/contacts"); onClose(); setF({ name: "", email: "", phone: "", tags: "" }); setCustom({}); if (r) router.push(`/contacts/${r.id}`); })
      .catch(() => null);
  return (
    <Modal open={open} onClose={onClose} title="New contact" size="lg"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={pending} onClick={submit}>Create contact</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required className="sm:col-span-2"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Email"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Phone" hint="International format, e.g. +923001234567"><Input type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Tags" hint="Comma separated" className="sm:col-span-2"><Input value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} placeholder="homeowner, hot" /></Field>
        {fields.map((fd) => <CustomFieldInput key={fd.id} field={fd} value={custom[fd.key]} onChange={(v) => setCustom({ ...custom, [fd.key]: v })} />)}
      </div>
    </Modal>
  );
}
