"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, ShieldCheck } from "lucide-react";
import { useApi, api, useAction } from "@/lib/client";
import { Card, CardHeader, Button, Checkbox, Input, Field, Modal, Skeleton, Badge, cx } from "@/components/ui";
import { PERMISSIONS } from "@/lib/permissions";

type Role = { id: string; name: string; permissions: string[]; users: number };

export default function RolesPage() {
  const { data: roles, mutate } = useApi<Role[]>("/api/roles");
  const [sel, setSel] = useState<string | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const { pending, run } = useAction();
  const role = roles?.find((r) => r.id === sel) ?? roles?.[0];

  useEffect(() => { if (role) { setSel(role.id); setDraft(role.permissions); } }, [role?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = role && JSON.stringify([...draft].sort()) !== JSON.stringify([...role.permissions].sort());
  const groups = [...new Set(PERMISSIONS.map((p) => p.group))];

  return (
    <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
      <Card padded={false} className="h-fit">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <p className="text-sm font-semibold">Roles</p>
          <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => setCreating(true)}>New</Button>
        </div>
        {!roles && <div className="p-4"><Skeleton className="h-24" /></div>}
        <ul className="p-1.5">
          {roles?.map((r) => (
            <li key={r.id}>
              <button onClick={() => { setSel(r.id); setDraft(r.permissions); }} className={cx("flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13.5px] transition-colors", role?.id === r.id ? "bg-surface-2 font-medium" : "hover:bg-surface-2/60")}>
                <span className="flex items-center gap-2"><ShieldCheck className="size-4 text-subtle" />{r.name}</span>
                <span className="text-xs text-subtle">{r.users} {r.users === 1 ? "person" : "people"}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="border-t border-line p-4 text-xs text-muted leading-relaxed">A &quot;Manager&quot; is just a role built from permissions, not a hard-coded level. The Owner always has every permission.</p>
      </Card>

      {role && (
        <Card>
          <CardHeader title={role.name} description="Permissions are checked on the server for every request. Hiding a button is never the only protection."
            action={<>
              <Button size="sm" variant="ghost" className="hover:text-danger" icon={<Trash2 className="size-3.5" />} onClick={() => confirm(`Delete the ${role.name} role? ${role.users} people will lose its permissions.`) && run(() => api(`/api/roles/${role.id}`, { method: "DELETE" }), { success: "Role deleted" }).then(() => { setSel(null); mutate(); }).catch(() => null)}>Delete</Button>
              <Button size="sm" variant="primary" disabled={!dirty} loading={pending} onClick={() => run(() => api(`/api/roles/${role.id}`, { method: "PATCH", body: { permissions: draft } }), { success: "Permissions saved (recorded in the audit log)" }).then(() => mutate()).catch(() => null)}>Save</Button>
            </>} />
          <div className="grid gap-6 md:grid-cols-3">
            {groups.map((g) => (
              <fieldset key={g}>
                <legend className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-subtle">{g}</legend>
                <div className="flex flex-col gap-3">
                  {PERMISSIONS.filter((p) => p.group === g).map((p) => (
                    <Checkbox key={p.key} checked={draft.includes(p.key)} onChange={(v) => setDraft(v ? [...draft, p.key] : draft.filter((x) => x !== p.key))}
                      label={<span className="flex flex-col"><span>{p.label}</span><span className="font-mono text-[10.5px] text-subtle">{p.key}</span></span>} />
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
          {dirty && <p className="mt-5 text-xs text-warning">Unsaved changes</p>}
          <div className="mt-5 flex flex-wrap gap-1.5">{draft.length === 0 && <Badge tone="danger">No permissions: people with this role see nothing</Badge>}</div>
        </Card>
      )}
      <NewRole open={creating} onClose={() => setCreating(false)} onDone={(id) => { mutate(); setSel(id); }} />
    </div>
  );
}

function NewRole({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (id: string) => void }) {
  const [name, setName] = useState("");
  const { pending, run } = useAction();
  return (
    <Modal open={open} onClose={onClose} size="sm" title="New role"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={pending} disabled={name.trim().length < 2} onClick={() => run(() => api<{ id: string }>("/api/roles", { body: { name, permissions: ["crm.view"] } }), { success: "Role created" }).then((r) => { if (r) onDone(r.id); setName(""); onClose(); }).catch(() => null)}>Create</Button></>}>
      <Field label="Role name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Support agent" /></Field>
    </Modal>
  );
}
