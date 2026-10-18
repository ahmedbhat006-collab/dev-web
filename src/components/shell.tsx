"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  LayoutDashboard, Zap, LifeBuoy, MessageCircle, Users, Building, SquareKanban, CreditCard, CalendarDays,
  ScrollText, Settings, Bell, Menu, LogOut, ChevronDown, Check, X, UserRound, FileText, Search,
} from "lucide-react";
import { CommandMenu, useCommandMenu } from "./command-menu";
import { preload } from "swr";
import { ChatWidget } from "./chat-widget";
import { useMe } from "./me";
import { Brand, BrandMark } from "./brand";
import { ThemeToggle, ThemeSegmented } from "./theme-toggle";
import { Avatar, Popover, MenuItem, cx, Dot, Tone } from "./ui";
import { api, useApi, timeAgo, refresh } from "@/lib/client";
import { STATUS_LABEL } from "@/lib/labels";

type NavItem = { href: string; label: string; icon: typeof Zap; show?: boolean; badge?: number };

export const STATUS_TONE: Record<string, Tone> = { AVAILABLE: "success", BUSY: "warning", ON_LEAVE: "info", OFFLINE: "neutral" };

type Notif = { rows: { id: string; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string }[]; unread: number; status: string; pendingLeads: number; recovery: number };

export function Shell({ children }: { children: ReactNode }) {
  const me = useMe();
  const path = usePathname();
  const [drawer, setDrawer] = useState(false);
  const cmd = useCommandMenu();
  const { data: notif } = useApi<Notif>("/api/notifications", { live: 4000 });

  useEffect(() => setDrawer(false), [path]);

  // Start loading a tab's data as soon as the pointer reaches it, so the page opens with data ready.
  const warm = (href: string) => {
    const keys: Record<string, string> = {
      "/dashboard": "/api/dashboard",
      "/leads": `/api/leads?scope=${me.seesAll ? "all" : "mine"}&status=active&page=1`,
      "/recovery": "/api/leads/recovery",
      "/inbox": "/api/conversations",
      "/contacts": "/api/contacts?page=1",
      "/companies": "/api/companies?page=1",
      "/pipeline": "/api/pipelines",
      "/payments": "/api/payments?page=1",
      "/appointments": "/api/appointments?range=upcoming",
      "/audit": "/api/audit?page=1",
    };
    const k = keys[href];
    if (k) Promise.resolve(preload(k, (u: string) => api(u))).catch(() => null);
  };

  const sections: { title?: string; items: NavItem[] }[] = [
    {
      items: [
        { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { href: "/leads", label: "Leads", icon: Zap, badge: notif?.pendingLeads },
        { href: "/recovery", label: "Recovery queue", icon: LifeBuoy, badge: notif?.recovery },
        { href: "/inbox", label: "Inbox", icon: MessageCircle },
      ],
    },
    {
      title: "CRM",
      items: [
        { href: "/contacts", label: "Contacts", icon: Users, show: me.can("crm.view") },
        { href: "/companies", label: "Companies", icon: Building, show: me.can("crm.view") },
        { href: "/pipeline", label: "Pipeline", icon: SquareKanban, show: me.can("crm.view") },
        { href: "/payments", label: "Payments", icon: CreditCard, show: me.can("crm.view") },
        { href: "/appointments", label: "Appointments", icon: CalendarDays, show: me.can("crm.view") },
      ],
    },
    {
      title: "Workspace",
      items: [
        { href: "/audit", label: "Audit log", icon: ScrollText, show: me.can("audit.view") },
        { href: "/settings", label: "Settings", icon: Settings },
      ],
    },
  ];

  const nav = (
    <nav className="flex flex-col gap-5 px-3" aria-label="Main">
      {sections.map((s, i) => (
        <div key={i}>
          {s.title && <p className="px-2.5 mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-subtle">{s.title}</p>}
          <ul className="flex flex-col gap-0.5">
            {s.items.filter((x) => x.show !== false).map((it) => {
              const active = path === it.href || path.startsWith(it.href + "/");
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    onMouseEnter={() => warm(it.href)}
                    onFocus={() => warm(it.href)}
                    onTouchStart={() => warm(it.href)}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "group relative flex items-center gap-2.5 rounded-md px-2.5 h-9 text-[13.5px] transition-colors",
                      active ? "bg-surface-3/70 text-fg font-medium" : "text-muted hover:text-fg hover:bg-surface-2",
                    )}
                  >
                    <it.icon className={cx("size-4 shrink-0", active ? "text-fg" : "text-subtle group-hover:text-muted")} strokeWidth={active ? 2.1 : 1.8} />
                    <span className="flex-1 truncate">{it.label}</span>
                    {!!it.badge && (
                      <span className={cx("tabular min-w-5 rounded px-1.5 text-center text-[11px] font-semibold leading-5", it.href === "/recovery" ? "bg-danger/10 text-danger" : "bg-surface-3 text-fg")}>
                        {it.badge}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const sidebarBody = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between px-5">
        <Link href="/dashboard" aria-label="LeadGuard home"><Brand /></Link>
      </div>
      <div className="px-5 pb-5">
        <p className="eyebrow">Workspace</p>
        <p className="mt-0.5 text-[13.5px] font-medium truncate">{me.workspace.name}</p>
      </div>
      <div className="flex-1 overflow-y-auto pb-6">{nav}</div>
      <div className="border-t border-line p-3">
        <Link href="/settings/profile" className="flex items-center gap-3 rounded-lg p-2 hover:bg-surface-2 transition-colors">
          <Avatar name={me.name} />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium truncate">{me.name}</p>
            <p className="text-xs text-muted truncate">{me.roleName ?? me.level.toLowerCase()}</p>
          </div>
        </Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh lg:pl-[260px]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:shadow-float">
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[260px] border-r border-line bg-surface lg:block">{sidebarBody}</aside>

      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={() => setDrawer(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-[280px] max-w-[85vw] bg-surface border-r border-line shadow-modal animate-slide-in" aria-label="Navigation">
            <button onClick={() => setDrawer(false)} className="absolute right-3 top-4 rounded-md p-1.5 text-muted hover:bg-surface-2" aria-label="Close menu">
              <X className="size-4" />
            </button>
            {sidebarBody}
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-20 flex h-14 items-center gap-1.5 border-b border-line bg-bg/95 px-3 sm:h-16 sm:gap-2 sm:px-6 lg:px-8">
        <button onClick={() => setDrawer(true)} className="rounded-md p-2 text-muted hover:bg-surface-2 hover:text-fg lg:hidden" aria-label="Open menu">
          <Menu className="size-5" />
        </button>
        <span className="lg:hidden"><Link href="/dashboard" aria-label="LeadGuard home"><BrandMark className="size-7" /></Link></span>
        <button
          onClick={() => cmd.setOpen(true)}
          className="ml-1 hidden h-9 flex-1 max-w-sm items-center gap-2.5 rounded-md border border-line bg-surface px-3 text-[13px] text-subtle transition-colors hover:border-line-strong hover:text-muted sm:flex"
          aria-label="Search (Ctrl+K)"
        >
          <Search className="size-4" />
          <span className="flex-1 text-left truncate">Search contacts, pages…</span>
          <kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] text-muted">Ctrl K</kbd>
        </button>
        <div className="flex-1" />
        <button onClick={() => cmd.setOpen(true)} className="flex size-9 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg sm:hidden" aria-label="Search">
          <Search className="size-[18px]" />
        </button>
        <StatusMenu status={notif?.status ?? me.status} />
        <Notifications data={notif} />
        <span className="hidden sm:block"><ThemeToggle /></span>
        <UserMenu />
      </header>

      <main id="main" key={path.split("/").slice(0, 2).join("/")} className="mx-auto w-full max-w-[1400px] overflow-x-clip px-4 pt-5 pb-[max(6rem,calc(env(safe-area-inset-bottom)+5rem))] sm:px-6 sm:pt-6 lg:px-8 lg:pt-8 animate-fade-up">{children}</main>
      <CommandMenu open={cmd.open} onClose={() => cmd.setOpen(false)} />
      <ChatWidget slug={me.workspace.slug} launcherLabel="Try customer chatbot" preview />
    </div>
  );
}

function StatusMenu({ status }: { status: string }) {
  const [busy, setBusy] = useState(false);
  const set = async (s: string, close: () => void) => {
    close();
    if (s === status) return;
    setBusy(true);
    try {
      const r = await api<{ reassigned: number }>("/api/me", { method: "PATCH", body: { status: s } });
      toast.success(`You're now ${STATUS_LABEL[s].toLowerCase()}`, {
        description: r.reassigned ? `${r.reassigned} unacknowledged lead(s) were reassigned to teammates.` : undefined,
      });
      refresh("/api/");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Popover
      sheet
      trigger={({ toggle, open }) => (
        <button
          onClick={toggle}
          aria-expanded={open}
          aria-haspopup="menu"
          disabled={busy}
          className="flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-[13px] font-medium shadow-soft hover:border-line-strong transition-colors"
        >
          <Dot tone={STATUS_TONE[status]} className={status === "AVAILABLE" ? "ring-4 ring-success/15" : ""} />
          <span className="hidden sm:inline">{STATUS_LABEL[status]}</span>
          <ChevronDown className="size-3.5 text-subtle" />
        </button>
      )}
    >
      {(close) => (
        <div className="sm:w-64" role="menu">
          <p className="px-2.5 pt-1.5 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-subtle">Your availability</p>
          {Object.keys(STATUS_LABEL).map((s) => (
            <MenuItem key={s} onClick={() => set(s, close)} active={s === status} icon={<Dot tone={STATUS_TONE[s]} />}>
              <span className="flex-1">{STATUS_LABEL[s]}</span>
              {s === status && <Check className="size-3.5 text-accent" />}
            </MenuItem>
          ))}
          <p className="px-2.5 pt-2 pb-1 text-[11.5px] leading-relaxed text-muted border-t border-line mt-1.5">
            Only <b>Available</b> employees receive new leads. Going <b>On leave</b> or <b>Offline</b> immediately hands your unacknowledged leads to teammates; acknowledged leads stay yours and are flagged for your manager.
          </p>
        </div>
      )}
    </Popover>
  );
}

function Notifications({ data }: { data?: Notif }) {
  const router = useRouter();
  const lastSeen = useRef<string | null>(null);
  useEffect(() => {
    const top = data?.rows[0];
    if (!top) return;
    if (lastSeen.current && top.id !== lastSeen.current && !top.readAt) {
      toast(top.title, {
        description: top.body ?? undefined,
        action: top.link ? { label: "Open", onClick: () => router.push(top.link!) } : undefined,
      });
    }
    lastSeen.current = top.id;
  }, [data, router]);

  const open = async (n: Notif["rows"][number], close: () => void) => {
    close();
    if (!n.readAt) api("/api/notifications", { body: { id: n.id } }).then(() => refresh("/api/notifications")).catch(() => null);
    if (n.link) router.push(n.link);
  };

  return (
    <Popover
      sheet
      trigger={({ toggle, open }) => (
        <button onClick={toggle} aria-expanded={open} className="relative flex size-9 items-center justify-center rounded-lg text-muted hover:text-fg hover:bg-surface-2 transition-colors" aria-label={`Notifications${data?.unread ? `, ${data.unread} unread` : ""}`}>
          <Bell className="size-[18px]" />
          {!!data?.unread && (
            <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-danger text-[9.5px] font-bold text-white ring-2 ring-bg tabular">
              {data.unread > 9 ? "9+" : data.unread}
            </span>
          )}
        </button>
      )}
      className="w-[min(92vw,380px)] p-0"
    >
      {(close) => (
        <div>
          <div className="flex items-center justify-between px-4 py-3 border-b border-line">
            <p className="text-sm font-semibold">Notifications</p>
            {!!data?.unread && (
              <button className="text-xs text-accent hover:underline" onClick={() => api("/api/notifications", { body: {} }).then(() => refresh("/api/notifications"))}>
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[60vh] overflow-y-auto p-1.5">
            {!data?.rows.length && <p className="px-3 py-8 text-center text-[13px] text-muted">You're all caught up.</p>}
            {data?.rows.map((n) => (
              <button key={n.id} onClick={() => open(n, close)} className="flex w-full gap-3 rounded-lg px-2.5 py-2.5 text-left hover:bg-surface-2 transition-colors">
                <span className={cx("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-accent")} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className={cx("block text-[13px] truncate", !n.readAt && "font-medium")}>{n.title}</span>
                  {n.body && <span className="block text-xs text-muted truncate">{n.body}</span>}
                  <span className="block text-[11px] text-subtle mt-0.5">{timeAgo(n.createdAt)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </Popover>
  );
}

function UserMenu() {
  const me = useMe();
  const router = useRouter();
  const logout = async () => {
    await api("/api/auth/logout", { body: {} }).catch(() => null);
    router.replace("/login");
    router.refresh();
  };
  return (
    <Popover
      sheet
      trigger={({ toggle, open }) => (
        <button onClick={toggle} aria-expanded={open} className="ml-1 rounded-full hover:ring-4 hover:ring-surface-2 transition-all" aria-label="Account menu">
          <Avatar name={me.name} />
        </button>
      )}
      className="w-64"
    >
      {(close) => (
        <div>
          <div className="px-2.5 py-2">
            <p className="text-sm font-medium truncate">{me.name}</p>
            <p className="text-xs text-muted truncate">{me.email}</p>
          </div>
          <div className="px-1.5 py-2"><ThemeSegmented /></div>
          <div className="border-t border-line mt-1 pt-1">
            <MenuItem icon={<UserRound className="size-4" />} onClick={() => { close(); router.push("/settings/profile"); }}>Profile & notifications</MenuItem>
            <MenuItem icon={<FileText className="size-4" />} onClick={() => { close(); window.open(`/f/${me.workspace.slug}`, "_blank"); }}>Public lead form</MenuItem>
            <MenuItem icon={<LogOut className="size-4" />} onClick={logout} danger>Sign out</MenuItem>
          </div>
        </div>
      )}
    </Popover>
  );
}
