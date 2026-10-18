"use client";

import { useState } from "react";
import { Plus, Trash2, Layers } from "lucide-react";
import { useApi, api, useAction } from "@/lib/client";
import { Card, CardHeader, Button, Input, Select, Field, Modal, Badge, Skeleton, EmptyState, Segmented } from "@/components/ui";
import { FIELD_TYPE_LABEL } from "@/lib/labels";

type F = { id: string; name: string; key: string; type: string; entity: "CONTACT" | "OPPORTUNITY"; options: string[]; pipeline: { id: string; name: string } | null };

export default function FieldsPage() {
  const { data: fields, mutate } = useApi<F[]>("/api/fields");
  const { data: pipelines } = useApi<{ id: string; name: string }[]>("/api/pipelines");
  const [entity, setEntity] = useState<"CONTACT" | "OPPORTUNITY">("CONTACT");
  const [open, setOpen] = useState(false);
  const { run } = useAction();
  const list = fields?.filter((f) => f.entity === entity) ?? [];

  return (
    <Card>
      <CardHeader title="Custom fields" description="Add fields without code. They appear on forms and detail pages immediately." action={<Button variant="primary" size="sm" icon={<Plus className="size-3.5" />} onClick={() => setOpen(true)}>Add field</Button>} />
      <Segmented className="mb-4" label="Entity" value={entity} onChange={setEntity} options={[{ value: "CONTACT", label: "Contact fields", count: fields?.filter((f) => f.entity === "CONTACT").length }, { value: "OPPORTUNITY", label: "Opportunity fields", count: fields?.filter((f) => f.entity === "OPPORTUNITY").length }]} />
      {entity === "OPPORTUNITY" && <p className="mb-4 text-xs text-muted">Opportunity fields can belong to one pipeline, so each pipeline shows its own field set, while contact fields are shared everywhere.</p>}
      {!fields && <Skeleton className="h-40" />}
      {fields && !list.length && <EmptyState icon={<Layers className="size-5" />} title="No fields yet" />}
      <ul className="divide-y divide-line rounded-lg border border-line empty:hidden">
        {list.map((f) => (
          <li key={f.id} className="flex flex-col gap-2 p-3.5 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{f.name}</p>
              <p className="font-mono text-[11px] text-subtle">{f.key}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="accent">{FIELD_TYPE_LABEL[f.type]}</Badge>
              {f.entity === "OPPORTUNITY" && <Badge>{f.pipeline ? f.pipeline.name : "All pipelines"}</Badge>}
              {f.options.length > 0 && <span className="max-w-[220px] truncate text-xs text-muted">{f.options.join(", ")}</span>}
              <Button size="sm" variant="ghost" className="hover:text-danger" icon={<Trash2 className="size-3.5" />} aria-label={`Delete ${f.name}`}
                onClick={() => confirm(`Delete "${f.name}"? Its values are removed from every record and from stage requirements.`) && run(() => api(`/api/fields/${f.id}`, { method: "DELETE" }), { success: "Field deleted" }).then(() => mutate()).catch(() => null)} />
            </div>
          </li>
        ))}
      </ul>
      <NewField open={open} onClose={() => setOpen(false)} entity={entity} pipelines={pipelines ?? []} onDone={() => mutate()} />
    </Card>
  );
}

function NewField({ open, onClose, entity, pipelines, onDone }: { open: boolean; onClose: () => void; entity: "CONTACT" | "OPPORTUNITY"; pipelines: { id: string; name: string }[]; onDone: () => void }) {
  const [f, setF] = useState({ name: "", type: "TEXT", options: "", pipelineId: "" });
  const { pending, run } = useAction();
  const submit = () =>
    run(() => api("/api/fields", { body: { entity, name: f.name, type: f.type, options: f.options.split(",").map((o) => o.trim()).filter(Boolean), pipelineId: f.pipelineId || null } }), { success: "Field added. It's live on all forms." })
      .then(() => { onDone(); onClose(); setF({ name: "", type: "TEXT", options: "", pipelineId: "" }); })
      .catch(() => null);
  return (
    <Modal open={open} onClose={onClose} title={`New ${entity === "CONTACT" ? "contact" : "opportunity"} field`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={pending} onClick={submit} disabled={!f.name.trim()}>Add field</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Roof type" /></Field>
        <Field label="Type">
          <Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
            {Object.entries(FIELD_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        {f.type === "DROPDOWN" && <Field label="Options" hint="Comma separated" required className="sm:col-span-2"><Input value={f.options} onChange={(e) => setF({ ...f, options: e.target.value })} placeholder="Flat, Sloped, Metal" /></Field>}
        {entity === "OPPORTUNITY" && (
          <Field label="Pipeline" className="sm:col-span-2" hint="Limit this field to one pipeline, or show it in all.">
            <Select value={f.pipelineId} onChange={(e) => setF({ ...f, pipelineId: e.target.value })}>
              <option value="">All pipelines</option>
              {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
        )}
      </div>
    </Modal>
  );
}
