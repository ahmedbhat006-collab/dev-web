"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Check, Shuffle, ArrowUpRight, Phone, Mail, Building, CircleCheck, Archive, TriangleAlert } from "lucide-react";
import { useApi, api, useAction, refresh, fmtDuration, fmtDateTime } from "@/lib/client";
import { PageHeader, Button, Card, Badge, Avatar, Skeleton, ErrorState, Modal, Field, Select, Dot } from "@/components/ui";
import { LeadStatus, SourceBadge, Timeline, useSkew, ActivityRow, NoteComposer, Section } from "@/components/crm";
import { STATUS_TONE } from "@/components/shell";
import { STATUS_LABEL } from "@/lib/labels";
import { useMe } from "@/components/me";

type LeadDetail = {
  id: string; source: string; status: string; title: string | null; acknowledgedAt: string | null; ackDeadline: string | null; exhausted: boolean;
  firstAssignedAt: string | null; firstAckAt: string | null; escalationLevel: number; escalationCount: number; createdAt: string; ownerAway: boolean;
  contact: { id: string; name: string; phone: string | null; email: string | null; company: { name: string } | null };
  assignee: { id: string; name: string; status: string } | null;
  opportunity: { id: string; title: string; stage: { name: string } } | null;
  activities: ActivityRow[]; serverNow: string; reasons: string[]; totalLevels: number; canAck: boolean; canReassign: boolean;
};

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const { data: l, error, mutate } = useApi<LeadDetail>(`/api/leads/${id}`, { live: 2500 });
  const skew = useSkew(l?.serverNow);
  const { pending, run } = useAction();
  const [reassign, setReassign] = useState(false);

  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (!l) return <div className="space-y-4"><Skeleton className="h-16" /><Skeleton className="h-64" /></div>;

  const ack = () => run(() => api(`/api/leads/${id}/ack`, { body: {} }), { success: "Lead acknowledged" }).then(() => { mutate(); refresh("/api/notifications"); }).catch(() => mutate());
  const close = () => run(() => api(`/api/leads/${id}/close`, { body: {} }), { success: "Lead closed" }).then(() => mutate()).catch(() => null);
  const responded = l.firstAckAt && l.firstAssignedAt ? Math.round((new Date(l.firstAckAt).getTime() - new Date(l.firstAssignedAt).getTime()) / 1000) : null;

  return (
    <div className="animate-fade-in">
      <PageHeader
        back={{ href: "/leads", label: "Leads" }}
        title={<span className="flex items-center gap-3"><Avatar name={l.contact.name} size="lg" />{l.contact.name}</span>}
        description={<span className="flex flex-wrap items-center gap-2 mt-1"><SourceBadge source={l.source} /><LeadStatus lead={l} skew={skew} />{l.escalationCount > 0 && <Badge tone="warning">Escalated {l.escalationCount}×</Badge>}</span>}
        actions={
          <>
            {l.canAck && <Button variant="primary" size="lg" icon={<Check className="size-4" />} loading={pending} onClick={ack}>Acknowledge</Button>}
            {l.canReassign && <Button icon={<Shuffle className="size-4" />} onClick={() => setReassign(true)}>Reassign</Button>}
            {l.status !== "CLOSED" && (l.assignee?.id === me.id || l.canReassign) && <Button variant="ghost" icon={<Archive className="size-4" />} onClick={close}>Close</Button>}
          </>
        }
      />

      {l.reasons.length > 0 && l.status !== "CLOSED" && (
        <div role="status" className="mb-6 flex items-start gap-3 rounded-lg border border-danger/25 bg-danger/[0.06] p-4">
          <TriangleAlert className="size-5 shrink-0 text-danger" />
          <div>
            <p className="text-sm font-medium text-danger">In the recovery queue</p>
            <p className="text-[13px] text-muted mt-0.5">{l.reasons.join(" · ")}</p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-6">
          {l.title && (
            <Card>
              <p className="text-xs font-medium text-muted mb-1.5">Message</p>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{l.title}</p>
            </Card>
          )}
          <Section title="Log an action">
            <NoteComposer contactId={l.contact.id} onDone={() => mutate()} />
            <p className="mt-2 text-xs text-subtle">Notes and call logs by the owner count as acknowledgement.</p>
          </Section>
          <Section title="Lead history">
            <Timeline items={l.activities} />
          </Section>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <p className="text-xs font-medium text-muted mb-3">Accountable owner</p>
            {l.assignee ? (
              <div className="flex items-center gap-3">
                <Avatar name={l.assignee.name} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{l.assignee.id === me.id ? `${l.assignee.name} (you)` : l.assignee.name}</p>
                  <p className="text-xs text-muted flex items-center gap-1.5"><Dot tone={STATUS_TONE[l.assignee.status]} />{STATUS_LABEL[l.assignee.status]}</p>
                </div>
              </div>
            ) : <p className="text-sm text-muted">Unassigned</p>}
            {l.ownerAway && <p className="mt-3 rounded-lg bg-info/10 px-3 py-2 text-xs text-info">The owner is away. Acknowledged leads stay with them until a manager reassigns them.</p>}
            <dl className="mt-5 grid grid-cols-2 gap-y-3 text-[13px]">
              <dt className="text-muted">Escalation level</dt><dd className="text-right tabular">{l.escalationLevel} / {l.totalLevels}</dd>
              <dt className="text-muted">First assigned</dt><dd className="text-right">{l.firstAssignedAt ? fmtDateTime(l.firstAssignedAt) : "—"}</dd>
              <dt className="text-muted">First response</dt><dd className="text-right">{responded !== null ? <span className="inline-flex items-center gap-1 text-success"><CircleCheck className="size-3.5" />{fmtDuration(responded)}</span> : "—"}</dd>
              <dt className="text-muted">Created</dt><dd className="text-right">{fmtDateTime(l.createdAt)}</dd>
            </dl>
          </Card>
          <Card>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-muted">Contact</p>
              <Link href={`/contacts/${l.contact.id}`} className="inline-flex items-center gap-1 text-xs text-accent hover:underline">Full profile <ArrowUpRight className="size-3" /></Link>
            </div>
            <ul className="space-y-2.5 text-[13px]">
              {l.contact.phone && <li className="flex items-center gap-2.5"><Phone className="size-3.5 text-subtle" />{l.contact.phone}</li>}
              {l.contact.email && <li className="flex items-center gap-2.5 min-w-0"><Mail className="size-3.5 text-subtle shrink-0" /><span className="truncate">{l.contact.email}</span></li>}
              {l.contact.company && <li className="flex items-center gap-2.5"><Building className="size-3.5 text-subtle" />{l.contact.company.name}</li>}
            </ul>
            {l.opportunity && (
              <Link href={`/opportunities/${l.opportunity.id}`} className="mt-4 flex items-center justify-between rounded-lg border border-line px-3 py-2.5 hover:bg-surface-2 transition-colors">
                <span className="min-w-0"><span className="block text-[13px] font-medium truncate">{l.opportunity.title}</span><span className="text-xs text-muted">{l.opportunity.stage.name}</span></span>
                <ArrowUpRight className="size-4 text-subtle" />
              </Link>
            )}
          </Card>
        </div>
      </div>
      <ReassignModal open={reassign} onClose={() => setReassign(false)} leadId={l.id} currentId={l.assignee?.id} onDone={() => mutate()} />
    </div>
  );
}

function ReassignModal({ open, onClose, leadId, currentId, onDone }: { open: boolean; onClose: () => void; leadId: string; currentId?: string; onDone: () => void }) {
  const { data: users } = useApi<{ id: string; name: string; status: string; active: boolean; openLeads: number }[]>(open ? "/api/users" : null);
  const [uid, setUid] = useState("");
  const { pending, run } = useAction();
  return (
    <Modal open={open} onClose={onClose} title="Reassign lead" description="The new owner gets a fresh acknowledgement window. This is recorded as a manual reassignment, separate from escalations."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={pending} disabled={!uid} onClick={() => run(() => api(`/api/leads/${leadId}/reassign`, { body: { userId: uid } }), { success: "Lead reassigned" }).then(() => { onDone(); onClose(); }).catch(() => null)}>Reassign</Button></>}>
      <Field label="New owner">
        <Select value={uid} onChange={(e) => setUid(e.target.value)}>
          <option value="">Choose a teammate…</option>
          {users?.filter((u) => u.active && u.id !== currentId).map((u) => (
            <option key={u.id} value={u.id}>{u.name} · {STATUS_LABEL[u.status]} · {u.openLeads} open</option>
          ))}
        </Select>
      </Field>
    </Modal>
  );
}
