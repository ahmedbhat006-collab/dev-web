import { ReactNode } from "react";
import { Brand } from "./brand";
import { ThemeToggle } from "./theme-toggle";

/** A static, honest preview of what the product does: a lead's ownership trail. */
function LeadTrail() {
  const rows = [
    { t: "09:41:02", text: "Lead captured from web form", who: "System" },
    { t: "09:41:02", text: "Assigned to Ali Raza · round-robin", who: "System" },
    { t: "09:41:32", text: "Not acknowledged in 30s · escalated to Bilal Ahmed", who: "System", warn: true },
    { t: "09:41:49", text: "Acknowledged by Bilal Ahmed", who: "Bilal Ahmed", ok: true },
    { t: "09:43:10", text: "WhatsApp sent · delivered", who: "Bilal Ahmed" },
  ];
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <p className="text-[13px] font-medium text-white">Hamza Qureshi</p>
          <p className="text-[11.5px] text-white/50">Web form · Residential solar</p>
        </div>
        <span className="rounded border border-white/15 px-2 py-0.5 text-[11px] text-white/70">Owner: Bilal Ahmed</span>
      </div>
      <ol className="px-4 py-3 space-y-2.5">
        {rows.map((r, i) => (
          <li key={i} className="grid grid-cols-[64px_1fr] gap-3 text-[12px]">
            <span className="font-mono text-white/40">{r.t}</span>
            <span className={r.warn ? "text-[#e0a246]" : r.ok ? "text-[#6cc08b]" : "text-white/75"}>{r.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="min-h-dvh grid lg:grid-cols-[1fr_1fr]">
      <section className="hidden lg:flex flex-col justify-between bg-[#1c1b18] p-12 text-white">
        <Brand inverted />
        <div className="max-w-[440px]">
          <h2 className="text-[34px] font-semibold leading-[1.15] tracking-[-0.02em]">Every inbound lead has one accountable owner.</h2>
          <p className="mt-4 text-[15px] leading-relaxed text-white/60">
            Leads are assigned the moment they arrive, escalated when they&apos;re ignored, and every step is on the record.
          </p>
          <div className="mt-10"><LeadTrail /></div>
        </div>
        <p className="text-xs text-white/35">WhatsApp · Stripe · Google Calendar · Email</p>
      </section>
      <section className="relative flex flex-col items-center justify-center px-5 py-12 sm:px-10">
        <div className="absolute right-3 top-3"><ThemeToggle /></div>
        <div className="w-full max-w-[360px] animate-fade-up">
          <div className="lg:hidden mb-10"><Brand /></div>
          <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em]">{title}</h1>
          <p className="mt-1.5 text-sm text-muted">{subtitle}</p>
          <div className="mt-8">{children}</div>
          <div className="mt-8 text-center text-sm text-muted">{footer}</div>
        </div>
      </section>
    </div>
  );
}
