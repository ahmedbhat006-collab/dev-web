"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { CreditCard, CalendarPlus, Trash2, Pencil, EyeClosed, TriangleAlert, Check } from "lucide-react";
import { useApi, api, useAction, ApiError } from "@/lib/client";
import { PageHeader, Button, Card, Badge, Avatar, Skeleton, ErrorState, Modal, Field, Input, Select, cx } from "@/components/ui";
import { Timeline, NoteComposer, CustomFieldsCard, PaymentList, PaymentModal, AppointmentList, BookingModal, Section, ActivityRow, CustomFieldDef, PaymentRow, AppointmentRow, CustomFieldInput } from "@/components/crm";
import { useMe } from "@/components/me";
import { fmtMoney, fmtMinor } from "@/lib/money";

type Opp = {
  id: string; title: string; value: number | null; valueHidden: boolean; currency: string; version: number; stageId: string; pipelineId: string;
  customValues: Record<string, unknown>; createdAt: string;
  contact: { id: string; name: string; email: string | null; phone: string | null; optedOut: boolean };
  owner: { id: string; name: string } | null;
  stage: { id: string; name: string; kind: string; requiredFieldIds: string[] };
  pipeline: { id: string; name: string; stages: { id: string; name: string; kind: string; requiredFieldIds: string[] }[] };
  payments: PaymentRow[]; appointments: AppointmentRow[]; activities: ActivityRow[]; fields: CustomFieldDef[];
};

export default function OpportunityPage() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const router = useRouter();
  const { data: o, error, mutate } = useApi<Opp>(`/api/opportunities/${id}`, { live: 3000 });
  const [pay, setPay] = useState(false);
  const [book, setBook] = useState(false);
  const [edit, setEdit] = useState(false);
  const [blocked, setBlocked] = useState<{ stageId: string; stageName: string; missing: string[] } | null>(null);
  const { run } = useAction();

  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (!o) return <div className="space-y-4"><Skeleton className="h-20" /><Skeleton className="h-96" /></div>;

  const moveTo = async (stageId: string) => {
    try {
      await api(`/api/opportunities/${id}`, { method: "PATCH", body: { stageId, version: o.version } });
      mutate();
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 422 && err.data.missingFieldIds) {
        setBlocked({ stageId, stageName: String(err.data.stageName), missing: err.data.missingFieldIds as string[] });
      } else {
        const { toast } = await import("sonner");
        toast.error(err.message);
        mutate();
      }
    }
  };
  const saveFields = (customValues: Record<string, unknown>) => api(`/api/opportunities/${id}`, { method: "PATCH", body: { customValues, version: o.version } }).then(() => mutate());
  const currentIdx = o.pipeline.stages.findIndex((s) => s.id === o.stageId);
  const paid = o.payments.filter((p) => ["PAID", "PARTIALLY_REFUNDED"].includes(p.status));

  return (
    <div className="animate-fade-in">
      <PageHeader
        back={{ href: "/pipeline", label: "Pipeline" }}
        title={o.title}
        description={<span className="flex flex-wrap items-center gap-2 mt-1 text-[13px]"><Link href={`/contacts/${o.contact.id}`} className="hover:text-fg hover:underline">{o.contact.name}</Link><span className="text-subtle">·</span>{o.pipeline.name}<Badge tone={o.stage.kind === "WON" ? "success" : o.stage.kind === "LOST" ? "neutral" : "accent"}>{o.stage.name}</Badge></span>}
        actions={
          <>
            <Button variant="primary" icon={<CreditCard className="size-4" />} onClick={() => setPay(true)}>Request payment</Button>
            <Button icon={<CalendarPlus className="size-4" />} onClick={() => setBook(true)}>Book</Button>
            {me.can("crm.edit") && <Button variant="ghost" size="icon" aria-label="Edit opportunity" onClick={() => setEdit(true)}><Pencil className="size-4" /></Button>}
            {me.can("crm.delete") && <Button variant="ghost" size="icon" aria-label="Delete opportunity" className="hover:text-danger" onClick={() => confirm("Delete this opportunity?") && run(() => api(`/api/opportunities/${id}`, { method: "DELETE" }), { success: "Deleted" }).then(() => router.push("/pipeline")).catch(() => null)}><Trash2 className="size-4" /></Button>}
          </>
        }
      />

      <Card className="mb-6 p-2">
        <ol className="flex gap-1 overflow-x-auto" aria-label="Stages">
          {o.pipeline.stages.map((s, i) => {
            const active = s.id === o.stageId;
            const done = i < currentIdx && s.kind === "OPEN";
            return (
              <li key={s.id} className="flex-1 min-w-[96px]">
                <button
                  disabled={!me.can("crm.edit") || active}
                  onClick={() => moveTo(s.id)}
                  aria-current={active ? "step" : undefined}
                  className={cx(
                    "flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-medium transition-all",
                    active ? (s.kind === "WON" ? "bg-success text-white" : s.kind === "LOST" ? "bg-surface-3 text-fg" : "bg-accent text-accent-fg") : done ? "bg-accent/10 text-accent hover:bg-accent/15" : "text-muted hover:bg-surface-2 hover:text-fg",
                  )}
                >
                  {done && <Check className="size-3.5" />}
                  <span className="truncate">{s.name}</span>
                  {s.requiredFieldIds.length > 0 && !active && <span className="text-[10px] opacity-60" title="Has required fields">*</span>}
                </button>
              </li>
            );
          })}
        </ol>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <p className="text-xs text-muted">Value</p>
              <p className="mt-1.5 text-xl font-semibold tabular">{o.valueHidden ? <span className="inline-flex items-center gap-1.5 text-base font-normal text-muted"><EyeClosed className="size-4" />Hidden for your role</span> : fmtMoney(o.value ?? 0, o.currency)}</p>
            </Card>
            <Card>
              <p className="text-xs text-muted">Collected</p>
              <p className="mt-1.5 text-xl font-semibold tabular text-success">{paid.length ? paid.map((p) => fmtMinor(p.amount - p.refundedAmount, p.currency)).join(" + ") : "—"}</p>
            </Card>
            <Card>
              <p className="text-xs text-muted">Owner</p>
              <p className="mt-1.5 flex items-center gap-2 text-sm font-medium">{o.owner ? <><Avatar name={o.owner.name} size="sm" />{o.owner.name}</> : "—"}</p>
            </Card>
          </div>
          <Section title="Payments" action={<Button size="sm" variant="ghost" icon={<CreditCard className="size-3.5" />} onClick={() => setPay(true)}>New request</Button>}>
            <PaymentList payments={o.payments} conversationContactId={o.contact.optedOut ? undefined : o.contact.id} />
          </Section>
          <Section title="Appointments" action={<Button size="sm" variant="ghost" icon={<CalendarPlus className="size-3.5" />} onClick={() => setBook(true)}>Book</Button>}>
            <AppointmentList items={o.appointments} contactId={o.contact.id} onChanged={() => mutate()} />
          </Section>
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <Section title={`${o.pipeline.name} fields`}>
            <CustomFieldsCard fields={o.fields} values={o.customValues} onSave={saveFields} requiredIds={o.pipeline.stages.flatMap((s) => s.requiredFieldIds)} canEdit={me.can("crm.edit")} />
          </Section>
          <Section title="Activity">
            {me.can("crm.edit") && <div className="mb-5"><NoteComposer opportunityId={o.id} onDone={() => mutate()} /></div>}
            <Timeline items={o.activities} />
          </Section>
        </div>
      </div>

      <PaymentModal open={pay} onClose={() => setPay(false)} opportunityId={o.id} defaultAmount={o.value ? Math.round(o.value * 0.1) : null} defaultCurrency={o.currency} title={o.title} />
      <BookingModal open={book} onClose={() => setBook(false)} contactId={o.contact.id} opportunityId={o.id} contactName={o.contact.name} />
      <EditOpp open={edit} onClose={() => setEdit(false)} opp={o} onSaved={() => mutate()} />
      {blocked && <RequiredFieldsModal opp={o} blocked={blocked} onClose={() => setBlocked(null)} onDone={() => { setBlocked(null); mutate(); }} />}
    </div>
  );
}

function RequiredFieldsModal({ opp, blocked, onClose, onDone }: { opp: Opp; blocked: { stageId: string; stageName: string; missing: string[] }; onClose: () => void; onDone: () => void }) {
  const fields = opp.fields.filter((f) => blocked.missing.includes(f.id));
  const [vals, setVals] = useState<Record<string, unknown>>({});
  const { pending, run } = useAction();
  return (
    <Modal open onClose={onClose} title={`Required for "${blocked.stageName}"`} description="This stage needs these fields before an opportunity can move into it."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={pending} onClick={() => run(() => api(`/api/opportunities/${opp.id}`, { method: "PATCH", body: { stageId: blocked.stageId, customValues: vals, version: opp.version } }), { success: `Moved to ${blocked.stageName}` }).then(onDone).catch(() => null)}>Save & move</Button></>}>
      <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-warning/25 bg-warning/8 p-3 text-[13px] text-warning"><TriangleAlert className="size-4 shrink-0 mt-0.5" />Move blocked: {fields.map((f) => f.name).join(", ")} {fields.length === 1 ? "is" : "are"} empty.</div>
      <div className="grid gap-4">{fields.map((f) => <CustomFieldInput key={f.id} field={f} value={vals[f.key]} onChange={(v) => setVals({ ...vals, [f.key]: v })} required />)}</div>
    </Modal>
  );
}

function EditOpp({ open, onClose, opp, onSaved }: { open: boolean; onClose: () => void; opp: Opp; onSaved: () => void }) {
  const me = useMe();
  const { data: users } = useApi<{ id: string; name: string; active: boolean }[]>(open ? "/api/users" : null);
  const [f, setF] = useState({ title: opp.title, value: String(opp.value ?? ""), currency: opp.currency, ownerId: opp.owner?.id ?? "" });
  const { pending, run } = useAction();
  const canValue = me.can("opportunity.value.view");
  return (
    <Modal open={open} onClose={onClose} title="Edit opportunity"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={pending} onClick={() => run(() => api(`/api/opportunities/${opp.id}`, { method: "PATCH", body: { title: f.title, version: opp.version, ownerId: f.ownerId || null, ...(canValue ? { value: Number(f.value) || 0, currency: f.currency } : {}) } }), { success: "Saved" }).then(() => { onSaved(); onClose(); }).catch(() => null)}>Save</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" className="sm:col-span-2"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        {canValue && <>
          <Field label="Value"><Input type="number" min="0" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /></Field>
          <Field label="Currency"><Select value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>{["PKR", "USD", "EUR", "GBP", "AED"].map((c) => <option key={c}>{c}</option>)}</Select></Field>
        </>}
        <Field label="Owner" className="sm:col-span-2">
          <Select value={f.ownerId} onChange={(e) => setF({ ...f, ownerId: e.target.value })}>
            <option value="">None</option>
            {users?.filter((u) => u.active).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
