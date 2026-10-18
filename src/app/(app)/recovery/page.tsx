"use client";

import Link from "next/link";
import { LifeBuoy, ShieldCheck } from "lucide-react";
import { useApi, timeAgo, fmtDuration } from "@/lib/client";
import { PageHeader, Card, Badge, Avatar, Skeleton, EmptyState, ErrorState, Dot } from "@/components/ui";
import { SourceBadge } from "@/components/crm";
import { STATUS_TONE } from "@/components/shell";
import { STATUS_LABEL } from "@/lib/labels";

type Row = {
  id: string; source: string; createdAt: string; escalationCount: number; reasons: string[];
  contact: { id: string; name: string }; assignee: { id: string; name: string; status: string } | null;
};

export default function RecoveryPage() {
  const { data, error, mutate } = useApi<{ rows: Row[]; idleSec: number; scope: string }>("/api/leads/recovery", { live: 3000 });
  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Recovery queue"
        description={`Leads that are overdue, escalated two or more times, idle for ${data ? fmtDuration(data.idleSec) : "…"}, or whose owner is away. Updates live.`}
      />
      {error && <ErrorState error={error} onRetry={() => mutate()} />}
      <Card padded={false} className="overflow-hidden">
        {!data && !error && <div className="p-5 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>}
        {data && !data.rows.length && (
          <EmptyState icon={<ShieldCheck className="size-5 text-success" />} title="Nothing is slipping through" description="Every lead currently has an owner who is on it." />
        )}
        <ul className="divide-y divide-line">
          {data?.rows.map((l) => (
            <li key={l.id}>
              <Link href={`/leads/${l.id}`} className="grid gap-3 px-5 py-4 hover:bg-surface-2/50 transition-colors md:grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)_minmax(0,1fr)] md:items-center">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-danger/10 text-danger"><LifeBuoy className="size-4" /></span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{l.contact.name}</p>
                    <p className="text-xs text-muted flex items-center gap-1.5"><SourceBadge source={l.source} /> {timeAgo(l.createdAt)}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {l.reasons.map((r) => <Badge key={r} tone={r.includes("away") ? "info" : r.includes("Escalated") ? "warning" : "danger"}>{r}</Badge>)}
                </div>
                <div className="flex items-center gap-2 text-[13px] md:justify-end min-w-0">
                  {l.assignee ? (
                    <>
                      <Avatar name={l.assignee.name} size="sm" />
                      <span className="truncate">{l.assignee.name}</span>
                      <span className="flex items-center gap-1 text-xs text-muted"><Dot tone={STATUS_TONE[l.assignee.status]} />{STATUS_LABEL[l.assignee.status]}</span>
                    </>
                  ) : <span className="text-danger">No owner</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
