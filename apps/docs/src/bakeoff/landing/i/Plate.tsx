/**
 * Plate I — the exploded bit, its callouts and its lifecycle.
 *
 * The component owns everything a WebGL canvas in a product page has to get
 * right, so the page around it does not have to think about any of it:
 *   - tokens read at runtime, re-read when `.dark` toggles on <html>
 *   - rendering stops offscreen, in a hidden tab, when paused, and under
 *     reduced motion (which renders one composed frame per state change)
 *   - `webglcontextlost` / `restored` rebuild every GL resource
 *   - no WebGL2 → the line elevation in Fallback.tsx
 *
 * Callouts are HTML (italic serif, like INFRA's) positioned from projected
 * anchor points every frame — written straight to the DOM, never through
 * React state, so a 60 fps loop never re-renders the tree.
 */

import { useEffect, useRef, useState } from "react";

import { cn } from "@koc/ui";

import { Fallback } from "./Fallback";
import type { BitModel, CalloutId } from "./gl/bit";
import { loadModel } from "./gl/model";
import { PlateRenderer, hardwareContext, type Layout, type Projection } from "./gl/renderer";
import { readPalette } from "./gl/tokens";

export interface Callout {
  id: CalloutId;
  title: string;
  spec: string;
}

export const CALLOUTS: Callout[] = [
  { id: "cutter", title: "PDC cutter", spec: "16 mm · 20° back-rake" },
  { id: "nozzle", title: "Nozzle, one of six", spec: "12/32 in · threaded" },
  { id: "gauge", title: "Gauge pad", spec: "8½ in" },
  { id: "breaker", title: "Breaker slot", spec: "5¾ in steel shank" },
  { id: "pin", title: "API 4½ in REG pin", spec: "5 tpi · 3 in/ft taper" },
];

/** One explode cycle, seconds: hold, part, hold, assemble, hold. */
const CYCLE = { hold0: 2.2, move: 2.8, hold1: 6.0, hold2: 2.2 };
const PERIOD = CYCLE.hold0 + CYCLE.move + CYCLE.hold1 + CYCLE.move + CYCLE.hold2;

function autoExplode(t: number): number {
  let u = t % PERIOD;
  if ((u -= CYCLE.hold0) < 0) return 0;
  if (u < CYCLE.move) return u / CYCLE.move;
  if ((u -= CYCLE.move + CYCLE.hold1) < 0) return 1;
  if (u < CYCLE.move) return 1 - u / CYCLE.move;
  return 0;
}

const AZ0 = (22 * Math.PI) / 180;
const EL0 = (27 * Math.PI) / 180;

/** Tailwind's `lg` — the breakpoint where the figure goes behind the type. */
const LG = "(min-width: 1024px)";

function layoutFor(w: number): Layout {
  // Desktop: the bit stands right of centre and the headline takes the left,
  // as INFRA stages its plant beside the type. Narrow: it owns its own box.
  // Decided by the same media query as the CSS, never by the figure's own
  // width — the hero's margin makes that 26 px narrower than the viewport.
  if (window.matchMedia(LG).matches) {
    // The canvas starts a third of the way in (see index.tsx), so "right of
    // centre" on the page is just left of centre here — room for the callouts.
    const shiftX = w >= 1100 ? -0.07 : -0.03;
    return { shiftX, shiftY: 0.07, availW: 0.56, availH: 0.8 };
  }
  return { shiftX: 0, shiftY: 0, availW: 0.94, availH: 0.94 };
}

export interface PlateProps {
  /** null = the automatic explode/assemble cycle; true/false = held there. */
  exploded: boolean | null;
  paused: boolean;
  reduced: boolean;
  /** Called once if the plate falls back to the line drawing (no hardware WebGL2). */
  onFallback?: () => void;
  className?: string;
}

export function Plate({ exploded, paused, reduced, onFallback, className }: PlateProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const probeRef = useRef<HTMLSpanElement>(null);
  const labelRefs = useRef<Partial<Record<CalloutId, HTMLDivElement | null>>>({});
  const lineRefs = useRef<Partial<Record<CalloutId, SVGLineElement | null>>>({});
  const dotRefs = useRef<Partial<Record<CalloutId, SVGCircleElement | null>>>({});
  const [fallback, setFallback] = useState(false);
  // The meshes arrive from a worker; the plate fades in on its first frame.
  const [ready, setReady] = useState(false);
  const onFallbackRef = useRef(onFallback);
  onFallbackRef.current = onFallback;
  useEffect(() => {
    if (fallback) onFallbackRef.current?.();
  }, [fallback]);

  // Latest props, readable from the rAF loop without restarting it.
  const props = useRef({ exploded, paused, reduced });
  props.current = { exploded, paused, reduced };
  const kick = useRef<() => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const probe = probeRef.current;
    if (!canvas || !wrap || !probe) return;

    /** Everything that needs the model: renderer, loop, observers. Returns its teardown. */
    const start = (model: BitModel): (() => void) => {
      const renderer = new PlateRenderer(canvas);
      if (!renderer.init(model)) throw new Error("no webgl2");
      renderer.setPalette(readPalette(probe));

      let raf = 0;
      let lost = false;
      let onScreen = true;
      let clock = 0; // seconds of animation actually shown — stops while paused
      let last = performance.now();
      let explode = props.current.reduced ? 1 : 0;
      let az = AZ0;
      let el = EL0;
      const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
      let frames = 0;
      let fpsT = last;
      let wide = true;
      // Frame governor: a GPU that cannot hold ~25 fps first loses DPR 2, then
      // the animation. The plate stays; only the motion goes.
      let dpr = Math.min(2, window.devicePixelRatio || 1);
      let slow = 0;
      let degraded = false;

      const place = (p: Projection | null) => {
        if (!p) return;
        const w = wrap.clientWidth;
        const show = wide;
        // Callouts stand in a column right of the bit, in anchor order, never
        // closer than 46 px to each other.
        const rows = CALLOUTS.map((c) => ({ c, a: p.anchors[c.id] })).sort((a, b) => a.a.y - b.a.y);
        const colX = Math.min(w - 196, Math.max(p.right + 28, 0));
        let prevY = -Infinity;
        for (const { c, a } of rows) {
          const label = labelRefs.current[c.id];
          const line = lineRefs.current[c.id];
          const dot = dotRefs.current[c.id];
          if (!label || !line || !dot) continue;
          let y = Math.max(a.y - 14, prevY + 46);
          y = Math.min(y, wrap.clientHeight - 60);
          prevY = y;
          label.style.transform = `translate(${colX}px, ${y}px)`;
          label.style.opacity = show ? "1" : "0";
          line.setAttribute("x1", String(a.x));
          line.setAttribute("y1", String(a.y));
          line.setAttribute("x2", String(colX - 6));
          line.setAttribute("y2", String(y + 9));
          dot.setAttribute("cx", String(a.x));
          dot.setAttribute("cy", String(a.y));
        }
      };

      const draw = () => {
        if (lost) return;
        place(renderer.render({ explode, azimuth: az, elevation: el }));
      };

      const shouldRun = () =>
        !lost && !degraded && onScreen && !document.hidden && !props.current.paused && !props.current.reduced;

      const tick = (now: number) => {
        raf = 0;
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        clock += dt;
        const target = props.current.exploded;
        if (target === null) explode = autoExplode(clock);
        else {
          const goal = target ? 1 : 0;
          const step = dt / CYCLE.move;
          explode = explode < goal ? Math.min(goal, explode + step) : Math.max(goal, explode - step);
        }
        // A slow orbit, like a turntable that never quite completes its turn,
        // plus a little parallax toward the pointer.
        pointer.sx += (pointer.x - pointer.sx) * Math.min(1, dt * 3);
        pointer.sy += (pointer.y - pointer.sy) * Math.min(1, dt * 3);
        az = AZ0 + 0.17 * Math.sin((clock / 26) * Math.PI * 2) + pointer.sx * 0.07;
        el = EL0 + 0.03 * Math.sin((clock / 19) * Math.PI * 2) - pointer.sy * 0.04;
        draw();
        frames++;
        if (now - fpsT > 1000) {
          const fps = Math.round((frames * 1000) / (now - fpsT));
          canvas.dataset.fps = String(fps);
          frames = 0;
          fpsT = now;
          slow = fps < 25 ? slow + 1 : 0;
          if (slow >= 2) {
            slow = 0;
            if (dpr > 1) {
              dpr = 1;
              resize();
            } else {
              degraded = true;
              canvas.dataset.degraded = "static";
            }
          }
        }
        if (shouldRun()) raf = requestAnimationFrame(tick);
      };

      const ensure = () => {
        if (shouldRun()) {
          if (!raf) {
            last = performance.now();
            raf = requestAnimationFrame(tick);
          }
        } else {
          if (raf) cancelAnimationFrame(raf);
          raf = 0;
          // One composed frame for the current state: reduced motion shows the
          // assembly exploded (or as chosen), square to the camera.
          if (props.current.reduced) {
            explode = props.current.exploded === false ? 0 : 1;
            az = AZ0;
            el = EL0;
          } else if (props.current.exploded !== null || degraded) {
            // Paused, but the viewer asked for the other state: jump to it.
            explode = props.current.exploded === false ? 0 : 1;
          }
          draw();
        }
      };
      kick.current = ensure;

      const resize = () => {
        const w = wrap.clientWidth;
        const h = wrap.clientHeight;
        wide = window.matchMedia(LG).matches && w >= 600;
        // Fill-rate budget: measured on an M4, 5 Mpx with 4× MSAA halves the
        // frame rate. Cap the buffer at ~3.2 Mpx; small canvases keep DPR 2.
        const budget = Math.sqrt(3.2e6 / Math.max(1, w * h));
        renderer.resize(w, h, Math.min(dpr, budget));
        renderer.setLayout(layoutFor(w));
        draw();
      };
      const ro = new ResizeObserver(resize);
      ro.observe(wrap);
      resize();

      const io = new IntersectionObserver(([e]) => {
        onScreen = e.isIntersecting;
        ensure();
      });
      io.observe(wrap);
      const onVis = () => ensure();
      document.addEventListener("visibilitychange", onVis);

      const theme = new MutationObserver(() => {
        renderer.setPalette(readPalette(probe));
        draw();
      });
      theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

      const onMove = (e: PointerEvent) => {
        const r = wrap.getBoundingClientRect();
        pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
        pointer.y = ((e.clientY - r.top) / r.height) * 2 - 1;
      };
      wrap.addEventListener("pointermove", onMove);

      const onLost = (e: Event) => {
        e.preventDefault(); // tells the browser we will restore
        lost = true;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
      };
      const onRestored = () => {
        if (!renderer.init(model)) {
          setFallback(true);
          return;
        }
        lost = false;
        renderer.setPalette(readPalette(probe));
        resize();
        ensure();
      };
      canvas.addEventListener("webglcontextlost", onLost);
      canvas.addEventListener("webglcontextrestored", onRestored);

      ensure();
      canvas.dataset.vertices = String(model.stats.vertices);
      canvas.dataset.triangles = String(model.stats.triangles);
      canvas.dataset.buildMs = String(model.stats.buildMs);
      setReady(true);

      return () => {
        if (raf) cancelAnimationFrame(raf);
        ro.disconnect();
        io.disconnect();
        theme.disconnect();
        document.removeEventListener("visibilitychange", onVis);
        wrap.removeEventListener("pointermove", onMove);
        canvas.removeEventListener("webglcontextlost", onLost);
        canvas.removeEventListener("webglcontextrestored", onRestored);
        renderer.dispose();
      };
    };

    // No GPU, no model: decided before anything is built.
    if (!hardwareContext(canvas)) {
      setFallback(true);
      return;
    }
    let stop: (() => void) | null = null;
    let cancelled = false;
    loadModel().then(
      (model) => {
        if (cancelled) return;
        try {
          stop = start(model);
        } catch {
          setFallback(true);
        }
      },
      () => !cancelled && setFallback(true),
    );
    return () => {
      cancelled = true;
      stop?.();
      // Release the context only once the canvas has really gone — StrictMode
      // remounts onto the same element, and a lost context cannot be reused.
      setTimeout(() => {
        if (!canvas.isConnected) canvas.getContext("webgl2")?.getExtension("WEBGL_lose_context")?.loseContext();
      }, 0);
    };
  }, []);

  // Prop changes (pause, explode choice, reduced motion) only need the loop re-evaluated.
  useEffect(() => {
    kick.current();
  }, [exploded, paused, reduced]);

  return (
    <div ref={wrapRef} className={cn("relative h-full w-full", className)} aria-hidden="true">
      <span ref={probeRef} className="pointer-events-none absolute size-0 overflow-hidden" />
      {fallback ? (
        <div className="absolute inset-0 grid place-items-center p-8 lg:py-24 lg:pl-[48%]">
          <Fallback />
        </div>
      ) : (
        <>
          <canvas
            ref={canvasRef}
            className={cn(
              "absolute inset-0 size-full",
              !reduced && "transition-opacity duration-slower ease-out",
              ready ? "opacity-100" : "opacity-0",
            )}
          />
          <svg className="pointer-events-none absolute inset-0 hidden size-full overflow-visible lg:block">
            {CALLOUTS.map((c) => (
              <g key={c.id}>
                <line
                  ref={(el) => {
                    lineRefs.current[c.id] = el;
                  }}
                  className="stroke-muted-foreground"
                  strokeWidth={0.75}
                />
                <circle
                  ref={(el) => {
                    dotRefs.current[c.id] = el;
                  }}
                  r={2.75}
                  className="fill-card stroke-primary"
                  strokeWidth={1.25}
                />
              </g>
            ))}
          </svg>
          <div className="pointer-events-none absolute inset-0 hidden lg:block">
            {CALLOUTS.map((c) => (
              <div
                key={c.id}
                ref={(el) => {
                  labelRefs.current[c.id] = el;
                }}
                className="absolute left-0 top-0 w-44 opacity-0"
              >
                <p className="font-serif text-sm italic leading-tight text-foreground">{c.title}</p>
                <p className="mt-0.5 text-2xs uppercase tracking-wider text-muted-foreground">{c.spec}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
