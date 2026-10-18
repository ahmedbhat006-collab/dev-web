"use client";

import clsx from "clsx";
import { extendTailwindMerge } from "tailwind-merge";
import Link from "next/link";
import {
  ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes,
  forwardRef, useEffect, useId, useRef, useState, createContext, useContext,
} from "react";
import { createPortal } from "react-dom";
import { Loader2, X, ChevronLeft, ChevronRight, Inbox } from "lucide-react";

const merge = extendTailwindMerge({
  extend: {
    classGroups: {
      shadow: [{ shadow: ["soft", "float", "modal"] }],
    },
  },
});
/** clsx + tailwind-merge: later classes win (e.g. a caller's w-36 beats the default w-full). */
export const cx = (...a: Parameters<typeof clsx>) => merge(clsx(...a));

// ------------------------------------------------------------------ Button

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
type BtnSize = "sm" | "md" | "lg" | "icon";

const btnBase =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-all duration-150 select-none disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]";
const btnVariants: Record<BtnVariant, string> = {
  primary: "bg-ink text-ink-fg hover:opacity-90 shadow-soft",
  secondary: "bg-surface text-fg border border-line hover:bg-surface-2 hover:border-line-strong shadow-soft",
  ghost: "text-muted hover:text-fg hover:bg-surface-2",
  subtle: "bg-surface-2 text-fg hover:bg-surface-3",
  danger: "bg-danger/10 text-danger hover:bg-danger/15 border border-danger/20",
};
const btnSizes: Record<BtnSize, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-9 px-3.5 text-sm",
  lg: "h-11 px-5 text-[15px]",
  icon: "h-9 w-9",
};

export function buttonClass(variant: BtnVariant = "secondary", size: BtnSize = "md", className?: string) {
  return cx(btnBase, btnVariants[variant], btnSizes[size], className);
}

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: BtnSize; loading?: boolean; icon?: ReactNode }
>(function Button({ variant = "secondary", size = "md", loading, icon, className, children, disabled, ...p }, ref) {
  return (
    <button ref={ref} className={buttonClass(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...p}>
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function LinkButton({ href, variant = "secondary", size = "md", className, children, icon }: { href: string; variant?: BtnVariant; size?: BtnSize; className?: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {icon}
      {children}
    </Link>
  );
}

export const Spinner = ({ className }: { className?: string }) => <Loader2 className={cx("size-4 animate-spin text-muted", className)} aria-label="Loading" />;

// ------------------------------------------------------------------ Form controls

const FieldCtx = createContext<string | undefined>(undefined);

const controlBase =
  "w-full rounded-lg border border-line bg-surface px-3 text-sm text-fg placeholder:text-subtle shadow-soft transition-colors hover:border-line-strong focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/15 disabled:opacity-60 disabled:bg-surface-2";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, id, ...p }, ref) {
  const fid = useContext(FieldCtx);
  return <input ref={ref} id={id ?? fid} className={cx(controlBase, "h-9", className)} {...p} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, id, ...p }, ref) {
  const fid = useContext(FieldCtx);
  return <textarea ref={ref} id={id ?? fid} className={cx(controlBase, "py-2 min-h-20 leading-relaxed", className)} {...p} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, id, ...p }, ref) {
  const fid = useContext(FieldCtx);
  return (
    <select
      ref={ref}
      id={id ?? fid}
      className={cx(
        controlBase,
        "h-9 appearance-none pr-8 bg-[length:16px] bg-[right_0.6rem_center] bg-no-repeat",
        "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238a8982' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
        className,
      )}
      {...p}
    >
      {children}
    </select>
  );
});

/** Label + control + hint/error. Pass the control as children; its id is wired automatically via `id` prop. */
export function Field({ label, hint, error, children, className, required, htmlFor }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string; required?: boolean; htmlFor?: string }) {
  const auto = useId();
  const id = htmlFor ?? auto;
  return (
    <FieldCtx.Provider value={id}>
      <div className={cx("flex flex-col gap-1.5", className)}>
        <label htmlFor={id} className="text-[13px] font-medium text-fg">
          {label}
          {required && <span className="text-danger"> *</span>}
        </label>
        {children}
        {error ? (
          <p className="text-xs text-danger" role="alert">{error}</p>
        ) : hint ? (
          <p className="text-xs text-muted">{hint}</p>
        ) : null}
      </div>
    </FieldCtx.Provider>
  );
}

export function Switch({ checked, onChange, label, disabled, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; description?: string }) {
  return (
    <label className={cx("flex items-start gap-3 cursor-pointer select-none", disabled && "opacity-50 cursor-not-allowed")}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          "relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
          checked ? "bg-accent" : "bg-surface-3 border border-line-strong",
        )}
      >
        <span className={cx("inline-block size-4 rounded-full bg-white shadow transition-transform", checked ? "translate-x-[18px]" : "translate-x-0.5")} />
      </button>
      <span className="flex flex-col">
        <span className="text-sm text-fg">{label}</span>
        {description && <span className="text-xs text-muted">{description}</span>}
      </span>
    </label>
  );
}

export function Checkbox({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; disabled?: boolean }) {
  return (
    <label className={cx("flex items-center gap-2.5 text-sm cursor-pointer select-none", disabled && "opacity-50 cursor-not-allowed")}>
      <input type="checkbox" className="size-4 rounded border-line-strong accent-[var(--accent)]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

// ------------------------------------------------------------------ Surfaces

export function Card({ children, className, padded = true, interactive, as: As = "div" }: { children: ReactNode; className?: string; padded?: boolean; interactive?: boolean; as?: "div" | "section" | "article" }) {
  return <As className={cx("rounded-lg border border-line bg-surface shadow-soft", padded && "p-5", interactive && "lift", className)}>{children}</As>;
}

export function CardHeader({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex items-start justify-between gap-3 mb-4", className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-tight text-fg">{title}</h2>
        {description && <p className="text-[13px] text-muted mt-0.5">{description}</p>}
      </div>
      {action && <div className="shrink-0 flex items-center gap-2">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions, back }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6">
      {back && (
        <Link href={back.href} className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg mb-3 transition-colors">
          <ChevronLeft className="size-3.5" /> {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[22px] sm:text-[24px] font-semibold leading-tight tracking-[-0.015em] text-fg">{title}</h1>
          {description && <div className="text-sm text-muted mt-1.5 max-w-2xl">{description}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Badges & bits

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";
const toneCls: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted border-line",
  accent: "bg-accent/10 text-accent border-accent/20",
  success: "bg-success/10 text-success border-success/20",
  warning: "bg-warning/10 text-warning border-warning/25",
  danger: "bg-danger/10 text-danger border-danger/20",
  info: "bg-info/10 text-info border-info/20",
};
const toneText: Record<Tone, string> = {
  neutral: "text-subtle", accent: "text-accent", success: "text-success", warning: "text-warning", danger: "text-danger", info: "text-info",
};
const dotCls: Record<Tone, string> = {
  neutral: "bg-subtle", accent: "bg-accent", success: "bg-success", warning: "bg-warning", danger: "bg-danger", info: "bg-info",
};

export function Badge({ tone = "neutral", children, dot, className, title }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string; title?: string }) {
  return (
    <span title={title} className={cx("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11.5px] font-medium leading-4 whitespace-nowrap", toneCls[tone], className)}>
      {dot && <span className={cx("size-1.5 rounded-full", dotCls[tone])} aria-hidden />}
      {children}
    </span>
  );
}

export const Dot = ({ tone = "neutral", className }: { tone?: Tone; className?: string }) => (
  <span className={cx("inline-block size-2 rounded-full", dotCls[tone], className)} aria-hidden />
);

const AVATAR_TONES = ["bg-surface-3 text-fg", "bg-surface-2 text-muted border border-line"];

export function Avatar({ name, size = "md", className }: { name?: string | null; size?: "sm" | "md" | "lg"; className?: string }) {
  const n = name || "?";
  const initials = n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
  const tone = AVATAR_TONES[[...n].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_TONES.length];
  return (
    <span aria-hidden className={cx("inline-flex shrink-0 items-center justify-center rounded-full font-semibold", tone, size === "sm" ? "size-6 text-[10px]" : size === "lg" ? "size-11 text-sm" : "size-8 text-xs", className)}>
      {initials}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("shimmer rounded-lg", className)} aria-hidden />;
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      <div className="mb-4 flex size-11 items-center justify-center rounded-lg border border-line bg-surface-2 text-muted">{icon ?? <Inbox className="size-5" />}</div>
      <p className="text-sm font-medium text-fg">{title}</p>
      {description && <p className="text-[13px] text-muted mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-danger/25 bg-danger/5 p-4 text-sm flex flex-col sm:flex-row sm:items-center gap-3 justify-between" role="alert">
      <span className="text-danger">{error.message}</span>
      {onRetry && <Button size="sm" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-muted">{children}</kbd>;
}

// ------------------------------------------------------------------ Modal

export function Modal({ open, onClose, title, description, children, footer, size = "md" }: { open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode; size?: "sm" | "md" | "lg" }) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && ref.current) {
        const els = ref.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        const list = [...els].filter((x) => !x.hasAttribute("disabled"));
        if (!list.length) return;
        const first = list[0], last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    setTimeout(() => ref.current?.querySelector<HTMLElement>("input, select, textarea, button:not([data-close])")?.focus(), 30);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open || !mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/45 animate-fade-in" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        className={cx(
          "relative w-full bg-surface border border-line shadow-modal animate-pop flex flex-col max-h-[92vh]",
          "rounded-t-2xl sm:rounded-lg",
          size === "sm" ? "sm:max-w-md" : size === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg",
        )}
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight">{title}</h2>
            {description && <p className="text-[13px] text-muted mt-1">{description}</p>}
          </div>
          <button data-close onClick={onClose} className="rounded-md p-1 text-muted hover:text-fg hover:bg-surface-2" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        <div className="px-5 pb-5 overflow-y-auto">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3.5 bg-surface-2/50 rounded-b-2xl">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ------------------------------------------------------------------ Tabs / segmented

export function Segmented<T extends string>({ value, onChange, options, className, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; count?: number }[]; className?: string; label?: string }) {
  return (
    <div role="tablist" aria-label={label} className={cx("inline-flex items-center rounded-lg border border-line bg-surface-2 p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "flex items-center gap-1.5 rounded-md px-3 h-7 text-[13px] font-medium transition-all",
            value === o.value ? "bg-surface text-fg shadow-soft" : "text-muted hover:text-fg",
          )}
        >
          {o.label}
          {o.count !== undefined && <span className="tabular text-[11px] text-subtle">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Pagination

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-line text-[13px] text-muted">
      <span className="tabular">
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
      </span>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft className="size-4" /></Button>
        <span className="tabular px-2">{page} / {pages}</span>
        <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight className="size-4" /></Button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Popover menu

export function Popover({ trigger, children, align = "end", className, sheet }: { trigger: (p: { open: boolean; toggle: () => void }) => ReactNode; children: (close: () => void) => ReactNode; align?: "start" | "end"; className?: string; sheet?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div className={cx("absolute z-40 mt-2 min-w-52 rounded-lg border border-line bg-surface p-1.5 shadow-float animate-pop", align === "end" ? "right-0" : "left-0", className, sheet && "max-sm:fixed max-sm:inset-x-3 max-sm:top-[60px] max-sm:mt-0 max-sm:w-auto max-sm:max-h-[75dvh] max-sm:overflow-y-auto")}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ onClick, children, icon, active, danger }: { onClick?: () => void; children: ReactNode; icon?: ReactNode; active?: boolean; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors",
        danger ? "text-danger hover:bg-danger/10" : "text-fg hover:bg-surface-2",
        active && "bg-surface-2 font-medium",
      )}
    >
      {icon && <span className="text-muted">{icon}</span>}
      {children}
    </button>
  );
}

// ------------------------------------------------------------------ Stat

/** Counts up smoothly to a number whenever it changes. */
export function AnimatedNumber({ value, format = (n) => Math.round(n).toLocaleString() }: { value: number; format?: (n: number) => string }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    const dur = 650;
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(a + (value - a) * eased);
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{format(shown)}</>;
}

export function Stat({ label, value, sub, href, icon, tone, className }: { label: string; value: ReactNode; sub?: ReactNode; href?: string; icon?: ReactNode; tone?: Tone; className?: string }) {
  const inner = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-muted">{label}</span>
        {icon && <span className={cx("flex items-center", tone ? toneText[tone] : "text-subtle")}>{icon}</span>}
      </div>
      <div className="mt-3 text-[26px] leading-none font-semibold tracking-[-0.02em] tabular text-fg">
        {typeof value === "number" ? <AnimatedNumber value={value} /> : value}
      </div>
      {sub && <div className="mt-2.5 text-xs text-muted">{sub}</div>}
      {href && <ChevronRight className="absolute right-4 bottom-4 size-4 text-subtle opacity-0 -translate-x-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0" aria-hidden />}
    </>
  );
  const cls = "group relative block overflow-hidden rounded-lg border border-line bg-surface p-5 shadow-soft";
  return href ? <Link href={href} className={cx(cls, "lift", className)}>{inner}</Link> : <div className={cx(cls, className)}>{inner}</div>;
}
