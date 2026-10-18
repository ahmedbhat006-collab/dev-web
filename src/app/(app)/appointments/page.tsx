"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarDays, ExternalLink } from "lucide-react";
import { useApi } from "@/lib/client";
import { PageHeader, Card, Segmented, Skeleton, EmptyState, Badge, Avatar, cx } from "@/components/ui";
import { useMe } from "@/components/me";
import { fmtInTz, tzAbbr } from "@/lib/tz";

type Appt = { id: string; title: string; startUtc: string; endUtc: string; timezone: string; status: string; googleLink: string | null; contact: { id: string; name: string }; user: { id: string; name: string }; opportunity: { id: string; title: string } | null };

export default function AppointmentsPage() {
  const me = useMe();
  const [range, setRange] = useState<"upcoming" | "past">("upcoming");
  const { data } = useApi<Appt[]>(`/api/appointments?range=${range}`, { live: 10000 });
  return (
    <div className="animate-fade-in">
      <PageHeader title="Appointments" description={`Booked on employees' Google Calendars. Times shown in your zone (${tzAbbr(me.timezone)}).`} />
      <Segmented className="mb-4" label="Range" value={range} onChange={setRange} options={[{ value: "upcoming", label: "Upcoming" }, { value: "past", label: "Past" }]} />
      <Card padded={false} className="overflow-hidden">
        {!data && <div className="p-5 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>}
        {data && !data.length && <EmptyState icon={<CalendarDays className="size-5" />} title={range === "upcoming" ? "Nothing scheduled" : "No past appointments"} description="Book from a contact or opportunity page." />}
        <ul className="divide-y divide-line">
          {data?.map((a) => (
            <li key={a.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
              <span className="flex size-12 shrink-0 flex-col items-center justify-center rounded-lg border border-line bg-surface-2 leading-none">
                <span className="text-[10px] uppercase text-muted">{fmtInTz(a.startUtc, me.timezone, { month: "short", dateStyle: undefined, timeStyle: undefined })}</span>
                <span className="text-lg font-semibold">{fmtInTz(a.startUtc, me.timezone, { day: "numeric", dateStyle: undefined, timeStyle: undefined })}</span>
              </span>
              <div className="min-w-0 flex-1">
                <p className={cx("truncate text-sm font-medium", a.status === "CANCELLED" && "line-through text-muted")}>{a.title}</p>
                <p className="text-xs text-muted">
                  {fmtInTz(a.startUtc, me.timezone, { dateStyle: undefined, timeStyle: "short" })}–{fmtInTz(a.endUtc, me.timezone, { dateStyle: undefined, timeStyle: "short" })} {tzAbbr(me.timezone, new Date(a.startUtc))}
                  {" · "}<Link href={`/contacts/${a.contact.id}`} className="hover:text-fg hover:underline">{a.contact.name}</Link>
                  {a.opportunity && <> · <Link href={`/opportunities/${a.opportunity.id}`} className="hover:text-fg hover:underline">{a.opportunity.title}</Link></>}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {a.status === "CANCELLED" && <Badge>Cancelled</Badge>}
                <span className="flex items-center gap-2 text-[13px]"><Avatar name={a.user.name} size="sm" />{a.user.name}</span>
                {a.googleLink && a.user.id === me.id && <a href={a.googleLink} target="_blank" rel="noreferrer" className="text-muted hover:text-fg" aria-label="Open in Google Calendar"><ExternalLink className="size-4" /></a>}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
