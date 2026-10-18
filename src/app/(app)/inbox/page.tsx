"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import { MessageCircle, Search, ChevronLeft, Info } from "lucide-react";
import { useApi, timeAgo } from "@/lib/client";
import { PageHeader, Card, Input, Avatar, EmptyState, Skeleton, cx, Badge } from "@/components/ui";
import { Thread } from "@/components/crm";

type Conv = {
  id: string; unread: number; lastMessageAt: string;
  contact: { id: string; name: string; phone: string | null; optedOut: boolean };
  assignee: { id: string; name: string } | null;
  last: { body: string; direction: string; status: string; createdAt: string } | null;
};

export default function InboxPage() {
  return <Suspense><Inbox /></Suspense>;
}

function Inbox() {
  const sp = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState("");
  const selected = sp.get("c");
  const { data, isLoading } = useApi<Conv[]>(`/api/conversations${q ? `?q=${encodeURIComponent(q)}` : ""}`, { live: 3000 });
  const select = (id: string | null) => router.replace(id ? `/inbox?c=${id}` : "/inbox", { scroll: false });

  return (
    <div className="animate-fade-in">
      <PageHeader title="Inbox" description="WhatsApp conversations with your customers. New messages appear automatically." />
      <Card padded={false} className="grid h-[calc(100dvh-220px)] min-h-[480px] overflow-hidden md:grid-cols-[320px_1fr]">
        <div className={cx("flex min-h-0 flex-col border-line md:border-r", selected && "hidden md:flex")}>
          <div className="border-b border-line p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
              <Input aria-label="Search conversations" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoading && !data && <div className="p-3 space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>}
            {data && !data.length && <EmptyState icon={<MessageCircle className="size-5" />} title="No conversations yet" description="When a customer messages your WhatsApp number, the chat shows up here and a lead is created." />}
            <ul>
              {data?.map((c) => (
                <li key={c.id}>
                  <button onClick={() => select(c.id)} className={cx("flex w-full items-start gap-3 px-3.5 py-3 text-left transition-colors border-l-2", selected === c.id ? "bg-surface-2 border-accent" : "border-transparent hover:bg-surface-2/50")}>
                    <Avatar name={c.contact.name} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className={cx("truncate text-[13.5px]", c.unread ? "font-semibold" : "font-medium")}>{c.contact.name}</span>
                        <span className="shrink-0 text-[11px] text-subtle">{timeAgo(c.lastMessageAt)}</span>
                      </span>
                      <span className="flex items-center justify-between gap-2 mt-0.5">
                        <span className={cx("truncate text-xs", c.unread ? "text-fg" : "text-muted", c.last?.status === "FAILED" && "text-danger")}>
                          {c.last ? `${c.last.direction === "OUT" ? "You: " : ""}${c.last.status === "FAILED" ? "⚠ Failed: " : ""}${c.last.body}` : "No messages"}
                        </span>
                        {c.unread > 0 && <span className="shrink-0 rounded-full bg-accent px-1.5 text-[10.5px] font-semibold text-accent-fg tabular">{c.unread}</span>}
                      </span>
                      <span className="mt-1 flex items-center gap-1.5 text-[11px] text-subtle">{c.assignee ? c.assignee.name : "Unassigned"}{c.contact.optedOut && <Badge tone="danger">Opted out</Badge>}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <p className="flex gap-2 border-t border-line p-3 text-[11.5px] leading-relaxed text-muted"><Info className="size-3.5 shrink-0 mt-0.5" />WhatsApp test numbers can only message phone numbers verified in the Meta dashboard.</p>
        </div>
        <div className={cx("min-h-0 flex-col", selected ? "flex" : "hidden md:flex")}>
          {selected ? (
            <>
              <button onClick={() => select(null)} className="flex items-center gap-1 border-b border-line px-3 py-2 text-[13px] text-muted md:hidden"><ChevronLeft className="size-4" />All conversations</button>
              <Thread key={selected} conversationId={selected} header className="flex-1" />
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center"><EmptyState icon={<MessageCircle className="size-5" />} title="Select a conversation" description="Pick a chat on the left to read and reply." /></div>
          )}
        </div>
      </Card>
    </div>
  );
}
