"use client";

import { useTheme } from "next-themes";
import { Moon, Sun, Monitor } from "lucide-react";
import { useEffect, useState } from "react";
import { cx } from "./ui";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted && resolvedTheme === "dark";
  return (
    <button
      onClick={() => setTheme(dark ? "light" : "dark")}
      className="relative flex size-9 items-center justify-center rounded-lg text-muted hover:text-fg hover:bg-surface-2 transition-colors"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
    >
      <Sun className={cx("size-[18px] transition-all", dark ? "scale-0 rotate-90 opacity-0" : "scale-100 opacity-100")} />
      <Moon className={cx("absolute size-[18px] transition-all", dark ? "scale-100 opacity-100" : "scale-0 -rotate-90 opacity-0")} />
    </button>
  );
}

export function ThemeSegmented() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const opts = [
    { v: "light", icon: Sun, label: "Light" },
    { v: "dark", icon: Moon, label: "Dark" },
    { v: "system", icon: Monitor, label: "System" },
  ];
  return (
    <div className="grid grid-cols-3 gap-1 rounded-lg bg-surface-2 p-1" role="radiogroup" aria-label="Theme">
      {opts.map(({ v, icon: I, label }) => (
        <button
          key={v}
          role="radio"
          aria-checked={mounted && theme === v}
          onClick={() => setTheme(v)}
          className={cx(
            "flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-all",
            mounted && theme === v ? "bg-surface text-fg shadow-soft" : "text-muted hover:text-fg",
          )}
        >
          <I className="size-3.5" /> {label}
        </button>
      ))}
    </div>
  );
}
