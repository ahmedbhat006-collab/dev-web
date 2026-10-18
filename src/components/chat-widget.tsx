"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, CircleCheck } from "lucide-react";
import { api } from "@/lib/client";
import { cx } from "./ui";

type Turn = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = ["How much does a 5 kW system cost?", "Do you work in Lahore?", "I'd like a free site survey"];

/** Floating 24/7 AI assistant for the public contact page. */
export function ChatWidget({ slug, launcherLabel = "Chat with us", preview }: { slug: string; launcherLabel?: string; preview?: boolean }) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<{ company: string; online: boolean } | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captured, setCaptured] = useState<string | null>(null);
  const chatId = useRef("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    chatId.current = crypto.randomUUID();
    api<{ company: string; online: boolean }>(`/api/public/chat/${slug}`).then(setInfo).catch(() => null);
  }, [slug]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [turns, busy, open]);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50); }, [open]);

  const send = async (msg: string) => {
    const t = msg.trim();
    if (!t || busy) return;
    const next: Turn[] = [...turns, { role: "user", content: t }];
    setTurns(next);
    setText("");
    setError(null);
    setBusy(true);
    try {
      const r = await api<{ reply: string; leadCaptured: boolean; assignedTo: string | null }>(`/api/public/chat/${slug}`, {
        body: { chatId: chatId.current, messages: next.slice(-30) },
      });
      setTurns([...next, { role: "assistant", content: r.reply }]);
      if (r.leadCaptured) setCaptured(r.assignedTo ?? "our team");
    } catch (e) {
      setError((e as Error).message);
      setTurns(turns);
      setText(t);
    } finally {
      setBusy(false);
    }
  };
  const submit = (e: FormEvent) => { e.preventDefault(); send(text); };

  const company = info?.company ?? "us";
  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2.5 rounded-full bg-ink py-3 pl-4 pr-5 text-sm font-medium text-ink-fg shadow-float transition-transform hover:-translate-y-0.5 active:scale-[0.98]"
          aria-label="Open chat assistant"
        >
          <MessageCircle className="size-5" />
          {launcherLabel}
          <span className="ml-1 flex items-center gap-1 text-[11px] font-normal opacity-70"><span className="size-1.5 rounded-full bg-success" />24/7</span>
        </button>
      )}
      {open && (
        <section
          role="dialog"
          aria-label={`Chat with ${company}`}
          className="fixed inset-x-0 bottom-0 z-50 flex h-[85dvh] flex-col border border-line bg-surface shadow-modal animate-pop sm:inset-x-auto sm:bottom-5 sm:right-5 sm:h-[600px] sm:max-h-[calc(100dvh-2.5rem)] sm:w-[380px] sm:rounded-lg rounded-t-lg"
        >
          <header className="flex items-center gap-3 border-b border-line px-4 py-3">
            <span className="flex size-9 items-center justify-center rounded-md bg-ink text-ink-fg"><MessageCircle className="size-4" /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{company} assistant</p>
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <span className={cx("size-1.5 rounded-full", info?.online === false ? "bg-subtle" : "bg-success")} />
                {info?.online === false ? "Offline: please use the form" : "Online 24/7 · replies in seconds"}
              </p>
            </div>
            <button onClick={() => setOpen(false)} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Close chat"><X className="size-4" /></button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto bg-surface-2/40 px-4 py-4" aria-live="polite">
            {preview && (
              <p className="rounded-md border border-line bg-surface px-3 py-2 text-[11.5px] text-muted">
                Preview: this is exactly what customers see on your public lead form. Leads it creates are real and get assigned.
              </p>
            )}
            <Bubble role="assistant">Hi! I&apos;m the {company} assistant. Ask me about our services, pricing or areas, or I can arrange a call back from our team.</Bubble>
            {!turns.length && info?.online !== false && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)} className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-muted hover:border-line-strong hover:text-fg">{s}</button>
                ))}
              </div>
            )}
            {turns.map((t, i) => <Bubble key={i} role={t.role}>{t.content}</Bubble>)}
            {busy && (
              <div className="flex gap-1 px-1 py-2" aria-label="Assistant is typing">
                {[0, 1, 2].map((i) => <span key={i} className="size-1.5 animate-bounce rounded-full bg-subtle" style={{ animationDelay: `${i * 120}ms` }} />)}
              </div>
            )}
            {captured && (
              <p className="flex items-center gap-2 rounded-md border border-success/25 bg-success/8 px-3 py-2 text-xs text-success">
                <CircleCheck className="size-3.5 shrink-0" />Request received. {captured} from our team will contact you.
              </p>
            )}
            {error && <p role="alert" className="rounded-md border border-danger/20 bg-danger/8 px-3 py-2 text-xs text-danger">{error}</p>}
            <div ref={endRef} />
          </div>

          <form onSubmit={submit} className="flex items-end gap-2 border-t border-line p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <label htmlFor="chat-input" className="sr-only">Message</label>
            <textarea
              id="chat-input"
              ref={inputRef}
              rows={1}
              value={text}
              disabled={info?.online === false}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }}
              placeholder={info?.online === false ? "Assistant offline" : "Type your question…"}
              className="max-h-28 min-h-10 flex-1 resize-none rounded-md border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-3 focus:ring-accent/15 disabled:opacity-60"
            />
            <button type="submit" disabled={busy || !text.trim()} className="flex size-10 items-center justify-center rounded-md bg-ink text-ink-fg disabled:opacity-40" aria-label="Send">
              <Send className="size-4" />
            </button>
          </form>
          <p className="pb-2 text-center text-[10.5px] text-subtle">AI assistant · may make mistakes · a human follows up on every request</p>
        </section>
      )}
    </>
  );
}

function Bubble({ role, children }: { role: "user" | "assistant"; children: React.ReactNode }) {
  return (
    <div className={cx("flex", role === "user" ? "justify-end" : "justify-start")}>
      <p className={cx("max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-3.5 py-2 text-sm leading-relaxed", role === "user" ? "bg-ink text-ink-fg rounded-br-sm" : "border border-line bg-surface rounded-bl-sm")}>
        {children}
      </p>
    </div>
  );
}
