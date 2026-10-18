"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, SquareKanban, List, Download, EyeClosed, GripVertical, ArrowRight } from "lucide-react";
import { useApi, api, ApiError } from "@/lib/client";
import { PageHeader, Button, Segmented, Select, Card, Badge, Avatar, Skeleton, EmptyState, Popover, MenuItem, cx } from "@/components/ui";
import { NewOpportunityModal } from "@/components/opportunity-modal";
import { useMe } from "@/components/me";
import { fmtMoney } from "@/lib/money";

type Stage = { id: string; name: string; kind: string; order: number; requiredFieldIds: string[] };
type Pipeline = { id: string; name: string; stages: Stage[] };
type Opp = {
  id: string; title: string; value: number | null; valueHidden: boolean; currency: string; version: number; stageId: string;
  contact: { id: string; name: string }; owner: { id: string; name: string } | null; stage: { id: string; name: string; kind: string };
  payments: { status: string }[];
};

export default function PipelinePage() {
  return <Suspense><Board /></Suspense>;
}

function Board() {
  const me = useMe();
  const sp = useSearchParams();
  const { data: pipelines } = useApi<Pipeline[]>("/api/pipelines");
  const [pid, setPid] = useState<string>("");
  const [view, setView] = useState<"board" | "list">("board");
  const [creating, setCreating] = useState<{ stageId?: string } | null>(null);
  const focusStage = sp.get("stage");
  useEffect(() => { if (window.innerWidth < 768) setView("list"); }, []);

  useEffect(() => {
    if (!pipelines?.length || pid) return;
    const fromStage = focusStage && pipelines.find((p) => p.stages.some((s) => s.id === focusStage));
    setPid((fromStage || pipelines[0]).id);
  }, [pipelines, pid, focusStage]);

  const pipeline = pipelines?.find((p) => p.id === pid);
  const { data: opps, mutate } = useApi<Opp[]>(pid ? `/api/opportunities?pipelineId=${pid}` : null, { live: 6000 });
  const [optimistic, setOptimistic] = useState<Record<string, string>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);

  const byStage = useMemo(() => {
    const m: Record<string, Opp[]> = {};
    for (const o of opps ?? []) (m[optimistic[o.id] ?? o.stageId] ??= []).push(o);
    return m;
  }, [opps, optimistic]);

  const move = async (o: Opp, stageId: string) => {
    if (o.stageId === stageId) return;
    setOptimistic((s) => ({ ...s, [o.id]: stageId }));
    try {
      await api(`/api/opportunities/${o.id}`, { method: "PATCH", body: { stageId, version: o.version } });
      const to = pipeline?.stages.find((s) => s.id === stageId);
      toast.success(`Moved to ${to?.name}`);
      await mutate();
    } catch (e) {
      const err = e as ApiError;
      toast.error(err.message, err.status === 422 ? { action: { label: "Fill in fields", onClick: () => (window.location.href = `/opportunities/${o.id}`) } } : undefined);
      await mutate();
    } finally {
      setOptimistic((s) => { const n = { ...s }; delete n[o.id]; return n; });
    }
  };

  const total = (list: Opp[]) => list.reduce((s, o) => s + (o.value ?? 0), 0);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Pipeline"
        description="Drag deals between stages, or use the move menu on each card."
        actions={
          <>
            {me.can("crm.export") && pid && <a href={`/api/opportunities/export?pipelineId=${pid}`} className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3.5 text-sm font-medium shadow-soft hover:bg-surface-2"><Download className="size-4" />Export</a>}
            {me.can("crm.create") && <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating({})}>New opportunity</Button>}
          </>
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Select aria-label="Pipeline" value={pid} onChange={(e) => setPid(e.target.value)} className="w-56">
          {pipelines?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <Segmented label="View" value={view} onChange={setView} options={[{ value: "board", label: <span className="flex items-center gap-1.5"><SquareKanban className="size-3.5" />Board</span> }, { value: "list", label: <span className="flex items-center gap-1.5"><List className="size-3.5" />List</span> }]} />
      </div>

      {!pipeline || !opps ? (
        <div className="flex gap-4 overflow-hidden">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-96 w-72 shrink-0 rounded-lg" />)}</div>
      ) : view === "board" ? (
        <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="flex gap-4" style={{ minWidth: "min-content" }}>
            {pipeline.stages.map((s) => {
              const list = byStage[s.id] ?? [];
              return (
                <section
                  key={s.id}
                  aria-label={`${s.name} stage`}
                  onDragOver={(e) => { e.preventDefault(); setOverStage(s.id); }}
                  onDragLeave={() => setOverStage((x) => (x === s.id ? null : x))}
                  onDrop={(e) => { e.preventDefault(); setOverStage(null); const o = opps.find((x) => x.id === dragId); if (o) move(o, s.id); setDragId(null); }}
                  className={cx(
                    "flex w-[280px] shrink-0 flex-col rounded-lg border bg-surface-2/40 transition-colors",
                    overStage === s.id ? "border-accent bg-accent/5" : "border-line",
                    focusStage === s.id && "ring-2 ring-accent/40",
                  )}
                >
                  <header className="flex items-center justify-between gap-2 px-3.5 pt-3.5 pb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={cx("size-2 rounded-full", s.kind === "WON" ? "bg-success" : s.kind === "LOST" ? "bg-subtle" : "bg-accent")} aria-hidden />
                      <h2 className="truncate text-[13px] font-semibold">{s.name}</h2>
                      <span className="text-xs text-subtle tabular">{list.length}</span>
                    </div>
                    {s.requiredFieldIds.length > 0 && <Badge title="This stage has required fields">Required fields</Badge>}
                  </header>
                  <p className="px-3.5 pb-2 text-xs text-muted tabular">{me.can("opportunity.value.view") ? fmtMoney(total(list), list[0]?.currency ?? "PKR", { compact: true }) : " "}</p>
                  <ul className="flex flex-1 flex-col gap-2 px-2 pb-2 min-h-24">
                    {list.map((o) => (
                      <li
                        key={o.id}
                        draggable
                        onDragStart={() => setDragId(o.id)}
                        onDragEnd={() => { setDragId(null); setOverStage(null); }}
                        className={cx("group rounded-lg border border-line bg-surface p-3 shadow-soft transition-all hover:border-line-strong hover:shadow-float cursor-grab active:cursor-grabbing", dragId === o.id && "opacity-50", optimistic[o.id] && "animate-pulse")}
                      >
                        <div className="flex items-start gap-1.5">
                          <GripVertical className="size-3.5 mt-0.5 shrink-0 text-subtle opacity-0 group-hover:opacity-100" aria-hidden />
                          <Link href={`/opportunities/${o.id}`} className="min-w-0 flex-1 text-[13px] font-medium leading-snug hover:underline">{o.title}</Link>
                          <MoveMenu stages={pipeline.stages} current={o.stageId} onMove={(sid) => move(o, sid)} />
                        </div>
                        <p className="mt-1 ml-5 truncate text-xs text-muted">{o.contact.name}</p>
                        <div className="mt-3 ml-5 flex items-center justify-between">
                          <span className="text-[13px] font-semibold tabular">{o.valueHidden ? <span className="inline-flex items-center gap-1 font-normal text-muted"><EyeClosed className="size-3" />Hidden</span> : fmtMoney(o.value ?? 0, o.currency, { compact: true })}</span>
                          <span className="flex items-center gap-1.5">
                            {o.payments.some((p) => p.status === "PAID") && <Badge tone="success">Paid</Badge>}
                            {o.owner && <Avatar name={o.owner.name} size="sm" />}
                          </span>
                        </div>
                      </li>
                    ))}
                    {!list.length && <li className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-line py-6 text-xs text-subtle">Drop here</li>}
                  </ul>
                  {me.can("crm.create") && s.kind === "OPEN" && (
                    <button onClick={() => setCreating({ stageId: s.id })} className="mx-2 mb-2 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-muted hover:bg-surface hover:text-fg"><Plus className="size-3.5" />Add</button>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      ) : (
        <Card padded={false} className="overflow-hidden">
          {!opps.length && <EmptyState icon={<SquareKanban className="size-5" />} title="No opportunities in this pipeline" />}
          <ul className="divide-y divide-line">
            {opps.map((o) => (
              <li key={o.id} className="grid gap-2 px-5 py-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_200px] md:items-center md:gap-4">
                <Link href={`/opportunities/${o.id}`} className="min-w-0"><span className="block truncate text-sm font-medium hover:underline">{o.title}</span><span className="block truncate text-xs text-muted">{o.contact.name}</span></Link>
                <span className="text-sm tabular">{o.valueHidden ? <span className="text-muted">Hidden</span> : fmtMoney(o.value ?? 0, o.currency)}</span>
                <span className="truncate text-[13px] text-muted">{o.owner?.name ?? "—"}</span>
                <Select aria-label={`Stage for ${o.title}`} value={optimistic[o.id] ?? o.stageId} onChange={(e) => move(o, e.target.value)}>
                  {pipeline.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <NewOpportunityModal open={!!creating} onClose={() => setCreating(null)} defaultPipelineId={pid} defaultStageId={creating?.stageId} contacts />
    </div>
  );
}

function MoveMenu({ stages, current, onMove }: { stages: Stage[]; current: string; onMove: (id: string) => void }) {
  return (
    <Popover
      trigger={({ toggle, open }) => (
        <button onClick={toggle} aria-expanded={open} aria-label="Move to stage" className="rounded p-0.5 text-subtle opacity-60 hover:bg-surface-2 hover:text-fg group-hover:opacity-100 focus:opacity-100">
          <ArrowRight className="size-3.5" />
        </button>
      )}
      className="w-48"
    >
      {(close) => (
        <div>
          <p className="px-2.5 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-subtle">Move to</p>
          {stages.map((s) => (
            <MenuItem key={s.id} active={s.id === current} onClick={() => { close(); onMove(s.id); }}>{s.name}</MenuItem>
          ))}
        </div>
      )}
    </Popover>
  );
}
