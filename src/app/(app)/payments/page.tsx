"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import { CreditCard } from "lucide-react";
import { useApi, qs } from "@/lib/client";
import { PageHeader, Card, Segmented, Skeleton, EmptyState, Pagination, ErrorState, Stat } from "@/components/ui";
import { PaymentList, PaymentRow } from "@/components/crm";
import { fmtMinor, fmtMoney } from "@/lib/money";

export default function PaymentsPage() {
  return <Suspense><Payments /></Suspense>;
}

function Payments() {
  const sp = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const month = sp.get("month") ?? "";
  const { data, error, mutate } = useApi<{ rows: PaymentRow[]; total: number; page: number; pageSize: number }>(`/api/payments${qs({ status, page, month })}`, { live: 3000 });
  const { data: dash } = useApi<{ collectedThisMonth: Record<string, number>; projectedPayments: Record<string, number> }>("/api/dashboard", { live: 5000 });
  const m = (x?: Record<string, number>) => (x && Object.keys(x).length ? Object.entries(x).map(([c, v]) => fmtMinor(v, c)).join(" · ") : fmtMoney(0, "USD"));
  return (
    <div className="animate-fade-in">
      <PageHeader title="Payments" description="Stripe payment requests. Statuses update automatically from Stripe's verified webhooks." />
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <Stat label="Collected this month" value={m(dash?.collectedThisMonth)} sub="Only payments Stripe confirmed, minus refunds" tone="success" icon={<CreditCard className="size-3.5" />} />
        <Stat label="Awaiting payment" value={m(dash?.projectedPayments)} sub="Open payment links, not counted as revenue" tone="warning" icon={<CreditCard className="size-3.5" />} />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented label="Status" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[{ value: "", label: "All" }, { value: "PENDING", label: "Awaiting" }, { value: "PAID", label: "Paid" }, { value: "EXPIRED", label: "Expired" }, { value: "FAILED", label: "Failed" }, { value: "REFUNDED", label: "Refunded" }]} />
        {month && <button onClick={() => router.replace("/payments")} className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-xs text-accent">Paid this month ✕</button>}
      </div>
      {error && <ErrorState error={error} onRetry={() => mutate()} />}
      <Card>
        {!data && !error && <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>}
        {data && !data.rows.length && <EmptyState icon={<CreditCard className="size-5" />} title="No payments yet" description="Create a payment request from any opportunity." />}
        {data && data.rows.length > 0 && <PaymentList payments={data.rows} />}
      </Card>
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
    </div>
  );
}
