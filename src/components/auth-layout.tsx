"use client";

import { ReactNode, useEffect, useRef } from "react";
import { BrandMark } from "./brand";
import { ThemeToggle } from "./theme-toggle";

type Ping = { x: number; y: number; born: number };

/**
 * "Every knock answered": a quiet dot grid where leads ping in at random points,
 * ripple, and get routed (a thin line) to the sign-in card. Dots near the pointer glow.
 */
function KnockField() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const GAP = 26;
    let w = 0, h = 0, dpr = 1, raf = 0;
    let mouse = { x: -9999, y: -9999 };
    let pings: Ping[] = [];
    let lastSpawn = 0;
    let colors = { dot: "rgba(28,27,24,0.16)", accent: "42,74,127" };

    const readColors = () => {
      const s = getComputedStyle(document.documentElement);
      const dark = document.documentElement.classList.contains("dark");
      const hex = s.getPropertyValue("--accent").trim() || "#2a4a7f";
      const n = parseInt(hex.replace("#", ""), 16);
      colors = {
        dot: dark ? "rgba(236,235,231,0.13)" : "rgba(28,27,24,0.15)",
        accent: `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`,
      };
    };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2;

      // Dot grid, brighter near the pointer.
      for (let x = GAP / 2; x < w; x += GAP) {
        for (let y = GAP / 2; y < h; y += GAP) {
          const d = Math.hypot(x - mouse.x, y - mouse.y);
          if (d < 140) {
            const k = 1 - d / 140;
            ctx.fillStyle = `rgba(${colors.accent},${0.15 + k * 0.55})`;
            ctx.beginPath();
            ctx.arc(x, y, 1.1 + k * 1.2, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.fillStyle = colors.dot;
            ctx.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);
          }
        }
      }

      if (reduce) return;

      // New knock every ~0.9s, away from the card in the middle.
      if (t - lastSpawn > 900) {
        lastSpawn = t;
        for (let tries = 0; tries < 10; tries++) {
          const gx = Math.floor(Math.random() * (w / GAP)) * GAP + GAP / 2;
          const gy = Math.floor(Math.random() * (h / GAP)) * GAP + GAP / 2;
          if (Math.abs(gx - cx) > 230 || Math.abs(gy - cy) > 300) { pings.push({ x: gx, y: gy, born: t }); break; }
        }
      }

      pings = pings.filter((p) => t - p.born < 2600);
      for (const p of pings) {
        const age = (t - p.born) / 2600; // 0..1
        // Ripple rings.
        for (const off of [0, 0.18]) {
          const a = age - off;
          if (a <= 0 || a > 0.6) continue;
          const r = (a / 0.6) * 34;
          ctx.strokeStyle = `rgba(${colors.accent},${(1 - a / 0.6) * 0.5})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.stroke();
        }
        // Core dot.
        ctx.fillStyle = `rgba(${colors.accent},${Math.max(0, 1 - age) * 0.9})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2);
        ctx.fill();
        // Route line toward the card: draws in, then fades.
        const grow = Math.min(1, Math.max(0, (age - 0.15) / 0.45));
        if (grow > 0) {
          const fade = age > 0.7 ? 1 - (age - 0.7) / 0.3 : 1;
          const ex = p.x + (cx - p.x) * grow * 0.92;
          const ey = p.y + (cy - p.y) * grow * 0.92;
          const g = ctx.createLinearGradient(p.x, p.y, ex, ey);
          g.addColorStop(0, `rgba(${colors.accent},${0.35 * fade})`);
          g.addColorStop(1, `rgba(${colors.accent},0)`);
          ctx.strokeStyle = g;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(ex, ey);
          ctx.stroke();
        }
      }
    };

    const loop = (t: number) => { draw(t); raf = requestAnimationFrame(loop); };
    const onMove = (e: PointerEvent) => { mouse = { x: e.clientX, y: e.clientY }; if (reduce) draw(0); };
    const onLeave = () => { mouse = { x: -9999, y: -9999 }; };

    readColors();
    resize();
    const colorTimer = window.setInterval(readColors, 800);
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove);
    document.addEventListener("pointerleave", onLeave);
    if (reduce) draw(0); else raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(colorTimer);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute inset-0 size-full" />;
}

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-bg px-5 py-12">
      <KnockField />
      {/* Soft vignette so the card area stays calm */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--bg)_0%,transparent_55%)] opacity-80" />
      <div className="absolute right-3 top-3 z-10"><ThemeToggle /></div>
      <div className="relative z-10 w-full max-w-[380px] animate-fade-up rounded-[24px] border border-line bg-surface/85 p-8 shadow-[0_30px_80px_-30px_rgba(28,27,24,0.28)] backdrop-blur-md sm:p-9">
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
    </div>
  );
}
