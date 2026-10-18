"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ScrollText, Lock, ChevronDown } from "lucide-react";
import { useApi, qs, fmtDateTime } from "@/lib/client";
import { PageHeader, Card, Select, Input, Field, Skeleton, EmptyState, Pagination, ErrorState, Badge, Tone, cx } from "@/components/ui";

type Entry = { id: string; actorId: string | null; actorName: string; action: string; targetType: string; targetLabel: string | null; before: unknown; after: unknown; createdAt: string };

const tone = (a: string): Tone =>
  a.includes("ESCALAT") ? "warning" : a.includes("DELETE") || a.includes("DEACTIVATED") || a.includes("DISCONNECT") ? "danger" : a.includes("ACKNOWLEDGED") ? "success" : a.startsWith("LEAD") ? "accent" : a.includes("INTEGRATION") ? "info" : "neutral";

export default function AuditPage() {
  return <Suspense><Audit /></Suspense>;
}

function Audit() {
  const sp = useSearchParams();
  const [action, setAction] = useState(sp.get("action") ?? "");
  const [actorId, setActorId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const { data, error, mutate } = useApi<{ rows: Entry[]; total: number; page: number; pageSize: number; actions: string[] }>(`/api/audit${qs({ action, actorId, from, to, page })}`, { live: 5000 });
  const { data: users } = useApi<{ id: string; name: string }[]>("/api/users");

  return (
    <div className="animate-fade-in">
      <PageHeader title="Audit log" description={<span className="inline-flex items-center gap-1.5"><Lock className="size-3.5" />Append-only. Entries can't be edited or deleted by anyone, enforced in the database.</span>} />
      <Card className="mb-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Event type">
            <Select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}>
              <option value="">All events</option>
              {data?.actions.map((a) => <option key={a} value={a}>{a.replaceAll("_", " ").toLowerCase()}</option>)}
            </Select>
          </Field>
          <Field label="User">
            <Select value={actorId} onChange={(e) => { setActorId(e.target.value); setPage(1); }}>
              <option value="">Everyone</option>
              <option value="system">System (automatic)</option>
              {users?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </Field>
          <Field label="From"><Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} /></Field>
          <Field label="To"><Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} /></Field>
        </div>
      </Card>
      {error && <ErrorState error={error} onRetry={() => mutate()} />}
      <Card padded={false} className="overflow-hidden">
        {!data && !error && <div className="p-5 space-y-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>}
        {data && !data.rows.length && <EmptyState icon={<ScrollText className="size-5" />} title="No matching events" />}
        <ul className="divide-y divide-line">
          {data?.rows.map((e) => {
            const hasDiff = !!(e.before || e.after);
            const isOpen = open === e.id;
            return (
              <li key={e.id}>
                <button disabled={!hasDiff} onClick={() => setOpen(isOpen ? null : e.id)} aria-expanded={hasDiff ? isOpen : undefined} className={cx("grid w-full gap-2 px-5 py-3 text-left md:grid-cols-[170px_minmax(0,1.2fr)_minmax(0,1.5fr)_150px_20px] md:items-center md:gap-4", hasDiff && "hover:bg-surface-2/50")}>
                  <span><Badge tone={tone(e.action)}>{e.action.replaceAll("_", " ").toLowerCase()}</Badge></span>
                  <span className="truncate text-[13px]"><span className="text-muted">{e.targetType}</span> {e.targetLabel && <span className="font-medium">{e.targetLabel}</span>}</span>
                  <span className="truncate text-[13px] text-muted">by <span className={cx(e.actorId ? "text-fg" : "text-accent")}>{e.actorName}</span></span>
                  <time className="text-xs text-subtle md:text-right" dateTime={e.createdAt}>{fmtDateTime(e.createdAt)}</time>
                  {hasDiff ? <ChevronDown className={cx("size-4 text-subtle transition-transform hidden md:block", isOpen && "rotate-180")} /> : <span />}
                </button>
                {isOpen && (
                  <div className="grid gap-3 px-5 pb-4 sm:grid-cols-2 animate-fade-in">
                    {(["before", "after"] as const).map((k) => (
                      <div key={k} className="min-w-0 rounded-lg border border-line bg-surface-2/50 p-3">
                        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-subtle">{k}</p>
                        <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs text-fg">{e[k] ? JSON.stringify(e[k], null, 2) : "—"}</pre>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
      </Card>
    </div>
  );
}
