"use client";

import { useEffect, useRef, useState } from "react";
import { STREAK_CALLOUT } from "@/lib/game/moments";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import type { GameView } from "@/types/game";

/** How long the "3 · 2 · 1" lasts before the answers flip. */
export const DRUMROLL_MS = 1200;
/** A phone that arrives later than this into a reveal (refresh, slow network) skips the drumroll. */
const LATE_ARRIVAL_MS = 2500;

/**
 * True while the drumroll plays. Skipped when the player asked for less motion,
 * or when the reveal is already old by the time this phone shows it.
 */
export function useDrumroll(phaseAgeMs: number): boolean {
  const reduced = useReducedMotion();
  const skip = reduced || phaseAgeMs > LATE_ARRIVAL_MS;
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (skip) return;
    const timer = setTimeout(() => setDone(true), DRUMROLL_MS);
    return () => clearTimeout(timer);
  }, [skip]);
  return !skip && !done;
}

/** The "3 · 2 · 1" shown in place of the answers. */
export function Drumroll() {
  const [n, setN] = useState(3);
  useEffect(() => {
    const step = DRUMROLL_MS / 3;
    const timer = setInterval(() => setN((x) => Math.max(1, x - 1)), step);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10" role="status">
      <span className="text-muted-foreground text-base">And the answer is…</span>
      <span key={n} className="font-heading animate-in zoom-in-50 fade-in text-7xl font-extrabold duration-300">
        {n}
      </span>
    </div>
  );
}

/** Streak and lead-change callouts, announced for screen readers too. */
export function Callouts({ moments, nameOf }: { moments: GameView["moments"]; nameOf: (id: string) => string }) {
  if (!moments) return null;
  const lines: string[] = [];
  if (moments.streak >= STREAK_CALLOUT) lines.push(`🔥 ${moments.streak} in a row!`);
  if (moments.newLeaderId) {
    const who = nameOf(moments.newLeaderId);
    lines.push(moments.firstLead ? `👑 ${who} take${who === "You" ? "" : "s"} the lead!` : `👑 New leader: ${who}!`);
  }
  if (lines.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2" role="status" aria-live="polite">
      {lines.map((line) => (
        <span
          key={line}
          className="animate-in zoom-in-90 fade-in bg-mode-gradient fill-mode-both rounded-full px-4 py-2 text-base font-bold text-[oklch(0.18_0.04_300)] delay-300 duration-500"
        >
          {line}
        </span>
      ))}
    </div>
  );
}

const CONFETTI_COLORS = ["#ff6f9f", "#a65cf0", "#58a6f2", "#f5a23d", "#5ee0a0", "#ffe066"];

/**
 * A short confetti burst (plain canvas, no library) plus a buzz on phones that
 * support it, for the player who just nailed it. Nothing at all with reduced motion.
 */
export function Celebration() {
  const reduced = useReducedMotion();
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (reduced) return;
    try {
      navigator.vibrate?.([30, 40, 30]);
    } catch {
      // Some browsers throw without a recent tap; the confetti is enough.
    }
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    el.width = el.clientWidth * dpr;
    el.height = el.clientHeight * dpr;
    ctx.scale(dpr, dpr);
    const w = el.clientWidth;
    const h = el.clientHeight;
    const pieces = Array.from({ length: 90 }, () => ({
      x: w / 2 + (Math.random() - 0.5) * w * 0.3,
      y: h * 0.35,
      vx: (Math.random() - 0.5) * 9,
      vy: -Math.random() * 11 - 4,
      size: 5 + Math.random() * 6,
      spin: Math.random() * Math.PI,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    }));
    const started = performance.now();
    let frame = 0;
    const draw = (t: number) => {
      const elapsed = t - started;
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = Math.max(0, 1 - elapsed / 1800);
      for (const p of pieces) {
        p.vy += 0.35;
        p.x += p.vx;
        p.y += p.vy;
        p.spin += 0.2;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.spin);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      if (elapsed < 1800) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [reduced]);

  if (reduced) return null;
  return <canvas ref={canvas} aria-hidden className="pointer-events-none fixed inset-0 z-20 h-full w-full" />;
}
