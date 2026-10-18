"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Globe, Phone, Trash2, Users } from "lucide-react";
import { useApi, api, useAction } from "@/lib/client";
import { PageHeader, Button, Card, Avatar, Skeleton, ErrorState, EmptyState, Badge } from "@/components/ui";
import { useMe } from "@/components/me";

type Company = { id: string; name: string; domain: string | null; phone: string | null; contacts: { id: string; name: string; email: string | null; tags: string[]; owner: { name: string } | null; _count: { opportunities: number } }[] };

export default function CompanyPage() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const router = useRouter();
  const { data: c, error, mutate } = useApi<Company>(`/api/companies/${id}`);
  const { run } = useAction();
  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (!c) return <Skeleton className="h-64" />;
  return (
    <div className="animate-fade-in">
      <PageHeader
        back={{ href: "/companies", label: "Companies" }}
        title={c.name}
        description={<span className="flex flex-wrap gap-4 mt-1 text-[13px]">{c.domain && <span className="flex items-center gap-1.5"><Globe className="size-3.5 text-subtle" />{c.domain}</span>}{c.phone && <span className="flex items-center gap-1.5"><Phone className="size-3.5 text-subtle" />{c.phone}</span>}</span>}
        actions={me.can("crm.delete") && <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => confirm(`Delete ${c.name}? Its contacts are kept and simply unlinked.`) && run(() => api(`/api/companies/${id}`, { method: "DELETE" }), { success: "Company deleted" }).then(() => router.push("/companies")).catch(() => null)}>Delete</Button>}
      />
      <Card padded={false}>
        <div className="border-b border-line px-5 py-3.5 text-sm font-semibold">Contacts ({c.contacts.length})</div>
        {!c.contacts.length && <EmptyState icon={<Users className="size-5" />} title="No contacts at this company" />}
        <ul className="divide-y divide-line">
          {c.contacts.map((p) => (
            <li key={p.id}>
              <Link href={`/contacts/${p.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2/50">
                <Avatar name={p.name} />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{p.name}</span><span className="block truncate text-xs text-muted">{p.email ?? "—"} · {p.owner?.name ?? "Unassigned"}</span></span>
                <span className="hidden sm:flex gap-1">{p.tags.slice(0, 2).map((t) => <Badge key={t}>{t}</Badge>)}</span>
                <span className="text-xs text-muted">{p._count.opportunities} opp.</span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
