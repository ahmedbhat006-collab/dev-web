"use client";

import { useEffect, useState } from "react";
import { Plus, ArrowUp, ArrowDown, Trash2, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { useApi, api, useAction, ApiError } from "@/lib/client";
import { Card, CardHeader, Button, Input, Select, Field, Modal, Badge, Skeleton, Checkbox, cx } from "@/components/ui";

type Field_ = { id: string; name: string; entity: string; pipelineId: string | null };
type Stage = { id: string; name: string; kind: "OPEN" | "WON" | "LOST"; order: number; requiredFieldIds: string[]; _count: { opportunities: number } };
type Pipeline = { id: string; name: string; stages: Stage[] };

export default function PipelinesSettings() {
  const { data: pipelines, mutate } = useApi<Pipeline[]>("/api/pipelines");
  const { data: fields } = useApi<Field_[]>("/api/fields?entity=OPPORTUNITY");
  const [pid, setPid] = useState("");
  const [creating, setCreating] = useState(false);
  const { run } = useAction();
  useEffect(() => { if (!pid && pipelines?.length) setPid(pipelines[0].id); }, [pipelines, pid]);
  const p = pipelines?.find((x) => x.id === pid);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader title="Pipelines" description="Shape your sales process without developer help. Each pipeline can have its own stages and fields." action={<Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setCreating(true)}>New pipeline</Button>} />
        <div className="flex flex-wrap gap-2">
          {pipelines?.map((x) => (
            <button key={x.id} onClick={() => setPid(x.id)} className={cx("rounded-lg border px-3 py-1.5 text-[13px] transition-colors", x.id === pid ? "border-accent/40 bg-accent/10 text-accent font-medium" : "border-line text-muted hover:text-fg")}>{x.name}</button>
          ))}
        </div>
      </Card>
      {!p && <Skeleton className="h-80" />}
      {p && fields && <PipelineEditor key={p.id} p={p} fields={fields.filter((f) => !f.pipelineId || f.pipelineId === p.id)} onChange={() => mutate()} onDelete={() =>
        confirm(`Delete the ${p.name} pipeline?`) && run(() => api(`/api/pipelines/${p.id}`, { method: "DELETE" }), { success: "Pipeline deleted" }).then(() => { setPid(""); mutate(); }).catch(() => null)
      } />}
      <NewPipeline open={creating} onClose={() => setCreating(false)} onDone={(id) => { mutate(); setPid(id); }} />
    </div>
  );
}

function PipelineEditor({ p, fields, onChange, onDelete }: { p: Pipeline; fields: Field_[]; onChange: () => void; onDelete: () => void }) {
  const [name, setName] = useState(p.name);
  const [newStage, setNewStage] = useState({ name: "", kind: "OPEN" });
  const [deleting, setDeleting] = useState<Stage | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const { pending, run } = useAction();

  const reorder = (i: number, dir: -1 | 1) => {
    const ids = p.stages.map((s) => s.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    run(() => api(`/api/pipelines/${p.id}/stages`, { method: "PUT", body: { order: ids } })).then(onChange).catch(() => null);
  };
  const patchStage = (s: Stage, body: Record<string, unknown>, msg?: string) => run(() => api(`/api/stages/${s.id}`, { method: "PATCH", body }), { success: msg }).then(onChange).catch(() => null);

  return (
    <Card>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field label="Pipeline name" className="flex-1"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <div className="flex gap-2">
          <Button disabled={name === p.name || name.trim().length < 2} loading={pending} onClick={() => run(() => api(`/api/pipelines/${p.id}`, { method: "PATCH", body: { name } }), { success: "Renamed" }).then(onChange).catch(() => null)}>Rename</Button>
          <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={onDelete}>Delete</Button>
        </div>
      </div>

      <p className="mb-2 text-[13px] font-medium">Stages</p>
      <ul className="divide-y divide-line rounded-lg border border-line">
        {p.stages.map((s, i) => (
          <li key={s.id} className="flex flex-col gap-3 p-3.5 lg:flex-row lg:items-center">
            <div className="flex items-center gap-2 lg:w-64">
              <div className="flex flex-col">
                <button aria-label={`Move ${s.name} up`} disabled={i === 0} onClick={() => reorder(i, -1)} className="rounded p-0.5 text-subtle hover:text-fg disabled:opacity-30"><ArrowUp className="size-3.5" /></button>
                <button aria-label={`Move ${s.name} down`} disabled={i === p.stages.length - 1} onClick={() => reorder(i, 1)} className="rounded p-0.5 text-subtle hover:text-fg disabled:opacity-30"><ArrowDown className="size-3.5" /></button>
              </div>
              {editing === s.id ? (
                <div className="flex flex-1 items-center gap-1">
                  <Input aria-label="Stage name" value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8" autoFocus onKeyDown={(e) => { if (e.key === "Enter") { patchStage(s, { name: editName }, "Stage renamed"); setEditing(null); } }} />
                  <Button size="icon" variant="ghost" className="size-8" aria-label="Save" onClick={() => { patchStage(s, { name: editName }, "Stage renamed"); setEditing(null); }}><Check className="size-4" /></Button>
                  <Button size="icon" variant="ghost" className="size-8" aria-label="Cancel" onClick={() => setEditing(null)}><X className="size-4" /></Button>
                </div>
              ) : (
                <button className="group flex flex-1 items-center gap-2 text-left" onClick={() => { setEditing(s.id); setEditName(s.name); }}>
                  <span className="text-sm font-medium">{s.name}</span>
                  <Pencil className="size-3 text-subtle opacity-0 group-hover:opacity-100" />
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:flex-1">
              <Select aria-label={`Type of ${s.name}`} value={s.kind} onChange={(e) => patchStage(s, { kind: e.target.value }, "Stage type updated")} className="h-8 w-28 text-[13px]">
                <option value="OPEN">Open</option><option value="WON">Won</option><option value="LOST">Lost</option>
              </Select>
              <Badge>{s._count.opportunities} deals</Badge>
              {fields.length > 0 && (
                <details className="relative">
                  <summary className="cursor-pointer list-none rounded-lg border border-line px-2.5 py-1 text-xs text-muted hover:text-fg">
                    Required fields{s.requiredFieldIds.length ? ` (${s.requiredFieldIds.length})` : ""}
                  </summary>
                  <div className="absolute z-20 mt-2 w-60 rounded-lg border border-line bg-surface p-3 shadow-float">
                    <p className="mb-2 text-xs text-muted">Block moving into &quot;{s.name}&quot; until these are filled:</p>
                    <div className="flex flex-col gap-2">
                      {fields.map((f) => (
                        <Checkbox key={f.id} label={f.name} checked={s.requiredFieldIds.includes(f.id)} onChange={(v) => patchStage(s, { requiredFieldIds: v ? [...s.requiredFieldIds, f.id] : s.requiredFieldIds.filter((x) => x !== f.id) }, "Requirement saved")} />
                      ))}
                    </div>
                  </div>
                </details>
              )}
            </div>
            <Button size="sm" variant="ghost" className="self-start hover:text-danger lg:self-auto" icon={<Trash2 className="size-3.5" />} onClick={() => setDeleting(s)}>Delete</Button>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Input aria-label="New stage name" placeholder="New stage name" value={newStage.name} onChange={(e) => setNewStage({ ...newStage, name: e.target.value })} />
        <Select aria-label="New stage type" value={newStage.kind} onChange={(e) => setNewStage({ ...newStage, kind: e.target.value })} className="sm:w-32">
          <option value="OPEN">Open</option><option value="WON">Won</option><option value="LOST">Lost</option>
        </Select>
        <Button icon={<Plus className="size-4" />} disabled={!newStage.name.trim()} loading={pending} onClick={() => run(() => api(`/api/pipelines/${p.id}/stages`, { body: newStage }), { success: "Stage added" }).then(() => { setNewStage({ name: "", kind: "OPEN" }); onChange(); }).catch(() => null)}>Add stage</Button>
      </div>
      {deleting && <DeleteStage stage={deleting} stages={p.stages.filter((s) => s.id !== deleting.id)} onClose={() => setDeleting(null)} onDone={() => { setDeleting(null); onChange(); }} />}
    </Card>
  );
}

function DeleteStage({ stage, stages, onClose, onDone }: { stage: Stage; stages: Stage[]; onClose: () => void; onDone: () => void }) {
  const [moveTo, setMoveTo] = useState(stages[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const has = stage._count.opportunities > 0;
  const go = async () => {
    setPending(true);
    try {
      await api(`/api/stages/${stage.id}${has ? `?moveTo=${moveTo}` : ""}`, { method: "DELETE" });
      toast.success(`Stage "${stage.name}" deleted${has ? `, ${stage._count.opportunities} deals moved` : ""}`);
      onDone();
    } catch (e) {
      toast.error((e as ApiError).message);
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal open onClose={onClose} size="sm" title={`Delete "${stage.name}"?`} description={has ? `It contains ${stage._count.opportunities} opportunities. Choose where to move them. Nothing is lost.` : "This stage is empty."}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="danger" loading={pending} onClick={go}>{has ? "Move & delete" : "Delete stage"}</Button></>}>
      {has && (
        <Field label="Move opportunities to">
          <Select value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
        </Field>
      )}
    </Modal>
  );
}

function NewPipeline({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (id: string) => void }) {
  const [name, setName] = useState("");
  const { pending, run } = useAction();
  return (
    <Modal open={open} onClose={onClose} size="sm" title="New pipeline" description="Starts with default stages you can rename, reorder or delete."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={pending} disabled={name.trim().length < 2} onClick={() => run(() => api<{ id: string }>("/api/pipelines", { body: { name } }), { success: "Pipeline created" }).then((r) => { if (r) onDone(r.id); setName(""); onClose(); }).catch(() => null)}>Create</Button></>}>
      <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Maintenance contracts" /></Field>
    </Modal>
  );
}
