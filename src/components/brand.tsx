import { ShieldCheck } from "lucide-react";
import clsx from "clsx";

export function BrandMark({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center justify-center rounded-md",
        inverted ? "bg-[#fbfaf8] text-[#1c1b18]" : "bg-ink text-ink-fg",
        className ?? "size-8",
      )}
    >
      <ShieldCheck className="size-[56%]" strokeWidth={2.25} />
    </span>
  );
}

export function Brand({ inverted }: { inverted?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <BrandMark inverted={inverted} />
      <span className="text-[15px] font-semibold tracking-[-0.01em]">LeadGuard</span>
    </span>
  );
}
