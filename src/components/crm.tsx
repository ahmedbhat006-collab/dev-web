"use client";

import Link from "next/link";
import { ReactNode, useEffect, useMemo, useState } from "react";
import {
  Timer, CircleCheck, TriangleAlert, ArrowRight, StickyNote, PhoneCall, Shuffle, Flame, MessageCircle, CreditCard,
  CalendarDays, Pencil, Info, Zap, Copy, ExternalLink, Send, RotateCw, Check, CheckCheck, Clock, Ban, CircleX,
} from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Field, Input, Select, Textarea, Modal, Tone, cx, Avatar, Checkbox, Spinner } from "./ui";
import { api, useAction, refresh, timeAgo, useApi, fmtDateTime } from "@/lib/client";
import { SOURCE_LABEL, PAYMENT_LABEL } from "@/lib/labels";
import { fmtMinor } from "@/lib/money";
import { fmtInTz, tzAbbr, utcToZonedLocal } from "@/lib/tz";
import { useMe } from "./me";

// ------------------------------------------------------------------ Countdown (F3.4)

/** Live remaining time. `skew` = server clock minus client clock, so timers match the server. */
export function Countdown({ deadline, skew = 0, compact }: { deadline: string | null; skew?: number; compact?: boolean }) {
  const [now, setNow] = useState(() => Date.now() + skew);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + skew), 1000);
    return () => clearInterval(t);
  }, [skew]);
  if (!deadline) return null;
  const left = Math.round((new Date(deadline).getTime() - now) / 1000);
  const overdue = left <= 0;
  const tone: Tone = overdue ? "danger" : left <= 15 ? "warning" : "accent";
  const mm = Math.floor(Math.abs(left) / 60);
  const ss = String(Math.abs(left) % 60).padStart(2, "0");
  return (
    <Badge tone={tone} className={cx("tabular", !overdue && left <= 15 && "animate-pulse")} title="Time left to acknowledge">
      <Timer className="size-3" aria-hidden />
      {overdue ? (compact ? "Escalating…" : "Overdue, escalating…") : `${mm}:${ss}${compact ? "" : " left"}`}
    </Badge>
  );
}

export function useSkew(serverNow?: string) {
  return useMemo(() => (serverNow ? new Date(serverNow).getTime() - Date.now() : 0), [serverNow]);
}

export function LeadStatus({ lead, skew }: { lead: { status: string; acknowledgedAt: string | null; ackDeadline: string | null; exhausted?: boolean }; skew?: number }) {
  if (lead.status === "CLOSED") return <Badge>Closed</Badge>;
  if (lead.acknowledgedAt) return <Badge tone="success"><CircleCheck className="size-3" />Acknowledged</Badge>;
  if (lead.exhausted) return <Badge tone="danger"><TriangleAlert className="size-3" />Unanswered</Badge>;
  return <Countdown deadline={lead.ackDeadline} skew={skew} />;
}

export const SourceBadge = ({ source }: { source: string }) => (
  <Badge tone={source === "WHATSAPP" ? "success" : source === "WEB_FORM" ? "info" : source === "CHATBOT" ? "accent" : "neutral"}>{SOURCE_LABEL[source] ?? source}</Badge>
);

// ------------------------------------------------------------------ Activity timeline (F2.7)

const ACT_ICON: Record<string, { icon: typeof Zap; tone: string }> = {
  NOTE: { icon: StickyNote, tone: "text-warning bg-warning/10" },
  CALL: { icon: PhoneCall, tone: "text-info bg-info/10" },
  STAGE_CHANGE: { icon: ArrowRight, tone: "text-accent bg-accent/10" },
  ASSIGNMENT: { icon: Shuffle, tone: "text-accent bg-accent/10" },
  ESCALATION: { icon: Flame, tone: "text-danger bg-danger/10" },
  ACK: { icon: CircleCheck, tone: "text-success bg-success/10" },
  FIELD_EDIT: { icon: Pencil, tone: "text-muted bg-surface-2" },
  MESSAGE: { icon: MessageCircle, tone: "text-success bg-success/10" },
  PAYMENT: { icon: CreditCard, tone: "text-info bg-info/10" },
  APPOINTMENT: { icon: CalendarDays, tone: "text-accent bg-accent/10" },
  SYSTEM: { icon: Info, tone: "text-muted bg-surface-2" },
};

export type ActivityRow = { id: string; type: string; actorName: string; summary: string; createdAt: string };

export function Timeline({ items, empty = "No activity yet." }: { items: ActivityRow[]; empty?: string }) {
  if (!items.length) return <p className="py-6 text-center text-[13px] text-muted">{empty}</p>;
  return (
    <ol className="relative">
      {items.map((a, i) => {
        const { icon: I, tone } = ACT_ICON[a.type] ?? ACT_ICON.SYSTEM;
        return (
          <li key={a.id} className="relative flex gap-3 pb-5 last:pb-0">
            {i < items.length - 1 && <span className="absolute left-[13px] top-7 bottom-0 w-px bg-line" aria-hidden />}
            <span className={cx("relative z-[1] flex size-7 shrink-0 items-center justify-center rounded-full ring-4 ring-surface", tone)}>
              <I className="size-3.5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className={cx("text-[13px] leading-relaxed break-words", a.type === "NOTE" ? "text-fg whitespace-pre-wrap" : "text-fg")}>{a.summary}</p>
              <p className="mt-0.5 text-xs text-subtle">
                <span className="text-muted">{a.actorName}</span> · <time dateTime={a.createdAt} title={new Date(a.createdAt).toLocaleString()}>{timeAgo(a.createdAt)}</time>
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function NoteComposer({ contactId, opportunityId, onDone }: { contactId?: string; opportunityId?: string; onDone?: () => void }) {
  const [text, setText] = useState("");
  const [type, setType] = useState<"NOTE" | "CALL">("NOTE");
  const { pending, run } = useAction();
  const submit = async () => {
    if (!text.trim()) return;
    await run(() => api("/api/activities", { body: { contactId, opportunityId, type, text } }), { success: type === "NOTE" ? "Note added" : "Call logged" }).catch(() => null);
    setText("");
    onDone?.();
  };
  return (
    <div className="rounded-lg border border-line bg-surface-2/40 p-2 focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/15 transition-all">
      <label htmlFor="note-input" className="sr-only">Add a note</label>
      <textarea
        id="note-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(); }}
        placeholder={type === "NOTE" ? "Write a note… (Ctrl+Enter to save)" : "What happened on the call?"}
        rows={2}
        className="w-full resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-subtle"
      />
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex gap-1" role="radiogroup" aria-label="Entry type">
          {(["NOTE", "CALL"] as const).map((t) => (
            <button key={t} role="radio" aria-checked={type === t} onClick={() => setType(t)} className={cx("flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors", type === t ? "bg-surface text-fg shadow-soft" : "text-muted hover:text-fg")}>
              {t === "NOTE" ? <StickyNote className="size-3.5" /> : <PhoneCall className="size-3.5" />}
              {t === "NOTE" ? "Note" : "Call log"}
            </button>
          ))}
        </div>
        <Button size="sm" variant="primary" onClick={submit} loading={pending} disabled={!text.trim()}>Save</Button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Custom fields (F2.2)

export type CustomFieldDef = { id: string; name: string; key: string; type: "TEXT" | "NUMBER" | "DATE" | "DROPDOWN" | "CHECKBOX"; options: string[]; pipelineId?: string | null };

export function CustomFieldInput({ field, value, onChange, required }: { field: CustomFieldDef; value: unknown; onChange: (v: unknown) => void; required?: boolean }) {
  const label = field.name;
  if (field.type === "CHECKBOX")
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium">{label}{required && <span className="text-danger"> *</span>}</span>
        <Checkbox checked={!!value} onChange={onChange} label="Yes" />
      </div>
    );
  return (
    <Field label={label} required={required}>
      {field.type === "DROPDOWN" ? (
        <Select value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">Not set</option>
          {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </Select>
      ) : (
        <Input
          type={field.type === "NUMBER" ? "number" : field.type === "DATE" ? "date" : "text"}
          value={value === null || value === undefined ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? null : field.type === "NUMBER" ? Number(e.target.value) : e.target.value)}
        />
      )}
    </Field>
  );
}

export function fmtCustom(field: CustomFieldDef, v: unknown) {
  if (v === undefined || v === null || v === "") return <span className="text-subtle">—</span>;
  if (field.type === "CHECKBOX") return v ? "Yes" : "No";
  if (field.type === "DATE") return new Date(`${v}T00:00`).toLocaleDateString(undefined, { dateStyle: "medium" });
  if (field.type === "NUMBER") return Number(v).toLocaleString();
  return String(v);
}

/** Inline-editable list of custom field values. */
export function CustomFieldsCard({ fields, values, onSave, requiredIds = [], canEdit }: { fields: CustomFieldDef[]; values: Record<string, unknown>; onSave: (v: Record<string, unknown>) => Promise<unknown>; requiredIds?: string[]; canEdit: boolean }) {
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState(values);
  const { pending, run } = useAction();
  useEffect(() => { if (!edit) setDraft(values); }, [values, edit]);
  if (!fields.length) return <p className="text-[13px] text-muted">No custom fields yet. Admins can add them in Settings → Custom fields.</p>;
  if (edit)
    return (
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((f) => <CustomFieldInput key={f.id} field={f} value={draft[f.key]} onChange={(v) => setDraft({ ...draft, [f.key]: v })} required={requiredIds.includes(f.id)} />)}
        </div>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => setEdit(false)}>Cancel</Button>
          <Button size="sm" variant="primary" loading={pending} onClick={async () => { await run(() => onSave(draft), { success: "Saved" }).then(() => setEdit(false)).catch(() => null); }}>Save changes</Button>
        </div>
      </div>
    );
  return (
    <div>
      <dl className="grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.id} className="min-w-0">
            <dt className="text-xs text-muted">{f.name}{requiredIds.includes(f.id) && <span className="text-danger"> *</span>}</dt>
            <dd className="text-sm mt-0.5 truncate">{fmtCustom(f, values[f.key])}</dd>
          </div>
        ))}
      </dl>
      {canEdit && <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} className="mt-4 -ml-2" onClick={() => setEdit(true)}>Edit fields</Button>}
    </div>
  );
}

// ------------------------------------------------------------------ Payments (I2)

const PAY_TONE: Record<string, Tone> = { PENDING: "warning", PAID: "success", EXPIRED: "neutral", FAILED: "danger", REFUNDED: "info", PARTIALLY_REFUNDED: "info" };
export const PaymentBadge = ({ status }: { status: string }) => <Badge tone={PAY_TONE[status]} dot>{PAYMENT_LABEL[status] ?? status}</Badge>;

export type PaymentRow = { id: string; amount: number; currency: string; description: string; status: string; url: string | null; refundedAmount: number; stripeSessionId: string | null; createdAt: string; paidAt: string | null; requestedBy?: { name: string } | null; opportunity?: { id: string; title: string } | null; contact?: { id: string; name: string } | null };

export function PaymentList({ payments, conversationContactId }: { payments: PaymentRow[]; conversationContactId?: string }) {
  if (!payments.length) return <p className="py-4 text-center text-[13px] text-muted">No payment requests yet.</p>;
  return (
    <ul className="divide-y divide-line -my-2">
      {payments.map((p) => (
        <li key={p.id} className="py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold tabular">{fmtMinor(p.amount, p.currency)}</span>
              <PaymentBadge status={p.status} />
              {p.refundedAmount > 0 && <span className="text-xs text-muted">refunded {fmtMinor(p.refundedAmount, p.currency)}</span>}
            </div>
            <p className="text-xs text-muted mt-0.5 truncate">
              {p.description}{p.requestedBy ? ` · by ${p.requestedBy.name}` : ""} · {timeAgo(p.createdAt)}
              {p.opportunity && <> · <Link className="hover:text-fg underline-offset-2 hover:underline" href={`/opportunities/${p.opportunity.id}`}>{p.opportunity.title}</Link></>}
            </p>
            {p.stripeSessionId && <p className="text-[11px] text-subtle font-mono truncate mt-0.5" title="Stripe reference">{p.stripeSessionId}</p>}
          </div>
          {p.status === "PENDING" && p.url && <PaymentLinkActions url={p.url} amount={fmtMinor(p.amount, p.currency)} contactId={conversationContactId} />}
        </li>
      ))}
    </ul>
  );
}

function PaymentLinkActions({ url, amount, contactId }: { url: string; amount: string; contactId?: string }) {
  const { pending, run } = useAction();
  return (
    <div className="flex gap-1.5 shrink-0">
      <Button size="sm" variant="ghost" icon={<Copy className="size-3.5" />} onClick={() => { navigator.clipboard.writeText(url); toast.success("Payment link copied"); }}>Copy</Button>
      <a href={url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] text-muted hover:text-fg hover:bg-surface-2"><ExternalLink className="size-3.5" />Open</a>
      {contactId && (
        <Button size="sm" variant="secondary" loading={pending} icon={<Send className="size-3.5" />} onClick={() =>
          run(async () => {
            const c = await api<{ id: string }>(`/api/contacts/${contactId}/conversation`, { body: {} });
            await api(`/api/conversations/${c.id}/messages`, { body: { text: `Here is your secure payment link for ${amount}: ${url}` } });
            refresh("/api/");
          }, { success: "Link sent on WhatsApp" }).catch(() => null)
        }>WhatsApp</Button>
      )}
    </div>
  );
}

export function PaymentModal({ open, onClose, opportunityId, defaultAmount, defaultCurrency, title }: { open: boolean; onClose: () => void; opportunityId: string; defaultAmount?: number | null; defaultCurrency?: string; title?: string }) {
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency ?? "USD");
  const [description, setDescription] = useState("");
  const { pending, run } = useAction();
  useEffect(() => {
    if (open) { setAmount(defaultAmount ? String(defaultAmount) : ""); setCurrency(defaultCurrency ?? "USD"); setDescription(title ? `Deposit: ${title}` : ""); }
  }, [open, defaultAmount, defaultCurrency, title]);
  const submit = async () => {
    await run(() => api("/api/payments", { body: { opportunityId, amount: Number(amount), currency, description } }), { success: "Payment link created" })
      .then(() => { refresh("/api/"); onClose(); })
      .catch(() => null);
  };
  return (
    <Modal open={open} onClose={onClose} title="Request a payment" description="Creates a secure Stripe Checkout link. Card details are entered only on Stripe's page."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={pending} onClick={submit} disabled={!amount || !description}>Create link</Button></>}>
      <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
        <Field label="Amount" required><Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></Field>
        <Field label="Currency">
          <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {["USD", "PKR", "EUR", "GBP", "AED"].map((c) => <option key={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Description" required className="sm:col-span-2" hint="Shown to the customer on the Stripe checkout page."><Input value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      </div>
      <p className="mt-4 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">Test mode: pay with card <span className="font-mono text-fg">4242 4242 4242 4242</span>, any future date and any CVC. The status updates here automatically when Stripe confirms it.</p>
    </Modal>
  );
}

// ------------------------------------------------------------------ Appointments (I3)

type UserRow = { id: string; name: string; calendar: "CONNECTED" | "NOT_CONNECTED" | "NEEDS_RECONNECT"; timezone: string; active: boolean };

export function BookingModal({ open, onClose, contactId, opportunityId, contactName, appointment }: {
  open: boolean; onClose: () => void; contactId: string; opportunityId?: string | null; contactName?: string;
  appointment?: { id: string; userId: string; title: string; startUtc: string; endUtc: string; timezone: string } | null;
}) {
  const me = useMe();
  const { data: users } = useApi<UserRow[]>(open ? "/api/users" : null);
  const reschedule = !!appointment;
  const [userId, setUserId] = useState("");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState(30);
  const [tz, setTz] = useState(me.timezone);
  const [notes, setNotes] = useState("");
  const [conflict, setConflict] = useState<{ start: string; end: string }[] | null>(null);
  const { pending, run } = useAction();

  useEffect(() => {
    if (!open) return;
    setConflict(null);
    if (appointment) {
      const local = utcToZonedLocal(appointment.startUtc, appointment.timezone);
      setUserId(appointment.userId); setTitle(appointment.title); setDate(local.slice(0, 10)); setTime(local.slice(11, 16)); setTz(appointment.timezone);
      setDuration(Math.round((new Date(appointment.endUtc).getTime() - new Date(appointment.startUtc).getTime()) / 60000));
    } else {
      const d = new Date(Date.now() + 86400000);
      setDate(d.toISOString().slice(0, 10)); setTitle(contactName ? `Consultation with ${contactName}` : "Consultation"); setUserId(""); setTz(me.timezone); setNotes("");
    }
  }, [open, appointment, contactName, me.timezone]);

  useEffect(() => {
    if (!userId && users) {
      const mine = users.find((u) => u.id === me.id && u.calendar === "CONNECTED");
      const any = users.find((u) => u.active && u.calendar === "CONNECTED");
      if (mine || any) setUserId((mine ?? any)!.id);
    }
  }, [users, userId, me.id]);

  const employee = users?.find((u) => u.id === userId);
  const busyUrl = open && employee?.calendar === "CONNECTED" && date ? `/api/calendar/busy?userId=${userId}&date=${date}&timezone=${encodeURIComponent(tz)}` : null;
  const { data: busy, error: busyErr, isLoading: busyLoading } = useApi<{ busy: { start: string; end: string }[] }>(busyUrl, { shouldRetryOnError: false });

  const start = `${date}T${time}`;
  const submit = async (force = false) => {
    const body = { start, durationMin: duration, timezone: tz, force };
    try {
      await run(
        () => reschedule
          ? api(`/api/appointments/${appointment!.id}`, { method: "PATCH", body })
          : api("/api/appointments", { body: { ...body, contactId, opportunityId, userId, title, notes } }),
        { success: reschedule ? "Appointment rescheduled in Google Calendar" : "Booked. The event is now in Google Calendar", silent: true },
      );
      refresh("/api/");
      onClose();
    } catch (e) {
      const data = (e as { data?: { conflict?: boolean; busy?: { start: string; end: string }[] } }).data;
      if (data?.conflict) setConflict(data.busy ?? []);
      else toast.error((e as Error).message);
    }
  };

  const zones = useMemo(() => {
    const base = ["Asia/Karachi", "Asia/Dubai", "Europe/London", "America/New_York", "America/Los_Angeles", "UTC"];
    return [...new Set([me.timezone, tz, ...base])];
  }, [me.timezone, tz]);

  return (
    <Modal open={open} onClose={onClose} size="lg" title={reschedule ? "Reschedule appointment" : "Book an appointment"} description="Creates a real event on the employee's Google Calendar."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          {conflict ? (
            <Button variant="danger" loading={pending} onClick={() => submit(true)}>Book anyway</Button>
          ) : (
            <Button variant="primary" loading={pending} onClick={() => submit(false)} disabled={!userId || !date || !time || employee?.calendar !== "CONNECTED"}>
              {reschedule ? "Save new time" : "Book appointment"}
            </Button>
          )}
        </>
      }>
      <div className="grid gap-4 sm:grid-cols-2">
        {!reschedule && (
          <Field label="Employee" className="sm:col-span-2" hint={employee && employee.calendar !== "CONNECTED" ? undefined : "Only employees with a connected Google Calendar can be booked."}>
            <Select value={userId} onChange={(e) => { setUserId(e.target.value); setConflict(null); }}>
              <option value="">Choose…</option>
              {users?.filter((u) => u.active).map((u) => (
                <option key={u.id} value={u.id} disabled={u.calendar !== "CONNECTED"}>
                  {u.name}{u.calendar === "NOT_CONNECTED" ? " (calendar not connected)" : u.calendar === "NEEDS_RECONNECT" ? " (needs to reconnect)" : ""}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {users && !users.some((u) => u.calendar === "CONNECTED") && (
          <p className="sm:col-span-2 rounded-lg border border-warning/25 bg-warning/8 px-3 py-2 text-[13px] text-warning">
            No one has connected Google Calendar yet. Each employee connects their own in <Link href="/settings/profile" className="underline">Settings → Profile</Link>.
          </p>
        )}
        {!reschedule && <Field label="Title" className="sm:col-span-2"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>}
        <Field label="Date"><Input type="date" value={date} onChange={(e) => { setDate(e.target.value); setConflict(null); }} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start"><Input type="time" value={time} onChange={(e) => { setTime(e.target.value); setConflict(null); }} /></Field>
          <Field label="Duration">
            <Select value={duration} onChange={(e) => { setDuration(Number(e.target.value)); setConflict(null); }}>
              {[15, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m} min</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Time zone" className="sm:col-span-2" hint={`Stored as an exact UTC time. You see it in your zone: ${tzAbbr(me.timezone)}.`}>
          <Select value={tz} onChange={(e) => { setTz(e.target.value); setConflict(null); }}>
            {zones.map((z) => <option key={z} value={z}>{z.replace("_", " ")} ({tzAbbr(z)})</option>)}
          </Select>
        </Field>
        {!reschedule && <Field label="Notes" className="sm:col-span-2"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" /></Field>}
      </div>

      {employee?.calendar === "CONNECTED" && date && (
        <div className="mt-5 rounded-lg border border-line p-3.5">
          <p className="text-xs font-medium text-muted mb-2 flex items-center gap-2">{employee.name}&apos;s busy times that day {busyLoading && <Spinner className="size-3" />}</p>
          {busyErr ? (
            <p className="text-[13px] text-danger">{busyErr.message}</p>
          ) : busy?.busy.length ? (
            <div className="flex flex-wrap gap-1.5">
              {busy.busy.map((b, i) => <Badge key={i} tone="warning"><Clock className="size-3" />{fmtInTz(b.start, tz, { dateStyle: undefined, timeStyle: "short" })}–{fmtInTz(b.end, tz, { dateStyle: undefined, timeStyle: "short" })}</Badge>)}
            </div>
          ) : busy ? <p className="text-[13px] text-success">Free all day</p> : null}
        </div>
      )}
      {conflict && (
        <div role="alert" className="mt-4 flex gap-2.5 rounded-lg border border-danger/25 bg-danger/8 p-3.5 text-[13px] text-danger">
          <TriangleAlert className="size-4 shrink-0 mt-0.5" />
          <span>This overlaps {conflict.length} busy slot(s) on {employee?.name ?? "the employee"}&apos;s calendar. Pick another time, or choose <b>Book anyway</b>.</span>
        </div>
      )}
    </Modal>
  );
}

export type AppointmentRow = { id: string; title: string; startUtc: string; endUtc: string; timezone: string; status: string; userId: string; googleLink?: string | null; user?: { id: string; name: string }; contact?: { id: string; name: string } };

export function AppointmentList({ items, contactId, onChanged }: { items: AppointmentRow[]; contactId: string; onChanged?: () => void }) {
  const me = useMe();
  const [edit, setEdit] = useState<AppointmentRow | null>(null);
  const { run } = useAction();
  if (!items.length) return <p className="py-4 text-center text-[13px] text-muted">No appointments yet.</p>;
  return (
    <>
      <ul className="divide-y divide-line -my-2">
        {items.map((a) => {
          const past = new Date(a.endUtc) < new Date();
          return (
            <li key={a.id} className="py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cx("text-sm font-medium", a.status === "CANCELLED" && "line-through text-muted")}>{a.title}</span>
                  {a.status === "CANCELLED" ? <Badge tone="neutral">Cancelled</Badge> : past ? <Badge>Done</Badge> : <Badge tone="accent" dot>Upcoming</Badge>}
                </div>
                <p className="text-xs text-muted mt-0.5">
                  {fmtInTz(a.startUtc, me.timezone)} {tzAbbr(me.timezone, new Date(a.startUtc))}
                  {a.timezone !== me.timezone && <span className="text-subtle"> · {fmtInTz(a.startUtc, a.timezone, { dateStyle: undefined, timeStyle: "short" })} {tzAbbr(a.timezone, new Date(a.startUtc))}</span>}
                  {a.user && ` · with ${a.user.name}`}
                </p>
              </div>
              {a.status === "SCHEDULED" && !past && (
                <div className="flex gap-1.5 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => setEdit(a)}>Reschedule</Button>
                  <Button size="sm" variant="ghost" className="text-danger hover:text-danger" onClick={() => {
                    if (confirm(`Cancel "${a.title}"? The Google Calendar event will be deleted.`))
                      run(() => api(`/api/appointments/${a.id}`, { method: "DELETE" }), { success: "Appointment cancelled" }).then(() => { refresh("/api/"); onChanged?.(); }).catch(() => null);
                  }}>Cancel</Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <BookingModal open={!!edit} onClose={() => setEdit(null)} contactId={contactId} appointment={edit} />
    </>
  );
}

// ------------------------------------------------------------------ Messaging thread (I1)

type Msg = { id: string; direction: "IN" | "OUT"; body: string; status: string; errorMessage: string | null; errorCode: string | null; sentByName: string | null; createdAt: string };
type Conv = {
  id: string; whatsappConnected: boolean; windowOpen: boolean;
  contact: { id: string; name: string; phone: string | null; optedOut: boolean; optOutReason: string | null };
  assignee: { id: string; name: string } | null; messages: Msg[];
};

const MSG_STATUS: Record<string, { icon: typeof Check; label: string; cls: string }> = {
  QUEUED: { icon: Clock, label: "Sending", cls: "text-subtle" },
  SENT: { icon: Check, label: "Sent", cls: "text-subtle" },
  DELIVERED: { icon: CheckCheck, label: "Delivered", cls: "text-subtle" },
  READ: { icon: CheckCheck, label: "Read", cls: "text-info" },
  FAILED: { icon: CircleX, label: "Failed", cls: "text-danger" },
};

export function Thread({ conversationId, className, header }: { conversationId: string; className?: string; header?: boolean }) {
  const { data, error, mutate } = useApi<Conv>(`/api/conversations/${conversationId}`, { live: 3000 });
  const [text, setText] = useState("");
  const { pending, run } = useAction();
  const endRef = useState<HTMLDivElement | null>(null);
  const count = data?.messages.length ?? 0;
  useEffect(() => { endRef[0]?.scrollIntoView({ block: "end" }); }, [count, endRef]);

  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    await run(() => api(`/api/conversations/${conversationId}/messages`, { body: { text: t } })).catch(() => setText(t));
    mutate();
  };
  const retry = (id: string) => run(() => api(`/api/messages/${id}/retry`, { body: {} }), { success: "Retrying…" }).then(() => mutate()).catch(() => null);

  if (error) return <p className="p-6 text-sm text-danger">{error.message}</p>;
  if (!data) return <div className="flex flex-1 items-center justify-center p-10"><Spinner /></div>;
  const blocked = data.contact.optedOut ? `${data.contact.name} opted out of messages${data.contact.optOutReason ? ` (${data.contact.optOutReason})` : ""}. Messaging is disabled until they opt back in.` : !data.contact.phone ? "This contact has no phone number." : !data.whatsappConnected ? "WhatsApp isn't connected yet. An admin can connect it in Settings → Integrations." : null;

  return (
    <div className={cx("flex min-h-0 flex-col", className)}>
      {header && (
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <Avatar name={data.contact.name} />
          <div className="min-w-0 flex-1">
            <Link href={`/contacts/${data.contact.id}`} className="block text-sm font-semibold hover:underline truncate">{data.contact.name}</Link>
            <p className="text-xs text-muted truncate">{data.contact.phone ?? "No phone"} · Owner: {data.assignee?.name ?? "Unassigned"}</p>
          </div>
          <Badge tone="success">WhatsApp</Badge>
        </div>
      )}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2 bg-surface-2/30">
        {!data.messages.length && <p className="py-10 text-center text-[13px] text-muted">No messages yet.</p>}
        {data.messages.map((m) => {
          const s = MSG_STATUS[m.status];
          const out = m.direction === "OUT";
          return (
            <div key={m.id} className={cx("flex", out ? "justify-end" : "justify-start")}>
              <div className={cx("max-w-[85%] sm:max-w-[70%] rounded-lg px-3.5 py-2 text-sm shadow-soft", out ? "bg-accent text-accent-fg rounded-br-md" : "bg-surface border border-line rounded-bl-md", m.status === "FAILED" && "bg-danger/10 text-fg border border-danger/30")}>
                <p className="whitespace-pre-wrap break-words leading-relaxed">{m.body}</p>
                <div className={cx("mt-1 flex items-center justify-end gap-1 text-[10.5px]", out && m.status !== "FAILED" ? "text-accent-fg/70" : "text-subtle")}>
                  {out && m.sentByName && <span>{m.sentByName} ·</span>}
                  <time dateTime={m.createdAt}>{new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                  {out && s && <span className="inline-flex items-center gap-0.5" title={s.label}><s.icon className={cx("size-3", m.status === "FAILED" ? "text-danger" : out ? "" : s.cls)} aria-hidden /><span className="sr-only sm:not-sr-only">{s.label}</span></span>}
                </div>
                {m.status === "FAILED" && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 border-t border-danger/20 pt-1.5">
                    <span className="text-xs text-danger">{m.errorMessage ?? "Delivery failed"}</span>
                    <button onClick={() => retry(m.id)} className="inline-flex items-center gap-1 text-xs font-medium text-danger underline underline-offset-2"><RotateCw className="size-3" />Retry</button>
                  </div>
                )}
                {m.status === "QUEUED" && m.errorMessage && <p className="mt-1 text-[11px] opacity-80">{m.errorMessage}</p>}
              </div>
            </div>
          );
        })}
        <div ref={(el) => { endRef[1](el); }} />
      </div>
      <div className="border-t border-line p-3">
        {blocked ? (
          <p className="flex items-start gap-2 rounded-lg bg-surface-2 px-3 py-2.5 text-[13px] text-muted"><Ban className="size-4 shrink-0 mt-0.5" />{blocked}</p>
        ) : (
          <>
            {!data.windowOpen && <p className="mb-2 text-xs text-warning">No customer message in the last 24h. WhatsApp may reject free-form replies until they write again.</p>}
            <div className="flex items-end gap-2">
              <label htmlFor={`compose-${conversationId}`} className="sr-only">Message</label>
              <textarea
                id={`compose-${conversationId}`}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                rows={1}
                placeholder="Type a WhatsApp message…"
                className="max-h-32 min-h-10 flex-1 resize-none rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-accent focus:ring-3 focus:ring-accent/15"
              />
              <Button variant="primary" size="icon" className="size-10 rounded-lg" onClick={send} loading={pending} disabled={!text.trim()} aria-label="Send message">
                {!pending && <Send className="size-4" />}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function Section({ title, action, children, className }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-lg border border-line bg-surface shadow-soft", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {action && <div className="flex items-center gap-2">{action}</div>}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export const fmtWhen = fmtDateTime;
