"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "next-themes";
import {
  Search, LayoutDashboard, Zap, LifeBuoy, MessageCircle, Users, Building, SquareKanban, CreditCard, CalendarDays,
  ScrollText, Settings, Plus, FileText, Moon, Sun, CornerDownLeft, UserRound,
} from "lucide-react";
import { useApi } from "@/lib/client";
import { useMe } from "./me";
import { Avatar, cx } from "./ui";

type Item = { id: string; label: string; hint?: string; icon: React.ReactNode; group: string; run: () => void };

export function useCommandMenu() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return { open, setOpen };
}

export function CommandMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const me = useMe();
  const { resolvedTheme, setTheme } = useTheme();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 180); return () => clearTimeout(t); }, [q]);
  useEffect(() => { if (open) { setQ(""); setActive(0); setTimeout(() => inputRef.current?.focus(), 20); } }, [open]);

  const { data: contacts } = useApi<{ rows: { id: string; name: string; email: string | null; phone: string | null }[] }>(
    open && debounced.length >= 2 && me.can("crm.view") ? `/api/contacts?pageSize=6&q=${encodeURIComponent(debounced)}` : null,
  );

  const go = (href: string) => () => { onClose(); router.push(href); };
  const items = useMemo<Item[]>(() => {
    const nav: Item[] = [
      { id: "dash", label: "Dashboard", icon: <LayoutDashboard className="size-4" />, group: "Go to", run: go("/dashboard") },
      { id: "leads", label: "Leads", icon: <Zap className="size-4" />, group: "Go to", run: go("/leads") },
      { id: "rec", label: "Recovery queue", icon: <LifeBuoy className="size-4" />, group: "Go to", run: go("/recovery") },
      { id: "inbox", label: "Inbox", icon: <MessageCircle className="size-4" />, group: "Go to", run: go("/inbox") },
      ...(me.can("crm.view") ? [
        { id: "contacts", label: "Contacts", icon: <Users className="size-4" />, group: "Go to", run: go("/contacts") },
        { id: "companies", label: "Companies", icon: <Building className="size-4" />, group: "Go to", run: go("/companies") },
        { id: "pipeline", label: "Pipeline", icon: <SquareKanban className="size-4" />, group: "Go to", run: go("/pipeline") },
        { id: "payments", label: "Payments", icon: <CreditCard className="size-4" />, group: "Go to", run: go("/payments") },
        { id: "appts", label: "Appointments", icon: <CalendarDays className="size-4" />, group: "Go to", run: go("/appointments") },
      ] : []),
      ...(me.can("audit.view") ? [{ id: "audit", label: "Audit log", icon: <ScrollText className="size-4" />, group: "Go to", run: go("/audit") }] : []),
      { id: "settings", label: "Settings", icon: <Settings className="size-4" />, group: "Go to", run: go("/settings") },
    ];
    const actions: Item[] = [
      ...(me.can("crm.create") ? [{ id: "newlead", label: "Create a lead", hint: "Assigned round-robin", icon: <Plus className="size-4" />, group: "Actions", run: go("/leads?new=1") }] : []),
      { id: "form", label: "Open public lead form", icon: <FileText className="size-4" />, group: "Actions", run: () => { onClose(); window.open(`/f/${me.workspace.slug}`, "_blank"); } },
      { id: "profile", label: "Profile & calendar", icon: <UserRound className="size-4" />, group: "Actions", run: go("/settings/profile") },
      {
        id: "theme", label: resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode",
        icon: resolvedTheme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />, group: "Actions",
        run: () => { setTheme(resolvedTheme === "dark" ? "light" : "dark"); onClose(); },
      },
    ];
    const needle = q.toLowerCase().trim();
    const filtered = [...nav, ...actions].filter((i) => !needle || i.label.toLowerCase().includes(needle));
    const people: Item[] = (contacts?.rows ?? []).map((c) => ({
      id: `c-${c.id}`, label: c.name, hint: c.email ?? c.phone ?? undefined, icon: <Avatar name={c.name} size="sm" />, group: "Contacts", run: go(`/contacts/${c.id}`),
    }));
    return [...people, ...filtered];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, contacts, resolvedTheme, me]);

  useEffect(() => { setActive(0); }, [q, contacts]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); items[active]?.run(); }
    else if (e.key === "Escape") onClose();
  };

  const groups = [...new Set(items.map((i) => i.group))];
  let idx = -1;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal="true" aria-label="Command menu" onKeyDown={onKey}
        className="relative w-full max-w-xl overflow-hidden rounded-lg border border-line bg-surface shadow-modal animate-pop">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="size-4 text-subtle" aria-hidden />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search contacts, pages and actions…"
            className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-subtle"
            role="combobox"
            aria-expanded="true"
            aria-controls="cmd-list"
            aria-activedescendant={items[active] ? `cmd-${items[active].id}` : undefined}
          />
          <kbd className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">Esc</kbd>
        </div>
        <div ref={listRef} id="cmd-list" role="listbox" className="max-h-[52vh] overflow-y-auto p-2">
          {!items.length && <p className="px-3 py-10 text-center text-sm text-muted">No results for “{q}”</p>}
          {groups.map((g) => (
            <div key={g} className="mb-1">
              <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-subtle">{g}</p>
              {items.filter((i) => i.group === g).map((i) => {
                idx++;
                const my = idx;
                return (
                  <button
                    key={i.id}
                    id={`cmd-${i.id}`}
                    data-idx={my}
                    role="option"
                    aria-selected={active === my}
                    onMouseMove={() => setActive(my)}
                    onClick={i.run}
                    className={cx("flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors", active === my ? "bg-accent/10 text-fg" : "text-fg/90")}
                  >
                    <span className={cx("flex size-7 items-center justify-center rounded-lg", active === my ? "text-accent" : "text-muted")}>{i.icon}</span>
                    <span className="min-w-0 flex-1 truncate">{i.label}{i.hint && <span className="ml-2 text-xs text-subtle">{i.hint}</span>}</span>
                    {active === my && <CornerDownLeft className="size-3.5 text-subtle" aria-hidden />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 border-t border-line bg-surface-2/50 px-4 py-2 text-[11px] text-subtle">
          <span><kbd className="font-sans">↑↓</kbd> navigate</span><span><kbd className="font-sans">↵</kbd> open</span><span className="ml-auto">Dastak</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
