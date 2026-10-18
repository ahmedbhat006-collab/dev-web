"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserRound, Users, ShieldCheck, SquareKanban, Layers, Shuffle, Plug } from "lucide-react";
import { useMe } from "@/components/me";
import { cx } from "@/components/ui";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const path = usePathname();
  const items = [
    { href: "/settings/profile", label: "Profile", icon: UserRound, show: true },
    { href: "/settings/users", label: "Team", icon: Users, show: true },
    { href: "/settings/roles", label: "Roles & permissions", icon: ShieldCheck, show: me.can("users.manage") },
    { href: "/settings/pipelines", label: "Pipelines", icon: SquareKanban, show: me.can("settings.customize") },
    { href: "/settings/fields", label: "Custom fields", icon: Layers, show: me.can("settings.customize") },
    { href: "/settings/assignment", label: "Lead rules", icon: Shuffle, show: true },
    { href: "/settings/integrations", label: "Integrations", icon: Plug, show: me.can("integrations.manage") },
  ].filter((i) => i.show);
  return (
    <div className="animate-fade-in">
      <h1 className="mb-6 text-[22px] sm:text-[24px] font-semibold leading-tight tracking-[-0.015em]">Settings</h1>
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Settings">
          <ul className="flex flex-wrap gap-1 lg:flex-col">
            {items.map((i) => {
              const active = path === i.href;
              return (
                <li key={i.href} className="shrink-0">
                  <Link href={i.href} aria-current={active ? "page" : undefined} className={cx("flex items-center gap-2.5 rounded-lg px-3 h-9 text-[13.5px] transition-colors whitespace-nowrap", active ? "bg-surface text-fg font-medium shadow-soft border border-line" : "text-muted hover:text-fg hover:bg-surface-2")}>
                    <i.icon className={cx("size-4", active ? "text-accent" : "text-subtle")} />
                    {i.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
