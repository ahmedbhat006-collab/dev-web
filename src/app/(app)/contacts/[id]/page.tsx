"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Phone, Mail, Building, CalendarPlus, Plus, Trash2, Ban, MessageCircle, Pencil, ArrowUpRight, Zap, EyeClosed } from "lucide-react";
import { useApi, api, useAction, refresh, timeAgo } from "@/lib/client";
import { PageHeader, Button, Card, Badge, Avatar, Skeleton, ErrorState, Modal, Field, Input, Select, Switch, Dot, EmptyState } from "@/components/ui";
import { Timeline, NoteComposer, CustomFieldsCard, PaymentList, AppointmentList, BookingModal, Thread, Section, LeadStatus, SourceBadge, ActivityRow, CustomFieldDef, PaymentRow, AppointmentRow } from "@/components/crm";
import { NewOpportunityModal } from "@/components/opportunity-modal";
import { STATUS_TONE } from "@/components/shell";
import { STATUS_LABEL } from "@/lib/labels";
import { fmtMoney } from "@/lib/money";
import { useMe } from "@/components/me";

type ContactFull = {
  id: string; name: string; email: string | null; phone: string | null; tags: string[]; optedOut: boolean; optOutReason: string | null; createdAt: string;
  customValues: Record<string, unknown>; companyId: string | null;
  company: { id: string; name: string } | null; owner: { id: string; name: string; status: string } | null;
  opportunities: { id: string; title: string; value: number | null; valueHidden: boolean; currency: string; stage: { name: string; kind: string }; pipeline: { name: string }; owner: { name: string } | null }[];
  payments: PaymentRow[]; appointments: AppointmentRow[];
  leads: { id: string; source: string; status: string; acknowledgedAt: string | null; ackDeadline: string | null; exhausted: boolean; createdAt: string; assignee: { name: string } | null }[];
  conversations: { id: string }[]; activities: ActivityRow[]; fields: CustomFieldDef[];
};

export default function ContactPage() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const router = useRouter();
  const { data: c, error, mutate } = useApi<ContactFull>(`/api/contacts/${id}`, { live: 4000 });
  const [booking, setBooking] = useState(false);
  const [newOpp, setNewOpp] = useState(false);
  const [editing, setEditing] = useState(false);
  const [convId, setConvId] = useState<string | null>(null);
  const { run, pending } = useAction();

  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (!c) return <div className="space-y-4"><Skeleton className="h-20" /><div className="grid gap-6 lg:grid-cols-[1fr_380px]"><Skeleton className="h-96" /><Skeleton className="h-96" /></div></div>;

  const conversationId = convId ?? c.conversations[0]?.id;
  const startChat = () => run(() => api<{ id: string }>(`/api/contacts/${id}/conversation`, { body: {} })).then((r) => r && setConvId(r.id)).catch(() => null);
  const saveFields = (customValues: Record<string, unknown>) => api(`/api/contacts/${id}`, { method: "PATCH", body: { customValues } }).then(() => mutate());
  const toggleOptOut = (v: boolean) => run(() => api(`/api/contacts/${id}`, { method: "PATCH", body: { optedOut: v, optOutReason: v ? "Marked by staff" : undefined } }), { success: v ? "Marked as opted out" : "Contact can be messaged again" }).then(() => mutate()).catch(() => null);
  const del = () => {
    if (!confirm(`Delete ${c.name}? Their opportunities, leads and conversations will also be removed. This is recorded in the audit log.`)) return;
    run(() => api(`/api/contacts/${id}`, { method: "DELETE" }), { success: "Contact deleted" }).then(() => router.push("/contacts")).catch(() => null);
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        back={{ href: "/contacts", label: "Contacts" }}
        title={<span className="flex items-center gap-3"><Avatar name={c.name} size="lg" /><span className="min-w-0 truncate">{c.name}</span></span>}
        description={
          <span className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px]">
            {c.phone && <span className="flex items-center gap-1.5"><Phone className="size-3.5 text-subtle" />{c.phone}</span>}
            {c.email && <span className="flex items-center gap-1.5"><Mail className="size-3.5 text-subtle" />{c.email}</span>}
            {c.company && <Link href={`/companies/${c.company.id}`} className="flex items-center gap-1.5 hover:text-fg"><Building className="size-3.5 text-subtle" />{c.company.name}</Link>}
            {c.tags.map((t) => <Badge key={t} tone={t === "hot" ? "danger" : "neutral"}>{t}</Badge>)}
            {c.optedOut && <Badge tone="danger"><Ban className="size-3" />Opted out</Badge>}
          </span>
        }
        actions={
          <>
            <Button icon={<CalendarPlus className="size-4" />} onClick={() => setBooking(true)}>Book</Button>
            {me.can("crm.create") && <Button icon={<Plus className="size-4" />} onClick={() => setNewOpp(true)}>Opportunity</Button>}
            {me.can("crm.edit") && <Button variant="ghost" size="icon" aria-label="Edit contact" onClick={() => setEditing(true)}><Pencil className="size-4" /></Button>}
            {me.can("crm.delete") && <Button variant="ghost" size="icon" aria-label="Delete contact" onClick={del} className="hover:text-danger"><Trash2 className="size-4" /></Button>}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Section title={<span className="flex items-center gap-2"><MessageCircle className="size-4 text-success" />WhatsApp conversation</span>}>
            <div className="-m-5">
              {conversationId ? (
                <Thread conversationId={conversationId} className="h-[420px]" />
              ) : (
                <EmptyState icon={<MessageCircle className="size-5" />} title="No conversation yet" description={c.phone ? "Start a WhatsApp chat with this contact." : "Add a phone number to message this contact."}
                  action={c.phone && !c.optedOut ? <Button variant="primary" loading={pending} onClick={startChat}>Start conversation</Button> : undefined} />
              )}
            </div>
          </Section>

          <Section title={`Opportunities (${c.opportunities.length})`} action={me.can("crm.create") && <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => setNewOpp(true)}>Add</Button>}>
            {c.opportunities.length ? (
              <ul className="divide-y divide-line -my-2">
                {c.opportunities.map((o) => (
                  <li key={o.id}>
                    <Link href={`/opportunities/${o.id}`} className="flex items-center justify-between gap-3 py-3 group">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium group-hover:underline">{o.title}</span>
                        <span className="text-xs text-muted">{o.pipeline.name} · {o.owner?.name ?? "No owner"}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-3">
                        <span className="text-sm tabular">{o.valueHidden ? <span className="inline-flex items-center gap-1 text-muted" title="Hidden for your role"><EyeClosed className="size-3.5" />•••</span> : fmtMoney(o.value ?? 0, o.currency)}</span>
                        <Badge tone={o.stage.kind === "WON" ? "success" : o.stage.kind === "LOST" ? "neutral" : "accent"}>{o.stage.name}</Badge>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="py-4 text-center text-[13px] text-muted">No opportunities yet.</p>}
          </Section>

          <div className="grid gap-6 xl:grid-cols-2">
            <Section title="Payments">
              <PaymentList payments={c.payments} conversationContactId={c.optedOut ? undefined : c.id} />
              {!c.payments.length && c.opportunities.length > 0 && <p className="text-xs text-muted text-center">Request a payment from an opportunity.</p>}
            </Section>
            <Section title="Appointments" action={<Button size="sm" variant="ghost" icon={<CalendarPlus className="size-3.5" />} onClick={() => setBooking(true)}>Book</Button>}>
              <AppointmentList items={c.appointments} contactId={c.id} onChanged={() => mutate()} />
            </Section>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <p className="text-xs font-medium text-muted mb-3">Assigned employee</p>
            {c.owner ? (
              <div className="flex items-center gap-3">
                <Avatar name={c.owner.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.owner.name}</p>
                  <p className="flex items-center gap-1.5 text-xs text-muted"><Dot tone={STATUS_TONE[c.owner.status]} />{STATUS_LABEL[c.owner.status]}</p>
                </div>
              </div>
            ) : <p className="text-sm text-muted">Unassigned</p>}
            {c.leads.length > 0 && (
              <div className="mt-4 border-t border-line pt-4">
                <p className="text-xs font-medium text-muted mb-2">Leads</p>
                <ul className="space-y-2">
                  {c.leads.slice(0, 4).map((l) => (
                    <li key={l.id}>
                      <Link href={`/leads/${l.id}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 -mx-2 hover:bg-surface-2">
                        <span className="flex items-center gap-2 min-w-0"><Zap className="size-3.5 text-subtle shrink-0" /><SourceBadge source={l.source} /><span className="truncate text-xs text-muted">{timeAgo(l.createdAt)}</span></span>
                        <LeadStatus lead={l} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {me.can("crm.edit") && (
              <div className="mt-4 border-t border-line pt-4">
                <Switch checked={c.optedOut} onChange={toggleOptOut} label="Opted out of messages" description={c.optedOut ? c.optOutReason ?? undefined : "Customers can also reply STOP to opt out."} />
              </div>
            )}
          </Card>

          <Section title="Details">
            <CustomFieldsCard fields={c.fields} values={c.customValues} onSave={saveFields} canEdit={me.can("crm.edit")} />
          </Section>

          <Section title="Activity" action={<Link href="#" onClick={(e) => { e.preventDefault(); mutate(); }} className="text-xs text-muted hover:text-fg"><ArrowUpRight className="hidden" />{c.activities.length} events</Link>}>
            {me.can("crm.edit") && <div className="mb-5"><NoteComposer contactId={c.id} onDone={() => mutate()} /></div>}
            <Timeline items={c.activities} />
          </Section>
        </div>
      </div>

      <BookingModal open={booking} onClose={() => setBooking(false)} contactId={c.id} contactName={c.name} />
      <NewOpportunityModal open={newOpp} onClose={() => setNewOpp(false)} contactId={c.id} />
      <EditContactModal open={editing} onClose={() => setEditing(false)} contact={c} onSaved={() => mutate()} />
    </div>
  );
}

function EditContactModal({ open, onClose, contact, onSaved }: { open: boolean; onClose: () => void; contact: ContactFull; onSaved: () => void }) {
  const me = useMe();
  const { data: companies } = useApi<{ rows: { id: string; name: string }[] }>(open ? "/api/companies?pageSize=100" : null);
  const { data: users } = useApi<{ id: string; name: string; active: boolean }[]>(open && me.seesAll ? "/api/users" : null);
  const [f, setF] = useState({ name: contact.name, email: contact.email ?? "", phone: contact.phone ?? "", tags: contact.tags.join(", "), companyId: contact.companyId ?? "", ownerId: contact.owner?.id ?? "" });
  const { pending, run } = useAction();
  const submit = () =>
    run(() => api(`/api/contacts/${contact.id}`, {
      method: "PATCH",
      body: { name: f.name, email: f.email, phone: f.phone, companyId: f.companyId || null, tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean), ...(me.seesAll ? { ownerId: f.ownerId || null } : {}) },
    }), { success: "Contact updated" }).then(() => { onSaved(); refresh("/api/contacts"); onClose(); }).catch(() => null);
  return (
    <Modal open={open} onClose={onClose} title="Edit contact"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={pending} onClick={submit}>Save</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" className="sm:col-span-2"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Email"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Phone"><Input type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Company">
          <Select value={f.companyId} onChange={(e) => setF({ ...f, companyId: e.target.value })}>
            <option value="">None</option>
            {companies?.rows.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
        </Field>
        {me.seesAll && (
          <Field label="Owner">
            <Select value={f.ownerId} onChange={(e) => setF({ ...f, ownerId: e.target.value })}>
              <option value="">Unassigned</option>
              {users?.filter((u) => u.active).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Tags" hint="Comma separated" className="sm:col-span-2"><Input value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
