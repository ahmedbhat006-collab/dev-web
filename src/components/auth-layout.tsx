"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { BrandMark } from "./brand";
import { ThemeToggle } from "./theme-toggle";

type Bubble = { id: number; x: number; y: number; size: number; color: string; depth: number; dur: number; delay: number; popping?: boolean };

// Soft, warm palette (works on light and dark backgrounds).
const COLORS = ["#f4b8a0", "#b9d8c2", "#c9c2ef", "#f6d78b", "#a9cbe8", "#f2b5cf"];
const SEED: Omit<Bubble, "id">[] = [
  { x: 8, y: 14, size: 220, color: COLORS[0], depth: 0.6, dur: 16, delay: 0 },
  { x: 78, y: 8, size: 160, color: COLORS[2], depth: 1.1, dur: 13, delay: -3 },
  { x: 86, y: 62, size: 260, color: COLORS[1], depth: 0.5, dur: 18, delay: -6 },
  { x: 14, y: 72, size: 140, color: COLORS[3], depth: 1.3, dur: 12, delay: -2 },
  { x: 52, y: 88, size: 110, color: COLORS[4], depth: 1.5, dur: 11, delay: -5 },
  { x: 62, y: 24, size: 80, color: COLORS[5], depth: 1.8, dur: 10, delay: -1 },
  { x: 32, y: 40, size: 60, color: COLORS[0], depth: 2, dur: 9, delay: -4 },
  { x: 92, y: 36, size: 54, color: COLORS[3], depth: 2.2, dur: 10, delay: -7 },
];

/** Floating bubbles that lean toward the pointer; click one to pop it (a new one floats in). */
function BubbleField() {
  const [bubbles, setBubbles] = useState<Bubble[]>(() => SEED.map((b, i) => ({ ...b, id: i })));
  const ref = useRef<HTMLDivElement>(null);
  const next = useRef(SEED.length);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.setProperty("--mx", String(e.clientX / window.innerWidth - 0.5));
        el.style.setProperty("--my", String(e.clientY / window.innerHeight - 0.5));
      });
    };
    window.addEventListener("pointermove", onMove);
    return () => { window.removeEventListener("pointermove", onMove); cancelAnimationFrame(raf); };
  }, []);

  const pop = (id: number) => {
    setBubbles((bs) => bs.map((b) => (b.id === id ? { ...b, popping: true } : b)));
    setTimeout(() => {
      setBubbles((bs) => {
        const old = bs.find((b) => b.id === id);
        const rest = bs.filter((b) => b.id !== id);
        if (!old) return rest;
        const fresh: Bubble = {
          ...old,
          id: next.current++,
          popping: false,
          x: 5 + Math.random() * 90,
          y: 5 + Math.random() * 85,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
        };
        return [...rest, fresh];
      });
    }, 380);
  };

  return (
    <div ref={ref} className="pointer-events-none absolute inset-0 overflow-hidden" style={{ ["--mx" as string]: 0, ["--my" as string]: 0 }}>
      {bubbles.map((b) => (
        <div
          key={b.id}
          className="absolute transition-transform duration-700 ease-out"
          style={{
            left: `${b.x}%`,
            top: `${b.y}%`,
            width: b.size,
            height: b.size,
            marginLeft: -b.size / 2,
            marginTop: -b.size / 2,
            transform: `translate3d(calc(var(--mx) * ${b.depth * 60}px), calc(var(--my) * ${b.depth * 60}px), 0)`,
          }}
        >
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            onClick={() => pop(b.id)}
            className={`bubble-in pointer-events-auto block size-full cursor-pointer rounded-full ${b.popping ? "bubble-pop" : ""}`}
          >
            <span
              className="bubble-drift block size-full rounded-full"
              style={{
                ["--dur" as string]: `${b.dur}s`,
                ["--delay" as string]: `${b.delay}s`,
                background: `radial-gradient(circle at 32% 28%, rgba(255,255,255,0.9) 0%, ${b.color} 38%, color-mix(in oklab, ${b.color} 88%, #5a3a2a) 100%)`,
                boxShadow: `0 24px 50px -22px ${b.color}`,
                opacity: 0.92,
              }}
            />
          </button>
        </div>
      ))}
    </div>
  );
}

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#fbf7f2] px-5 py-12 dark:bg-[#15130f]">
      <BubbleField />
      <div className="absolute right-3 top-3 z-10"><ThemeToggle /></div>
      <div className="bubble-in relative z-10 w-full max-w-[380px] rounded-[28px] border border-white/70 bg-white/75 p-8 shadow-[0_30px_80px_-30px_rgba(60,40,20,0.35)] backdrop-blur-xl dark:border-white/10 dark:bg-[#1f1c17]/80 sm:p-9">
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="flex items-center gap-2.5">
            <BrandMark className="size-11 rounded-2xl" />
            <span className="text-[22px] font-semibold tracking-[-0.02em]">Dastak</span>
          </div>
          <h1 className="mt-6 text-[26px] font-semibold leading-tight tracking-[-0.02em]">{title}</h1>
          <p className="mt-1.5 text-sm text-muted">{subtitle}</p>
        </div>
        {children}
        <div className="mt-6 text-center text-sm text-muted">{footer}</div>
      </div>
      <p className="absolute bottom-4 left-0 right-0 z-10 text-center text-xs text-subtle">Psst, the bubbles pop.</p>
    </div>
  );
}
