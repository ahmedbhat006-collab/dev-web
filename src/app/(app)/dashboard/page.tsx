"use client";

import Link from "next/link";
import { useState } from "react";
import { Zap, Timer, LifeBuoy, Flame, Wallet, SlidersHorizontal, CalendarDays, ArrowUpRight, Eye, EyeOff, EyeClosed } from "lucide-react";
import { useApi, api, fmtDuration } from "@/lib/client";
import { Card, CardHeader, Stat, Skeleton, ErrorState, Button, Popover, Checkbox, Avatar, Dot, Badge, EmptyState, cx, buttonClass } from "@/components/ui";
import { useMe } from "@/components/me";
import { STATUS_TONE } from "@/components/shell";
import { STATUS_LABEL } from "@/lib/labels";
import { fmtMoney, fmtMinor } from "@/lib/money";
import { fmtInTz, tzAbbr } from "@/lib/tz";

type Dash = {
  scope: "company" | "personal";
  newLeadsToday: number;
  avgFirstResponseSec: number | null;
  recoveryCount: number;
  escalations24h: number;
  pipelineByStage: { stageId: string; stage: string; pipeline: string; count: number; value: number | null }[];
  openPipelineValue: number | null;
  valuesHidden: boolean;
  availability: Record<string, number>;
  team: { id: string; name: string; status: string }[];
  upcomingAppointments: { id: string; title: string; startUtc: string; timezone: string; contact: { id: string; name: string }; employee: string }[];
  collectedThisMonth: Record<string, number>;
  projectedPayments: Record<string, number>;
  hidden: string[];
};

const WIDGETS = [
  { key: "newLeads", label: "New leads today" },
  { key: "response", label: "Avg. first response" },
  { key: "recovery", label: "Recovery queue" },
  { key: "escalations", label: "Escalations (24h)" },
  { key: "collected", label: "Collected this month" },
  { key: "pipeline", label: "Open pipeline by stage" },
  { key: "team", label: "Team availability" },
  { key: "appointments", label: "Upcoming appointments" },
];

export default function DashboardPage() {
  const me = useMe();
  const { data, error, mutate } = useApi<Dash>("/api/dashboard", { live: 5000 });
  const [hidden, setHidden] = useState<string[] | null>(null);
  const hid = hidden ?? data?.hidden ?? [];
  const show = (k: string) => !hid.includes(k);
  const toggle = async (k: string) => {
    const next = hid.includes(k) ? hid.filter((x) => x !== k) : [...hid, k];
    setHidden(next);
    await api("/api/dashboard/prefs", { method: "PUT", body: { hidden: next } }).catch(() => null);
  };
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const money = (m: Record<string, number>) => {
    const e = Object.entries(m);
    return e.length ? e.map(([c, v]) => fmtMinor(v, c)).join(" · ") : fmtMoney(0, "USD");
  };

  const customize = (
    <Popover
      trigger={({ toggle: t, open }) => <Button icon={<SlidersHorizontal className="size-4" />} onClick={t} aria-expanded={open}>Customize</Button>}
      className="w-64"
    >
      {() => (
        <div className="p-1.5">
          <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-subtle">Show on dashboard</p>
          <div className="flex flex-col gap-2.5 px-1 pb-1">
            {WIDGETS.map((w) => <Checkbox key={w.key} checked={show(w.key)} onChange={() => toggle(w.key)} label={w.label} />)}
          </div>
        </div>
      )}
    </Popover>
  );

  return (
    <div>
      <section className="mb-6 border-b border-line pb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="eyebrow">
              {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
            </p>
            <h1 className="mt-1.5 text-[24px] sm:text-[26px] font-semibold leading-tight tracking-[-0.02em]">
              {greet}, {me.name.split(" ")[0]}
            </h1>
            <p className="mt-2 text-sm text-muted">
              {data
                ? data.recoveryCount
                  ? <>You have <Link href="/recovery" className="font-medium text-danger underline-offset-2 hover:underline">{data.recoveryCount} lead{data.recoveryCount === 1 ? "" : "s"} needing attention</Link>. {data.scope === "company" ? "Company-wide view" : "Your personal view"}, updating live.</>
                  : <>Every lead has an owner. {data.scope === "company" ? "Company-wide view" : "Your personal view"}, updating live.</>
                : " "}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {me.can("crm.create") && <Link href="/leads?new=1" className={buttonClass("primary")}><Zap className="size-4" />New lead</Link>}
            <a href={`/f/${me.workspace.slug}`} target="_blank" rel="noreferrer" className={buttonClass("secondary")}><ArrowUpRight className="size-4" />Lead form</a>
            {customize}
          </div>
        </div>
      </section>
      {error && <ErrorState error={error} onRetry={() => mutate()} />}
      {!data && !error && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[132px] rounded-lg" />)}</div>
      )}
      {data && (
        <div className="flex flex-col gap-6">
          <div className="grid gap-3 sm:gap-4 grid-cols-2 xl:grid-cols-5">
            {show("newLeads") && <Stat label={data.scope === "company" ? "New leads today" : "My new leads today"} value={data.newLeadsToday} icon={<Zap className="size-3.5" />} tone="accent" href="/leads?created=today" sub={<span className="inline-flex items-center gap-1">View leads <ArrowUpRight className="size-3" /></span>} />}
            {show("response") && <Stat label={data.scope === "company" ? "Avg. first response" : "My avg. response"} value={fmtDuration(data.avgFirstResponseSec)} icon={<Timer className="size-3.5" />} tone="info" sub="From first assignment to acknowledgement" />}
            {show("recovery") && <Stat label="Recovery queue" value={data.recoveryCount} icon={<LifeBuoy className="size-3.5" />} tone={data.recoveryCount ? "danger" : "success"} href="/recovery" sub={data.recoveryCount ? "Leads needing attention" : "Nothing slipping through"} />}
            {show("escalations") && <Stat label={data.scope === "company" ? "Escalations (24h)" : "Escalated from me (24h)"} value={data.escalations24h} icon={<Flame className="size-3.5" />} tone={data.escalations24h ? "warning" : "neutral"} href={me.can("audit.view") ? "/audit?action=LEAD_ESCALATED" : undefined} sub="Automatic, after a missed window" />}
            {show("collected") && <Stat className="col-span-2 xl:col-span-1" label="Collected this month" value={<span className="text-[22px] break-words">{money(data.collectedThisMonth)}</span>} icon={<Wallet className="size-3.5" />} tone="success" href="/payments?month=this" sub={<>Confirmed by Stripe, minus refunds{Object.keys(data.projectedPayments).length ? <> · <span className="text-fg">{money(data.projectedPayments)}</span> awaiting</> : null}</>} />}
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
            {show("pipeline") && (
              <Card>
                <CardHeader
                  title="Open pipeline by stage"
                  description={data.valuesHidden ? "Values are hidden for your role." : `Total open value: ${fmtMoney(data.openPipelineValue ?? 0, "PKR", { compact: true })}`}
                  action={<Link href="/pipeline" className="text-[13px] text-accent hover:underline">Open board</Link>}
                />
                <PipelineBars rows={data.pipelineByStage} hidden={data.valuesHidden} />
              </Card>
            )}
            <div className="flex flex-col gap-6">
              {show("team") && (
                <Card>
                  <CardHeader title="Team availability" description="Only Available teammates receive new leads." />
                  <div className="mb-4 grid grid-cols-4 gap-2">
                    {Object.entries(data.availability).map(([s, n]) => (
                      <div key={s} className="rounded-lg bg-surface-2/70 px-2 py-2 text-center">
                        <p className="text-lg font-semibold tabular">{n}</p>
                        <p className="text-[10.5px] text-muted flex items-center justify-center gap-1"><Dot tone={STATUS_TONE[s]} />{STATUS_LABEL[s]}</p>
                      </div>
                    ))}
                  </div>
                  <ul className="flex flex-col gap-2.5">
                    {data.team.map((u) => (
                      <li key={u.id} className="flex items-center gap-2.5">
                        <Avatar name={u.name} size="sm" />
                        <span className="flex-1 truncate text-[13px]">{u.name}</span>
                        <Badge tone={STATUS_TONE[u.status]} dot>{STATUS_LABEL[u.status]}</Badge>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
              {show("appointments") && (
                <Card>
                  <CardHeader title="Upcoming appointments" description="Next 7 days" action={<Link href="/appointments" className="text-[13px] text-accent hover:underline">All</Link>} />
                  {data.upcomingAppointments.length ? (
                    <ul className="flex flex-col gap-3">
                      {data.upcomingAppointments.map((a) => (
                        <li key={a.id} className="flex gap-3">
                          <span className="flex size-10 shrink-0 flex-col items-center justify-center rounded-lg border border-line bg-surface-2 leading-none">
                            <span className="text-[9px] uppercase text-muted">{fmtInTz(a.startUtc, me.timezone, { month: "short", dateStyle: undefined, timeStyle: undefined })}</span>
                            <span className="text-sm font-semibold">{fmtInTz(a.startUtc, me.timezone, { day: "numeric", dateStyle: undefined, timeStyle: undefined })}</span>
                          </span>
                          <div className="min-w-0">
                            <Link href={`/contacts/${a.contact.id}`} className="block truncate text-[13px] font-medium hover:underline">{a.title}</Link>
                            <p className="text-xs text-muted truncate">{fmtInTz(a.startUtc, me.timezone, { dateStyle: undefined, timeStyle: "short" })} {tzAbbr(me.timezone)} · {a.employee}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState icon={<CalendarDays className="size-5" />} title="Nothing booked" description="Book from any contact or opportunity." />
                  )}
                </Card>
              )}
            </div>
          </div>
          {hid.length > 0 && (
            <p className="text-center text-xs text-subtle flex items-center justify-center gap-1.5"><EyeOff className="size-3.5" />{hid.length} widget(s) hidden · use Customize to show them</p>
          )}
        </div>
      )}
    </div>
  );
}

function PipelineBars({ rows, hidden }: { rows: Dash["pipelineByStage"]; hidden: boolean }) {
  const pipelines = [...new Set(rows.map((r) => r.pipeline))];
  const max = Math.max(1, ...rows.map((r) => (hidden ? r.count : r.value ?? 0)));
  if (!rows.length) return <EmptyState title="No open stages" />;
  return (
    <div className="flex flex-col gap-6">
      {pipelines.map((p) => (
        <div key={p}>
          <p className="mb-2.5 text-xs font-medium text-muted">{p}</p>
          <ul className="flex flex-col gap-2">
            {rows.filter((r) => r.pipeline === p).map((r) => {
              const v = hidden ? r.count : r.value ?? 0;
              return (
                <li key={r.stageId}>
                  <Link href={`/pipeline?stage=${r.stageId}`} className="group grid grid-cols-[96px_1fr_auto] sm:grid-cols-[120px_1fr_auto] items-center gap-3 rounded-lg px-1 py-1 hover:bg-surface-2/60 transition-colors">
                    <span className="truncate text-[13px]">{r.stage}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-surface-2">
                      <span className={cx("block h-full rounded-full bg-accent/80 group-hover:bg-accent transition-all")} style={{ width: `${Math.max(2, (v / max) * 100)}%` }} />
                    </span>
                    <span className="text-right text-[13px] tabular">
                      {hidden ? <span className="inline-flex items-center gap-1 text-muted"><EyeClosed className="size-3" />{r.count}</span> : <>{fmtMoney(r.value ?? 0, "PKR", { compact: true })} <span className="text-subtle">· {r.count}</span></>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {hidden && <p className="text-xs text-muted flex items-center gap-1.5"><Eye className="size-3.5" />Showing deal counts. Ask an admin for the &quot;See opportunity values&quot; permission to see amounts.</p>}
    </div>
  );
}
