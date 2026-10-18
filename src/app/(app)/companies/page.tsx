"use client";

import Link from "next/link";
import { useState } from "react";
import { Building, Plus, Search } from "lucide-react";
import { useApi, api, useAction, qs } from "@/lib/client";
import { PageHeader, Button, Card, Input, Field, Modal, Skeleton, EmptyState, Pagination, ErrorState } from "@/components/ui";
import { useMe } from "@/components/me";

type Company = { id: string; name: string; domain: string | null; phone: string | null; _count: { contacts: number } };

export default function CompaniesPage() {
  const me = useMe();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const { data, error, mutate } = useApi<{ rows: Company[]; total: number; page: number; pageSize: number }>(`/api/companies${qs({ q, page })}`);
  return (
    <div className="animate-fade-in">
      <PageHeader title="Companies" description="Organizations your contacts belong to." actions={me.can("crm.create") && <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>New company</Button>} />
      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
        <Input aria-label="Search companies" placeholder="Search companies" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="pl-9" />
      </div>
      {error && <ErrorState error={error} onRetry={() => mutate()} />}
      {!data && !error && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>}
      {data && !data.rows.length && <Card><EmptyState icon={<Building className="size-5" />} title="No companies yet" /></Card>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data?.rows.map((c) => (
          <Link key={c.id} href={`/companies/${c.id}`} className="group lift rounded-lg border border-line bg-surface p-5 shadow-soft">
            <div className="flex items-start gap-3">
              <span className="flex size-10 items-center justify-center rounded-lg bg-surface-2 text-sm font-semibold text-muted">{c.name.slice(0, 2).toUpperCase()}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold group-hover:underline">{c.name}</p>
                <p className="truncate text-xs text-muted">{c.domain ?? "No website"}</p>
              </div>
            </div>
            <p className="mt-4 text-xs text-muted">{c._count.contacts} contact{c._count.contacts === 1 ? "" : "s"}</p>
          </Link>
        ))}
      </div>
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
      <NewCompany open={open} onClose={() => setOpen(false)} onDone={() => mutate()} />
    </div>
  );
}

function NewCompany({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: "", domain: "", phone: "" });
  const { pending, run } = useAction();
  return (
    <Modal open={open} onClose={onClose} size="sm" title="New company"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={pending} onClick={() => run(() => api("/api/companies", { body: f }), { success: "Company created" }).then(() => { onDone(); onClose(); setF({ name: "", domain: "", phone: "" }); }).catch(() => null)}>Create</Button></>}>
      <div className="grid gap-4">
        <Field label="Name" required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Website"><Input value={f.domain} onChange={(e) => setF({ ...f, domain: e.target.value })} placeholder="company.com" /></Field>
        <Field label="Phone"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
