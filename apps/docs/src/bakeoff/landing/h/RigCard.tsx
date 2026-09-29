/**
 * Mineralsoft's floating structure card ("Spar Truss Structure · 8,040 ft –
 * 15,200 ft · 88.5 uptime"), ported: the rig on location, modelled at true
 * proportions and turning on its pad, with its structural numbers read from the
 * same constants the model is built from.
 */

import { useEffect, useRef, useState } from "react";

import { cn } from "@koc/ui";

import { useReducedMotion } from "../shared";
import { fitCanvas } from "./scene/gl";
import { RIG } from "./scene/rig";
import { RigElevation } from "./scene/Fallback";
import { RigRenderer } from "./scene/RigRenderer";
import { onThemeChange, readPalette } from "./scene/tokens";

export function RigCard({ className }: { className?: string }) {
  const reduced = useReducedMotion();
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const live = useRef({ reduced, kick: () => {} });

  useEffect(() => {
    live.current.reduced = reduced;
    live.current.kick();
  }, [reduced]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const box = boxRef.current!;
    let r: RigRenderer | null = null;
    let raf = 0;
    let last = performance.now();
    let t = 3;
    let acc = 1;
    let visible = true;
    let lost = false;
    const L = live.current;

    const create = () => {
      try {
        r = new RigRenderer(canvas);
        r.setPalette(readPalette(box));
        return true;
      } catch {
        r = null;
        setFailed(true);
        return false;
      }
    };
    const layout = () => {
      if (!r) return;
      fitCanvas(canvas, Math.min(2, window.devicePixelRatio || 1));
      r.layout(canvas.clientWidth, canvas.clientHeight);
    };
    const frame = () => {
      if (!r || lost) return;
      // A slow turntable — one revolution in 80 s. Reduced motion: a still,
      // three-quarter view with the top drive part-way down a stand.
      r.render(L.reduced ? 5 : t, L.reduced ? -0.35 : -0.35 + (t * Math.PI * 2) / 80);
    };
    const tick = (now: number) => {
      raf = 0;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const run = !L.reduced && visible && !document.hidden;
      if (run) t += dt;
      // 30 fps is plenty for an 80-second turntable, and halves this card's
      // share of the GPU and the main thread.
      acc += dt;
      if (!run || acc >= 1 / 31) {
        acc = 0;
        frame();
      }
      if (run) raf = requestAnimationFrame(tick);
    };
    const kick = () => {
      if (raf || lost) return;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };
    L.kick = kick;

    if (!create()) return;
    layout();
    kick();

    const ro = new ResizeObserver(() => {
      layout();
      frame();
    });
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) kick();
    });
    io.observe(box);
    const onVis = () => !document.hidden && kick();
    document.addEventListener("visibilitychange", onVis);
    const off = onThemeChange(() => {
      r?.setPalette(readPalette(box));
      frame();
    });
    const onLost = (e: Event) => {
      e.preventDefault();
      lost = true;
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const onRestored = () => {
      lost = false;
      if (create()) {
        layout();
        kick();
      }
    };
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    return () => {
      cancelAnimationFrame(raf);
      L.kick = () => {};
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      off();
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      r?.dispose();
    };
  }, []);

  return (
    <div
      ref={boxRef}
      className={cn(
        // Mineralsoft's card is frosted glass. Tried here: over a live canvas the
        // blur smeared the strata into grey behind the rig model and re-blurred
        // every frame, so the card is (almost) opaque instead.
        "relative overflow-hidden rounded-md border bg-card/95 text-card-foreground shadow-lg",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3 px-4 pt-3.5">
        <div>
          <p className="text-2xs text-muted-foreground">Pad A · on location</p>
          <p className="mt-1 text-xl leading-tight font-light tracking-tight">
            Land rig,
            <br />
            <span className="font-medium">{RIG.mast} ft mast</span>
          </p>
        </div>
        <span className="mt-0.5 inline-flex items-center gap-1.5 rounded-sm bg-primary px-1.5 py-0.5 text-2xs font-medium text-primary-foreground">
          Drilling
        </span>
      </div>
      <div className="relative h-60">
        {failed ? (
          <div className="h-full px-4 py-3">
            <RigElevation />
          </div>
        ) : (
          <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 size-full" />
        )}
      </div>
      <dl className="grid grid-cols-3 border-t text-2xs">
        {[
          ["Floor", `${RIG.floor} ft`],
          ["Board", `${RIG.board} ft`],
          ["Crown", `${RIG.floor + RIG.mast} ft`],
        ].map(([k, v]) => (
          <div key={k} className="border-l px-3 py-2 first:border-l-0">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="font-mono text-xs font-medium text-foreground">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
