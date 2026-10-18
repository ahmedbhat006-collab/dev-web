"use client";

import { useState } from "react";
import { UserPlus, CalendarDays, Info } from "lucide-react";
import { useApi, api, useAction, refresh } from "@/lib/client";
import { Card, CardHeader, Button, Badge, Avatar, Select, Modal, Field, Input, Switch, Skeleton, Dot, Popover, MenuItem } from "@/components/ui";
import { STATUS_TONE } from "@/components/shell";
import { STATUS_LABEL, LEVEL_LABEL } from "@/lib/labels";
import { useMe } from "@/components/me";
import { toast } from "sonner";

type U = {
  id: string; name: string; email?: string; level: "OWNER" | "ADMIN" | "USER"; status: string; active: boolean; receivesLeads: boolean;
  role: { id: string; name: string } | null; openLeads: number; calendar: string;
};
type Role = { id: string; name: string };

export default function UsersPage() {
  const me = useMe();
  const manage = me.can("users.manage");
  const { data: users, mutate } = useApi<U[]>("/api/users", { live: 5000 });
  const { data: roles } = useApi<Role[]>("/api/roles");
  const [inviting, setInviting] = useState(false);

  const patch = async (u: U, body: Record<string, unknown>, msg: string) => {
    try {
      const r = await api<{ reassigned: number }>(`/api/users/${u.id}`, { method: "PATCH", body });
      toast.success(msg, { description: r.reassigned ? `${r.reassigned} unacknowledged lead(s) reassigned.` : undefined });
      mutate();
      refresh("/api/");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card padded={false}>
        <div className="p-5 pb-0">
          <CardHeader title="Team" description="Owner, Admin and User are the base levels. What each person can do comes from their role." action={manage && <Button variant="primary" icon={<UserPlus className="size-4" />} onClick={() => setInviting(true)}>Add teammate</Button>} />
        </div>
        {!users && <div className="p-5 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>}
        <ul className="divide-y divide-line border-t border-line">
          {users?.map((u) => {
            const locked = u.level === "OWNER" && me.level !== "OWNER";
            return (
              <li key={u.id} className={`grid gap-3 px-5 py-4 lg:grid-cols-[minmax(0,1.6fr)_110px_minmax(0,1fr)_minmax(0,1fr)_140px] lg:items-center lg:gap-4 ${!u.active ? "opacity-55" : ""}`}>
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={u.name} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{u.name}{u.id === me.id && <span className="text-muted font-normal"> (you)</span>}</p>
                    <p className="truncate text-xs text-muted">{u.email ?? " "}{!u.active && " · deactivated"}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 items-center gap-2 lg:contents">
                <div>
                  {manage && !locked && u.level !== "OWNER" && u.id !== me.id ? (
                    <Select aria-label={`Level for ${u.name}`} value={u.level} onChange={(e) => patch(u, { level: e.target.value }, "Level updated")} className="h-8 text-[13px]">
                      <option value="USER">User</option>
                      <option value="ADMIN" disabled={me.level !== "OWNER"}>Admin</option>
                    </Select>
                  ) : <Badge tone={u.level === "OWNER" ? "accent" : "neutral"}>{LEVEL_LABEL[u.level]}</Badge>}
                </div>
                <div>
                  {u.level === "OWNER" ? <span className="text-[13px] text-muted">All permissions</span> : manage && !locked ? (
                    <Select aria-label={`Role for ${u.name}`} value={u.role?.id ?? ""} onChange={(e) => patch(u, { roleId: e.target.value || null }, "Role updated")} className="h-8 text-[13px]">
                      <option value="">No role (no access)</option>
                      {roles?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </Select>
                  ) : <span className="text-[13px]">{u.role?.name ?? "No role"}</span>}
                </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {(manage && !locked) || u.id === me.id ? (
                    <Select aria-label={`Status for ${u.name}`} value={u.status} onChange={(e) => patch(u, { status: e.target.value }, `${u.name} is now ${STATUS_LABEL[e.target.value].toLowerCase()}`)} className="h-8 w-32 text-[13px]">
                      {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </Select>
                  ) : <Badge tone={STATUS_TONE[u.status]} dot>{STATUS_LABEL[u.status]}</Badge>}
                  <span className="text-xs text-muted tabular">{u.openLeads} open</span>
                </div>
                <div className="flex items-center gap-2 lg:justify-end">
                  <span title={`Calendar: ${u.calendar.replace("_", " ").toLowerCase()}`} className="flex items-center gap-1 text-xs text-muted">
                    <CalendarDays className="size-3.5" /><Dot tone={u.calendar === "CONNECTED" ? "success" : u.calendar === "NEEDS_RECONNECT" ? "danger" : "neutral"} />
                  </span>
                  {manage && !locked && u.level !== "OWNER" && (
                    <Popover trigger={({ toggle }) => <Button size="sm" variant="ghost" onClick={toggle}>Manage</Button>} className="w-64">
                      {(close) => (
                        <div className="p-1">
                          <div className="px-2 py-2"><Switch checked={u.receivesLeads} onChange={(v) => { close(); patch(u, { receivesLeads: v }, v ? "Will receive leads" : "Won't receive new leads"); }} label="Receives new leads" description="Include in round-robin" /></div>
                          {u.active ? (
                            <MenuItem danger onClick={() => { close(); if (confirm(`Deactivate ${u.name}? All their open leads are reassigned now.`)) patch(u, { active: false }, `${u.name} deactivated`); }}>Deactivate</MenuItem>
                          ) : (
                            <MenuItem onClick={() => { close(); patch(u, { active: true }, `${u.name} reactivated`); }}>Reactivate</MenuItem>
                          )}
                        </div>
                      )}
                    </Popover>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
      <p className="flex items-start gap-2 text-xs text-muted"><Info className="size-3.5 shrink-0 mt-0.5" />Setting someone On leave or Offline immediately reassigns their unacknowledged leads. Acknowledged leads stay with them and appear in the recovery queue as &quot;Owner is away&quot;.</p>
      <InviteModal open={inviting} onClose={() => setInviting(false)} roles={roles ?? []} onDone={() => mutate()} />
    </div>
  );
}

function InviteModal({ open, onClose, roles, onDone }: { open: boolean; onClose: () => void; roles: Role[]; onDone: () => void }) {
  const me = useMe();
  const [f, setF] = useState({ name: "", email: "", password: "", level: "USER", roleId: "" });
  const { pending, run } = useAction();
  const gen = () => setF({ ...f, password: Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6).toUpperCase() });
  return (
    <Modal open={open} onClose={onClose} title="Add a teammate" description="They sign in with this email and temporary password."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={pending} onClick={() => run(() => api("/api/users", { body: { ...f, roleId: f.roleId || null } }), { success: `${f.name} added. Share the password with them.` }).then(() => { onDone(); onClose(); setF({ name: "", email: "", password: "", level: "USER", roleId: "" }); }).catch(() => null)}>Add teammate</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Email" required><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Temporary password" required className="sm:col-span-2">
          <div className="flex gap-2"><Input value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} className="font-mono" /><Button onClick={gen}>Generate</Button></div>
        </Field>
        <Field label="Level">
          <Select value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })}>
            <option value="USER">User</option>
            {me.level === "OWNER" && <option value="ADMIN">Admin</option>}
          </Select>
        </Field>
        <Field label="Role">
          <Select value={f.roleId} onChange={(e) => setF({ ...f, roleId: e.target.value })}>
            <option value="">No role</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
