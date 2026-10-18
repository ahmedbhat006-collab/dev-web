"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Shuffle, ArrowDown, Info } from "lucide-react";
import { useApi, api, useAction } from "@/lib/client";
import { Card, CardHeader, Button, Input, Select, Field, Skeleton } from "@/components/ui";
import { useMe } from "@/components/me";
import { fmtDuration } from "@/lib/client";

type Rule = { maxOpenLeads: number; ackWindowSec: number; idleSec: number; backupUserId: string | null; managerUserId: string | null; levels: { target: string; seconds: number }[] };
const TARGET_LABEL: Record<string, string> = { NEXT_ELIGIBLE: "Next available employee", BACKUP: "Designated backup", MANAGER: "Manager" };

export default function AssignmentPage() {
  const me = useMe();
  const canEdit = me.can("leads.manage_rules");
  const { data: rule, mutate } = useApi<Rule>("/api/assignment-rule");
  const { data: users } = useApi<{ id: string; name: string; active: boolean }[]>("/api/users");
  const [d, setD] = useState<Rule | null>(null);
  const { pending, run } = useAction();
  useEffect(() => { if (rule && !d) setD({ ...rule, levels: rule.levels.map((l) => ({ target: l.target, seconds: l.seconds })) }); }, [rule, d]);
  if (!d) return <Skeleton className="h-96" />;

  const num = (k: keyof Rule) => (e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, [k]: Math.max(0, Number(e.target.value)) });
  const save = () => run(() => api("/api/assignment-rule", { method: "PUT", body: d }), { success: "Lead rules saved (recorded in the audit log)" }).then(() => mutate()).catch(() => null);
  const active = users?.filter((u) => u.active) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader title="Assignment" description="New leads go round-robin to employees who are Available and under their open-lead limit. Others never receive leads." />
        <fieldset disabled={!canEdit} className="grid gap-4 sm:grid-cols-3">
          <Field label="Max open leads per employee"><Input type="number" min={1} value={d.maxOpenLeads} onChange={num("maxOpenLeads")} /></Field>
          <Field label="Acknowledge within (seconds)" hint={fmtDuration(d.ackWindowSec)}><Input type="number" min={5} value={d.ackWindowSec} onChange={num("ackWindowSec")} /></Field>
          <Field label="Idle alert after (seconds)" hint={`Recovery queue after ${fmtDuration(d.idleSec)} with no action`}><Input type="number" min={10} value={d.idleSec} onChange={num("idleSec")} /></Field>
          <Field label="Designated backup">
            <Select value={d.backupUserId ?? ""} onChange={(e) => setD({ ...d, backupUserId: e.target.value || null })}>
              <option value="">None</option>
              {active.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </Field>
          <Field label="Manager (final level)" hint="Falls back to the Owner if empty or away">
            <Select value={d.managerUserId ?? ""} onChange={(e) => setD({ ...d, managerUserId: e.target.value || null })}>
              <option value="">Owner</option>
              {active.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </Field>
        </fieldset>
      </Card>

      <Card>
        <CardHeader title="Escalation chain" description="When a window expires, the lead moves to the next level automatically and the new owner gets an email." />
        <ol className="flex flex-col gap-2">
          <li className="flex items-center gap-3 rounded-lg border border-line bg-surface-2/40 p-3.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-accent/10 text-accent"><Shuffle className="size-4" /></span>
            <div className="text-[13px]"><p className="font-medium">Round-robin assignment</p><p className="text-muted">Owner has {fmtDuration(d.ackWindowSec)} to acknowledge</p></div>
          </li>
          {d.levels.map((l, i) => (
            <li key={i} className="flex flex-col gap-2">
              <ArrowDown className="mx-5 size-4 text-subtle" aria-hidden />
              <fieldset disabled={!canEdit} className="flex flex-col gap-3 rounded-lg border border-line p-3.5 sm:flex-row sm:items-end">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-sm font-semibold text-warning">{i + 1}</span>
                <Field label="Escalate to" className="flex-1">
                  <Select value={l.target} onChange={(e) => setD({ ...d, levels: d.levels.map((x, j) => (j === i ? { ...x, target: e.target.value } : x)) })}>
                    {Object.entries(TARGET_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                </Field>
                <Field label="They have (seconds)" className="sm:w-44">
                  <Input type="number" min={5} value={l.seconds} onChange={(e) => setD({ ...d, levels: d.levels.map((x, j) => (j === i ? { ...x, seconds: Number(e.target.value) } : x)) })} />
                </Field>
                <Button variant="ghost" size="icon" aria-label={`Remove level ${i + 1}`} disabled={d.levels.length <= 1} onClick={() => setD({ ...d, levels: d.levels.filter((_, j) => j !== i) })}><Trash2 className="size-4" /></Button>
              </fieldset>
            </li>
          ))}
        </ol>
        {canEdit && (
          <div className="mt-4 flex flex-wrap justify-between gap-2">
            <Button size="sm" icon={<Plus className="size-3.5" />} disabled={d.levels.length >= 10} onClick={() => setD({ ...d, levels: [...d.levels, { target: "MANAGER", seconds: 60 }] })}>Add level</Button>
            <Button variant="primary" loading={pending} onClick={save}>Save rules</Button>
          </div>
        )}
        <p className="mt-4 flex items-start gap-2 text-xs text-muted"><Info className="size-3.5 shrink-0 mt-0.5" />After the last level, the lead stays with its final owner and is listed in the recovery queue. Escalations are safe under load: a lead can never be owned by two people or escalated twice by timers firing together.</p>
        {!canEdit && <p className="mt-2 text-xs text-warning">You can view these rules but need the &quot;Manage assignment &amp; escalation rules&quot; permission to change them.</p>}
      </Card>
    </div>
  );
}
