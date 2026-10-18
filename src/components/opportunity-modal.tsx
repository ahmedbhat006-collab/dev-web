"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, useAction, useApi, refresh } from "@/lib/client";
import { Button, Field, Input, Modal, Select } from "./ui";
import { CustomFieldDef, CustomFieldInput } from "./crm";
import { useMe } from "./me";

type Pipeline = { id: string; name: string; stages: { id: string; name: string; kind: string; requiredFieldIds: string[] }[]; fields: CustomFieldDef[] };

export function NewOpportunityModal({ open, onClose, contactId, defaultPipelineId, defaultStageId, contacts }: {
  open: boolean; onClose: () => void; contactId?: string; defaultPipelineId?: string; defaultStageId?: string; contacts?: boolean;
}) {
  const me = useMe();
  const router = useRouter();
  const { data: pipelines } = useApi<Pipeline[]>(open ? "/api/pipelines" : null);
  const { data: global } = useApi<(CustomFieldDef & { entity: string })[]>(open ? "/api/fields?entity=OPPORTUNITY" : null);
  const [cq, setCq] = useState("");
  const { data: contactList } = useApi<{ rows: { id: string; name: string }[] }>(open && contacts ? `/api/contacts?pageSize=20&q=${encodeURIComponent(cq)}` : null);
  const [f, setF] = useState({ title: "", contactId: contactId ?? "", pipelineId: "", stageId: "", value: "", currency: "PKR" });
  const [custom, setCustom] = useState<Record<string, unknown>>({});
  const { pending, run } = useAction();

  useEffect(() => {
    if (open && pipelines?.length) {
      const p = pipelines.find((x) => x.id === defaultPipelineId) ?? pipelines[0];
      setF((s) => ({ ...s, contactId: contactId ?? s.contactId, pipelineId: p.id, stageId: defaultStageId ?? p.stages.find((st) => st.kind === "OPEN")?.id ?? "" }));
    }
  }, [open, pipelines, defaultPipelineId, defaultStageId, contactId]);

  const p = pipelines?.find((x) => x.id === f.pipelineId);
  const stage = p?.stages.find((s) => s.id === f.stageId);
  const fields = (global ?? []).filter((x) => !x.pipelineId || x.pipelineId === f.pipelineId);

  const submit = () =>
    run(() => api<{ id: string }>("/api/opportunities", {
      body: { title: f.title, contactId: f.contactId, pipelineId: f.pipelineId, stageId: f.stageId, value: f.value ? Number(f.value) : undefined, currency: f.currency, customValues: custom },
    }), { success: "Opportunity created" })
      .then((r) => { refresh("/api/"); onClose(); setF({ ...f, title: "", value: "" }); setCustom({}); if (r) router.push(`/opportunities/${r.id}`); })
      .catch(() => null);

  return (
    <Modal open={open} onClose={onClose} size="lg" title="New opportunity"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={pending} onClick={submit} disabled={!f.title || !f.contactId || !f.stageId}>Create</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" required className="sm:col-span-2"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="10kW rooftop system" /></Field>
        {contacts && (
          <Field label="Contact" required className="sm:col-span-2" hint="Type to search">
            <div className="flex gap-2">
              <Input aria-label="Search contacts" value={cq} onChange={(e) => setCq(e.target.value)} placeholder="Search…" className="w-40" />
              <Select value={f.contactId} onChange={(e) => setF({ ...f, contactId: e.target.value })}>
                <option value="">Choose a contact…</option>
                {contactList?.rows.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
          </Field>
        )}
        <Field label="Pipeline">
          <Select value={f.pipelineId} onChange={(e) => { const np = pipelines?.find((x) => x.id === e.target.value); setF({ ...f, pipelineId: e.target.value, stageId: np?.stages.find((s) => s.kind === "OPEN")?.id ?? "" }); setCustom({}); }}>
            {pipelines?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
        </Field>
        <Field label="Stage">
          <Select value={f.stageId} onChange={(e) => setF({ ...f, stageId: e.target.value })}>
            {p?.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        {me.can("opportunity.value.view") && (
          <div className="grid grid-cols-[1fr_100px] gap-3 sm:col-span-2">
            <Field label="Value"><Input type="number" min="0" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} placeholder="0" /></Field>
            <Field label="Currency"><Select value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>{["PKR", "USD", "EUR", "GBP", "AED"].map((c) => <option key={c}>{c}</option>)}</Select></Field>
          </div>
        )}
        {fields.map((fd) => <CustomFieldInput key={fd.id} field={fd} value={custom[fd.key]} onChange={(v) => setCustom({ ...custom, [fd.key]: v })} required={stage?.requiredFieldIds.includes(fd.id)} />)}
      </div>
    </Modal>
  );
}
